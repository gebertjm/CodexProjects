import {
  REQUIRED_SMS_TEMPLATE_IDS,
  SMS_TEMPLATE_CATEGORIES,
  listSmsTemplates,
} from './smsTemplateRegistry.js';
import {
  renderSmsTemplate,
  validateSmsTemplateDefinition,
} from './smsOutboundFormatter.js';

export function validateSmsTemplateRegistry() {
  const templates = listSmsTemplates();
  const templateIds = new Set(templates.map((template) => template.template_id));
  const categories = new Set(Object.values(SMS_TEMPLATE_CATEGORIES));
  const errors = [];
  const warnings = [];

  for (const requiredId of REQUIRED_SMS_TEMPLATE_IDS) {
    if (!templateIds.has(requiredId)) {
      errors.push(`Missing required SMS template: ${requiredId}`);
    }
  }

  for (const template of templates) {
    if (!categories.has(template.category)) {
      errors.push(`${template.template_id}: unknown category "${template.category}"`);
    }

    errors.push(...validateSmsTemplateDefinition(template));

    try {
      const rendered = renderSmsTemplate(template.template_id, template.example_variables);

      if (rendered.warnings.length > 0) {
        warnings.push(
          ...rendered.warnings.map((warning) => `${template.template_id}: ${warning.message}`)
        );
      }
    } catch (error) {
      errors.push(`${template.template_id}: example render failed: ${error.message}`);
    }
  }

  return {
    ok: errors.length === 0,
    template_count: templates.length,
    required_template_count: REQUIRED_SMS_TEMPLATE_IDS.length,
    errors,
    warnings,
  };
}
