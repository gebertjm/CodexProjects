import { getSmsTemplate } from './smsTemplateRegistry.js';

export class SmsTemplateRenderError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SmsTemplateRenderError';
    this.statusCode = 400;
    this.details = details;
  }
}

const HARD_LENGTH_WARNING = 300;
const unsafeVariableNamePattern =
  /(^|_)(debug|internal|hidden|secret|private|gm|raw|json|flag|scaling|math|account_id|campaign_id|character_id|scene_id|encounter_id)($|_)/i;
const unsafeRenderedPatterns = [
  /\bundefined\b/i,
  /\bnull\b/i,
  /\[object Object\]/i,
  /\bdebug\b/i,
  /\binternal_id\b/i,
  /\bhidden_flag\b/i,
  /\bencounter_power\b/i,
  /\bparty_power\b/i,
  /\bscaling math\b/i,
  /\{".*"\}/,
];

function normalizeTemplateOptions(template) {
  return {
    allowed: false,
    required: false,
    min: 0,
    max: 0,
    ...(template.options ?? {}),
  };
}

function normalizeVariables(variables) {
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    return {};
  }

  return variables;
}

function isMissingValue(value) {
  return value === undefined || value === null || value === '';
}

function renderScalar(value, variableName) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'object') {
    throw new SmsTemplateRenderError(`Variable "${variableName}" must be a string, number, or boolean`, {
      variable: variableName,
    });
  }

  return String(value).trim();
}

function formatOptions(template, variables) {
  const config = normalizeTemplateOptions(template);
  const rawOptions = variables.options;

  if (!config.allowed && rawOptions !== undefined) {
    throw new SmsTemplateRenderError(`Template "${template.template_id}" does not allow options`, {
      template_id: template.template_id,
    });
  }

  if (!config.allowed) {
    return {
      text: '',
      count: 0,
      warnings: [],
    };
  }

  if (!Array.isArray(rawOptions)) {
    if (config.required) {
      throw new SmsTemplateRenderError(`Template "${template.template_id}" requires an options array`, {
        template_id: template.template_id,
      });
    }

    return {
      text: '',
      count: 0,
      warnings: [],
    };
  }

  const count = rawOptions.length;

  if (count < config.min || count > config.max) {
    throw new SmsTemplateRenderError(
      `Template "${template.template_id}" requires ${config.min}-${config.max} options; received ${count}`,
      {
        template_id: template.template_id,
        option_count: count,
      }
    );
  }

  const labels = rawOptions.map((option, index) => {
    const label =
      typeof option === 'string'
        ? option
        : option && typeof option === 'object'
          ? option.label ?? option.text ?? option.title
          : null;

    if (isMissingValue(label)) {
      throw new SmsTemplateRenderError(`Option ${index + 1} is missing a player-facing label`, {
        template_id: template.template_id,
        option_index: index,
      });
    }

    return String(label).replace(/\s+/g, ' ').trim();
  });

  return {
    text: labels.map((label, index) => `${index + 1}) ${label}`).join('\n'),
    count,
    warnings: [],
  };
}

function resolveVariationValue(template, variableName, variables) {
  const allowedValues = template.variation_slots?.[variableName];

  if (!allowedValues) {
    return null;
  }

  const suppliedValue = variables[variableName];

  if (suppliedValue === undefined || suppliedValue === null || suppliedValue === '') {
    return allowedValues[0] ?? '';
  }

  if (!allowedValues.includes(suppliedValue)) {
    throw new SmsTemplateRenderError(
      `Variation "${variableName}" for template "${template.template_id}" is not allowed`,
      {
        template_id: template.template_id,
        variable: variableName,
      }
    );
  }

  return suppliedValue;
}

function validateRequiredVariables(template, variables) {
  const missing = [];

  for (const variableName of template.required_variables ?? []) {
    if (variableName === 'options') {
      if (!Array.isArray(variables.options)) {
        missing.push(variableName);
      }
      continue;
    }

    if (isMissingValue(variables[variableName])) {
      missing.push(variableName);
    }
  }

  if (missing.length > 0) {
    throw new SmsTemplateRenderError(`Missing required SMS template variables: ${missing.join(', ')}`, {
      template_id: template.template_id,
      missing,
    });
  }
}

function validatePlayerFacingOutput(message, template) {
  for (const pattern of unsafeRenderedPatterns) {
    if (pattern.test(message)) {
      throw new SmsTemplateRenderError(
        `Rendered SMS for "${template.template_id}" contains unsafe player-facing output`,
        {
          template_id: template.template_id,
        }
      );
    }
  }
}

