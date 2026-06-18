import {
  INTERACTION_PRIMITIVE_ORDER,
  INTERACTION_PRIMITIVES,
  isInteractionPrimitive,
} from './primitiveTypes.js';

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function slugText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function sourceFields(spec) {
  const raw = spec.source_fields ?? spec.sourceFields ?? spec.source_field ?? spec.sourceField;
  if (Array.isArray(raw)) {
    return raw.map(cleanText).filter(Boolean);
  }
  const single = cleanText(raw);
  return single ? [single] : [];
}

function normalizeRawItem(rawValue) {
  if (typeof rawValue === 'string') {
    return { text: rawValue };
  }
  return normalizeObject(rawValue);
}

function collectSourceItems(content, spec) {
  const items = [];
  for (const sourceField of sourceFields(spec)) {
    if (!Object.prototype.hasOwnProperty.call(content, sourceField)) {
      continue;
    }
    const rawValue = content[sourceField];
    const rawItems = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const rawItem of rawItems) {
      const definition = normalizeRawItem(rawItem);
      if (Object.keys(definition).length === 0) {
        continue;
      }
      items.push({ sourceField, definition });
    }
  }
  return items;
}

function primitiveId({ definition, primitive, domainType, index }) {
  const explicit = cleanText(
    definition.interaction_id ??
      definition.interactionId ??
      definition.id ??
      definition.slug ??
      definition.key
  );
  if (explicit) {
    return explicit;
  }
  return `${domainType || primitive}_${index + 1}`;
}

function primitiveLabel(definition, fallback) {
  return (
    cleanText(definition.label ?? definition.title ?? definition.name ?? definition.summary) ||
    fallback ||
    null
  );
}

function targetId(definition) {
  return cleanText(
    definition.target_id ??
      definition.targetId ??
      definition.affordance_id ??
      definition.npc_id ??
      definition.speaker_id
  );
}

function normalizePrimitiveRecord({
  domain,
  primitive,
  spec,
  sourceField,
  definition,
  index,
}) {
  const domainType = cleanText(spec.domain_type ?? spec.domainType) || primitive;
  const domainCollection =
    cleanText(spec.domain_collection ?? spec.domainCollection) || sourceField || domainType;
  const interactionId = primitiveId({ definition, primitive, domainType, index });
  const label = primitiveLabel(definition, spec.default_label ?? spec.defaultLabel ?? domainType);

  return {
    primitive_type: primitive,
    domain,
    domain_collection: domainCollection,
    domain_type: domainType,
    source_field: sourceField,
    interaction_id: interactionId,
    target_id: targetId(definition) || null,
    label,
    sort_order: Number.isFinite(Number(definition.priority ?? definition.sort_order))
      ? Number(definition.priority ?? definition.sort_order)
      : index,
    definition,
  };
}

function normalizeFieldMap(fieldMap = {}) {
  const normalized = {};
  for (const [primitive, spec] of Object.entries(fieldMap)) {
    if (!isInteractionPrimitive(primitive)) {
      throw new Error(`Unknown interaction primitive "${primitive}"`);
    }
    const fields = sourceFields(spec);
    normalized[primitive] = {
      ...spec,
      source_fields: fields.length > 0 ? fields : [primitive],
    };
  }
  return normalized;
}

export function createInteractionDomainAdapter(config = {}) {
  const domain = cleanText(config.domain);
  if (!domain) {
    throw new Error('Interaction domain adapter requires a domain');
  }

  const fieldMap = normalizeFieldMap(config.field_map ?? config.fieldMap);

  function normalizeDefinitions(content = {}) {
    const normalizedContent = normalizeObject(content);
    const primitives = {};
    const byDomainCollection = {};

    for (const primitive of INTERACTION_PRIMITIVE_ORDER) {
      primitives[primitive] = [];
      const spec = fieldMap[primitive];
      if (!spec) {
        continue;
      }

      const sourceItems = collectSourceItems(normalizedContent, spec);
      primitives[primitive] = sourceItems.map((item, index) =>
        normalizePrimitiveRecord({
          domain,
          primitive,
          spec,
          sourceField: item.sourceField,
          definition: item.definition,
          index,
        })
      );

      const collectionName =
        cleanText(spec.domain_collection ?? spec.domainCollection) ||
        sourceFields(spec)[0] ||
        primitive;
      byDomainCollection[collectionName] = primitives[primitive];
    }

    return {
      domain,
      domain_label: cleanText(config.domain_label ?? config.domainLabel) || domain,
      source_model: cleanText(normalizedContent.interaction_model) || domain,
      primitives,
      by_domain_collection: byDomainCollection,
    };
  }

  return Object.freeze({
    domain,
    domain_label: cleanText(config.domain_label ?? config.domainLabel) || domain,
    primitive_mappings: Object.freeze(
      Object.fromEntries(
        Object.entries(fieldMap).map(([primitive, spec]) => [
          primitive,
          Object.freeze({
            primitive,
            domain_collection:
              cleanText(spec.domain_collection ?? spec.domainCollection) ||
              sourceFields(spec)[0] ||
              primitive,
            domain_type: cleanText(spec.domain_type ?? spec.domainType) || primitive,
            source_fields: Object.freeze([...sourceFields(spec)]),
          }),
        ])
      )
    ),
    normalizeDefinitions,
  });
}

export function emptyInteractionAdapterResult(domain) {
  return {
    domain,
    primitives: Object.fromEntries(
      Object.values(INTERACTION_PRIMITIVES).map((primitive) => [primitive, []])
    ),
    by_domain_collection: {},
  };
}
