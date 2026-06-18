import { createHttpError } from '../utils/httpError.js';

export const RESULT_BANDS = [
  'failure',
  'partial_success',
  'success',
  'great_success',
  'critical_success',
];

function normalizeNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBands(interaction) {
  const raw = interaction?.result_bands_json ?? interaction?.result_bands ?? [];
  return Array.isArray(raw) ? raw : [];
}

export function validateResultBands(resultBands = []) {
  const errors = [];

  if (!Array.isArray(resultBands)) {
    return {
      ok: false,
      errors: ['result_bands must be an array'],
    };
  }

  const ranges = [];

  resultBands.forEach((band, index) => {
    if (!band || typeof band !== 'object' || Array.isArray(band)) {
      errors.push(`result_bands[${index}] must be an object`);
      return;
    }

    if (!RESULT_BANDS.includes(band.band)) {
      errors.push(`result_bands[${index}].band must be one of ${RESULT_BANDS.join(', ')}`);
    }

    if (typeof band.text !== 'string' || band.text.trim() === '') {
      errors.push(`result_bands[${index}].text is required`);
    }

    const min = normalizeNumber(band.min_total);
    const max = normalizeNumber(band.max_total);

    if (band.min_total !== undefined && min === null) {
      errors.push(`result_bands[${index}].min_total must be numeric`);
    }

    if (band.max_total !== undefined && max === null) {
      errors.push(`result_bands[${index}].max_total must be numeric`);
    }

    if (min !== null && max !== null && min > max) {
      errors.push(`result_bands[${index}] min_total cannot exceed max_total`);
    }

    if (min !== null || max !== null) {
      ranges.push({
        index,
        min: min ?? Number.NEGATIVE_INFINITY,
        max: max ?? Number.POSITIVE_INFINITY,
      });
    }

    for (const knowledgeId of band.knowledge_grants ?? []) {
      if (typeof knowledgeId !== 'string' || knowledgeId.trim() === '') {
        errors.push(`result_bands[${index}] has an invalid knowledge grant`);
      }
    }

    for (const change of band.state_changes ?? []) {
      if (!change || typeof change !== 'object' || Array.isArray(change)) {
        errors.push(`result_bands[${index}] contains an invalid state change`);
        continue;
      }

      if (!['affordance', 'scene', 'location', 'entity', 'objective'].includes(change.target_type)) {
        errors.push(`result_bands[${index}] has invalid state change target_type`);
      }

      if (typeof change.target_id !== 'string' || change.target_id.trim() === '') {
        errors.push(`result_bands[${index}] state change target_id is required`);
      }
    }
  });

  for (let leftIndex = 0; leftIndex < ranges.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ranges.length; rightIndex += 1) {
      const left = ranges[leftIndex];
      const right = ranges[rightIndex];

      if (left.min <= right.max && right.min <= left.max) {
        errors.push(`result_bands[${left.index}] overlaps result_bands[${right.index}]`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function resolveResultBand({ interaction, checkTotal, fallbackBand = null }) {
  const bands = normalizeBands(interaction);
  const environmentalModifiers = Array.isArray(interaction?.environment_modifiers)
    ? interaction.environment_modifiers
    : [];
  const baseTotal = normalizeNumber(checkTotal);
  const modifierTotal = environmentalModifiers.reduce(
    (sum, modifier) => sum + Number(modifier.modifier ?? 0),
    0
  );
  const total = baseTotal === null ? null : baseTotal + modifierTotal;

  if (bands.length === 0) {
    throw createHttpError('Interaction has no authored result bands', 400);
  }

  let selected = null;

  if (total !== null) {
    selected = bands.find((band) => {
      const min = normalizeNumber(band.min_total);
      const max = normalizeNumber(band.max_total);
      return (min === null || total >= min) && (max === null || total <= max);
    });
  }

  if (!selected && fallbackBand) {
    selected = bands.find((band) => band.band === fallbackBand);
  }

  if (!selected) {
    throw createHttpError('No authored result band matched the supplied check total', 400);
  }

  return {
    band: selected.band,
    text: selected.text,
    check_total: total,
    base_check_total: baseTotal,
    knowledge_grants: selected.knowledge_grants ?? [],
    state_changes: selected.state_changes ?? [],
    objective_updates: selected.objective_updates ?? [],
    mechanical_details: {
      environment_modifiers: environmentalModifiers.map((modifier) => ({
        modifier_key: modifier.modifier_key ?? null,
        modifier: Number(modifier.modifier ?? 0),
        reason: modifier.reason ?? null,
      })),
    },
    metadata: selected.metadata ?? {},
    raw: selected,
  };
}