function collectWarnings(message, template, optionCount) {
  const warnings = [];
  const length = message.length;
  const guidance = template.max_length_guidance ?? 160;

  if (length > guidance) {
    warnings.push({
      code: 'sms.length_guidance_exceeded',
      message: `Rendered SMS length ${length} exceeds guidance ${guidance}`,
      length,
      max_length_guidance: guidance,
    });
  }

  if (length > HARD_LENGTH_WARNING) {
    warnings.push({
      code: 'sms.length_hard_warning',
      message: `Rendered SMS length ${length} exceeds hard warning threshold ${HARD_LENGTH_WARNING}`,
      length,
      hard_warning_threshold: HARD_LENGTH_WARNING,
    });
  }

  if (optionCount > 0 && (optionCount < 2 || optionCount > 4)) {
    warnings.push({
      code: 'sms.option_count_outside_guidance',
      message: `Rendered SMS has ${optionCount} options; SMS prompts should use 2-4 options`,
      option_count: optionCount,
    });
  }

  return warnings;
}

export function renderSmsTemplate(templateId, variables = {}) {
  const template = getSmsTemplate(templateId);

  if (!template) {
    throw new SmsTemplateRenderError(`Unknown SMS template ID: ${templateId}`, {
      template_id: templateId,
    });
  }

  const normalizedVariables = normalizeVariables(variables);
  validateRequiredVariables(template, normalizedVariables);

  const formattedOptions = formatOptions(template, normalizedVariables);

  let message = template.body.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, variableName) => {
    if (variableName === 'options') {
      return formattedOptions.text;
    }

    const variationValue = resolveVariationValue(template, variableName, normalizedVariables);

    if (variationValue !== null) {
      return variationValue;
    }

    if (
      !template.required_variables.includes(variableName) &&
      !template.optional_variables.includes(variableName)
    ) {
      throw new SmsTemplateRenderError(
        `Template "${template.template_id}" references undeclared variable "${variableName}"`,
        {
          template_id: template.template_id,
          variable: variableName,
        }
      );
    }

    return renderScalar(normalizedVariables[variableName], variableName);
  });

  message = message
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();

  validatePlayerFacingOutput(message, template);

  return {
    template_id: template.template_id,
    category: template.category,
    message,
    warnings: collectWarnings(message, template, formattedOptions.count),
    metadata: {
      length: message.length,
      option_count: formattedOptions.count,
      max_length_guidance: template.max_length_guidance,
    },
  };
}

export function validateSmsTemplateDefinition(template) {
  const errors = [];
  const placeholderNames = Array.from(template.body.matchAll(/\{([a-zA-Z0-9_]+)\}/g)).map(
    (match) => match[1]
  );
  const declaredNames = new Set([
    ...(template.required_variables ?? []),
    ...(template.optional_variables ?? []),
    ...Object.keys(template.variation_slots ?? {}),
  ]);

  if (!template.template_id) {
    errors.push('template_id is required');
  }

  if (!template.category) {
    errors.push(`${template.template_id}: category is required`);
  }

  if (!Array.isArray(template.required_variables) || template.required_variables.length === 0) {
    errors.push(`${template.template_id}: at least one required variable is required`);
  }

  if (!template.description) {
    errors.push(`${template.template_id}: description is required`);
  }

  if (!template.body) {
    errors.push(`${template.template_id}: body is required`);
  }

  if (!template.example_output) {
    errors.push(`${template.template_id}: example_output is required`);
  }

  if (!template.example_variables || typeof template.example_variables !== 'object') {
    errors.push(`${template.template_id}: example_variables is required`);
  }

  for (const variableName of [...declaredNames]) {
    if (unsafeVariableNamePattern.test(variableName)) {
      errors.push(`${template.template_id}: unsafe variable name "${variableName}"`);
    }
  }

  for (const placeholderName of placeholderNames) {
    if (placeholderName === 'options') {
      continue;
    }

    if (!declaredNames.has(placeholderName)) {
      errors.push(`${template.template_id}: undeclared placeholder "${placeholderName}"`);
    }
  }

  const optionConfig = normalizeTemplateOptions(template);

  if (optionConfig.allowed) {
    if (optionConfig.min < 2 || optionConfig.max > 4 || optionConfig.min > optionConfig.max) {
      errors.push(`${template.template_id}: option bounds must be within 2-4`);
    }
  }

  if (!optionConfig.allowed && placeholderNames.includes('options')) {
    errors.push(`${template.template_id}: options placeholder is present but options are not allowed`);
  }

  return errors;
}
