import {
  ANNOTATION_LIFECYCLE_STATUSES,
  ANNOTATION_REVIEW_STATUSES,
  CORRECTION_LIFECYCLE_STATUSES,
  CORRECTION_REVIEW_STATUSES,
  DIALOGUE_CHECK_MODES,
  DIALOGUE_CHECK_VISIBILITIES,
  DIALOGUE_EXIT_TYPES,
  DIALOGUE_SCENE_MODELS,
  DIALOGUE_SCENE_TYPES,
  DIALOGUE_TRANSITION_TARGET_TYPES,
  PLAYER_SAFE_SOURCE_VISIBILITIES,
  RELATIONSHIP_FIELD_TYPES,
  RELATIONSHIP_STATE_SCOPES,
  RELATIONSHIP_VISIBILITIES,
  RELATIONSHIP_WRITE_OPERATIONS,
  SOCIAL_MOVE_TYPES,
} from '../services/dialogueFocusCommit/dialogueFocusCommitSchema.js';

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function lower(value) {
  return cleanText(value).toLowerCase();
}

function textFrom(value) {
  if (typeof value === 'string') {
    return cleanText(value);
  }
  if (!isPlainObject(value)) {
    return '';
  }
  return cleanText(
    value.text ??
      value.narration ??
      value.summary ??
      value.result_summary ??
      value.npc_response ??
      value.description
  );
}

function hasAuthoredText(value) {
  return textFrom(value) !== '';
}

function itemId(item, keys) {
  for (const key of keys) {
    const value = cleanText(item?.[key]);
    if (value) {
      return value;
    }
  }
  return '';
}

function add(issueList, code, path, message, details = {}) {
  issueList.push({
    code,
    path,
    message,
    ...details,
  });
}

function issueText(issue) {
  return `${issue.path}: ${issue.message}`;
}

function validateEnum(ctx, value, allowedValues, path, label, { required = false } = {}) {
  const normalized = cleanText(value);
  if (!normalized) {
    if (required) {
      add(ctx.hard_errors, 'missing_required_value', path, `${label} is required`);
    }
    return '';
  }
  if (!allowedValues.includes(normalized)) {
    add(
      ctx.hard_errors,
      'invalid_enum',
      path,
      `${label} must be one of: ${allowedValues.join(', ')}`
    );
  }
  return normalized;
}

function validateUniqueIds(ctx, items, keys, path, label) {
  const seen = new Map();
  for (const [index, item] of items.entries()) {
    const id = itemId(item, keys);
    const itemPath = `${path}[${index}]`;
    if (!id) {
      add(ctx.hard_errors, 'missing_required_id', itemPath, `${label} requires a stable ID`);
      continue;
    }
    if (seen.has(id)) {
      add(
        ctx.hard_errors,
        'duplicate_id',
        itemPath,
        `${label} ID "${id}" duplicates ${seen.get(id)}`
      );
    } else {
      seen.set(id, itemPath);
    }
  }
}

function normalizeDefinitions(scene) {
  const raw =
    normalizeArray(scene.relationship_state_definitions).length > 0
      ? scene.relationship_state_definitions
      : normalizeArray(scene.relationship_context?.definitions ?? scene.relationship_context?.fields);
  return raw;
}

function normalizeRelationshipScope(value) {
  const scope = cleanText(value);
  if (scope === 'character_npc' || scope === 'npc_relationship') {
    return 'persistent_npc_state';
  }
  if (scope === 'scene_local' || scope === 'dialogue_posture') {
    return 'dialogue_scene_state';
  }
  return scope;
}

function relationshipField(definition) {
  return itemId(definition, ['field', 'field_name', 'key', 'id']);
}

function relationshipValues(definition) {
  return normalizeArray(definition.values ?? definition.ladder_values ?? definition.ladder_values_json);
}

function buildRelationshipDefinitions(ctx, scene) {
  const definitions = normalizeDefinitions(scene);
  const byField = new Map();
  const grouped = new Map();

  for (const [index, definition] of definitions.entries()) {
    const field = relationshipField(definition);
    if (!field) {
      add(ctx.hard_errors, 'missing_required_id', `relationship_state_definitions[${index}]`, 'relationship state definition requires a stable field/key/id');
      continue;
    }
    const entries = grouped.get(field) ?? [];
    entries.push({ definition, index });
    grouped.set(field, entries);
  }

  for (const [field, entries] of grouped.entries()) {
    if (entries.length <= 1) {
      continue;
    }
    const baseValues = relationshipValues(entries[0].definition);
    for (const entry of entries.slice(1)) {
      const definition = entry.definition;
      const path = `relationship_state_definitions[${entry.index}]`;
      const explicitOverride =
        definition.override === true ||
        cleanText(definition.override_of) ||
        cleanText(definition.override_behavior) ||
        (isPlainObject(definition.override_metadata) && definition.override_metadata.override === true);
      if (!explicitOverride) {
        add(
          ctx.hard_errors,
          'relationship_field_collision',
          path,
          `relationship field "${field}" collides with another definition and must be marked as an override`
        );
      }
      const behavior = cleanText(definition.override_behavior ?? definition.override_metadata?.behavior);
      if (behavior === 'replacement' && !cleanText(definition.override_reason ?? definition.override_metadata?.reason)) {
        add(
          ctx.hard_errors,
          'missing_override_reason',
          `${path}.override_reason`,
          `replacement override for "${field}" requires an authored reason`
        );
      }
      const values = relationshipValues(definition);
      const hasNonMatchingValue = values.some((value) => !baseValues.includes(value));
      if (hasNonMatchingValue && !isPlainObject(definition.override_mapping ?? definition.migration_mapping)) {
        add(
          ctx.hard_errors,
          'missing_override_mapping',
          `${path}.override_mapping`,
          `relationship field override "${field}" has non-matching ladder values and needs an authored mapping`
        );
      }
    }
  }

  for (const [index, definition] of definitions.entries()) {
    const path = `relationship_state_definitions[${index}]`;
    if (!isPlainObject(definition)) {
      add(ctx.hard_errors, 'invalid_shape', path, 'relationship state definition must be an object');
      continue;
    }

    const field = relationshipField(definition);
    const scope = validateEnum(ctx, normalizeRelationshipScope(definition.scope ?? definition.ownership_default), RELATIONSHIP_STATE_SCOPES, `${path}.scope`, 'relationship state scope', {
      required: true,
    });
    const type = validateEnum(ctx, definition.type ?? definition.value_type, RELATIONSHIP_FIELD_TYPES, `${path}.type`, 'relationship field type', {
      required: true,
    });

    if (field) {
      const entries = byField.get(field) ?? [];
      entries.push({
        ...definition,
        field,
        scope,
        type,
      });
      byField.set(field, entries);
    }

    validateEnum(
      ctx,
      definition.shorthand_behavior ?? 'allow_unambiguous',
      ['explicit_only', 'allow_unambiguous', 'disabled'],
      `${path}.shorthand_behavior`,
      'relationship shorthand behavior'
    );

    for (const [scopeIndex, allowedScope] of normalizeArray(definition.allowed_write_scopes).entries()) {
      validateEnum(
        ctx,
        normalizeRelationshipScope(allowedScope),
        RELATIONSHIP_STATE_SCOPES,
        `${path}.allowed_write_scopes[${scopeIndex}]`,
        'allowed write scope'
      );
    }

    if (type === 'ladder') {
      const values = relationshipValues(definition);
      if (values.length === 0) {
        add(ctx.hard_errors, 'invalid_ladder_values', `${path}.values`, 'ladder fields require values');
      }
      if (definition.default !== undefined && !values.includes(definition.default)) {
        add(
          ctx.hard_errors,
          'invalid_ladder_value',
          `${path}.default`,
          `default value "${definition.default}" is not an allowed ladder value`
        );
      }
      const labels = isPlainObject(definition.labels) ? definition.labels : {};
      for (const value of values) {
        if (!Object.prototype.hasOwnProperty.call(labels, String(value))) {
          add(
            ctx.warnings,
            'missing_ladder_label',
            `${path}.labels`,
            `ladder value "${value}" has no player/dev label`
          );
        }
      }
      for (const externalValue of normalizeArray(definition.external_values)) {
        const override = definition.override_mapping?.[String(externalValue)];
        if (!override) {
          add(
            ctx.hard_errors,
            'missing_override_mapping',
            `${path}.override_mapping`,
            `external ladder value "${externalValue}" needs an override mapping`
          );
        }
      }
    }

    if (/scene|local|temporary/i.test(field) && scope === 'persistent_npc_state') {
      add(
        ctx.warnings,
        'scene_specific_global_relationship_field',
        `${path}.scope`,
        `relationship field "${field}" looks scene-specific but is registered as persistent`
      );
    }
  }

  return byField;
}

function validateCheck(ctx, owner, path, { required = false, requireAbility = false } = {}) {
  const check = owner?.check;
  if (!isPlainObject(check)) {
    if (required) {
      add(ctx.hard_errors, 'missing_check_definition', `${path}.check`, 'checked item requires a check definition');
    }
    return null;
  }

  validateEnum(ctx, check.mode ?? owner.check_mode, DIALOGUE_CHECK_MODES, `${path}.check.mode`, 'check mode', {
    required: true,
  });
  if (requireAbility && !cleanText(check.ability ?? owner.ability)) {
    add(ctx.hard_errors, 'missing_check_ability', `${path}.check.ability`, 'checked move requires an ability');
  }
  if (!cleanText(check.skill ?? owner.skill)) {
    add(ctx.hard_errors, 'missing_check_skill', `${path}.check.skill`, 'checked item requires a skill');
  }
  const dc = Number(check.dc ?? check.difficulty_class ?? owner.dc ?? owner.difficulty_class);
  if (!Number.isFinite(dc)) {
    add(ctx.hard_errors, 'missing_check_dc', `${path}.check.dc`, 'checked item requires a numeric DC');
  }
  validateEnum(
    ctx,
    check.visibility ?? owner.check_visibility ?? (owner.resolution_mode === 'passive_social_insight' ? 'success_only' : 'visible'),
    DIALOGUE_CHECK_VISIBILITIES,
    `${path}.check.visibility`,
    'check visibility',
    { required: true }
  );

  return check;
}

function findRelationshipDefinition(relationshipDefinitions, field, scope = '') {
  const definitions = relationshipDefinitions.get(field) ?? [];
  if (!scope) {
    return definitions.length === 1 ? definitions[0] : null;
  }
  return definitions.find((definition) => definition.scope === scope) ?? null;
}

function hasRelationshipDefinition(relationshipDefinitions, field, scope = '') {
  return Boolean(findRelationshipDefinition(relationshipDefinitions, field, scope));
}

function validateWrite(ctx, write, path, relationshipDefinitions) {
  if (!isPlainObject(write)) {
    add(ctx.hard_errors, 'invalid_state_write', path, 'state write must be an object');
    return;
  }

  const scope = validateEnum(ctx, normalizeRelationshipScope(write.scope), RELATIONSHIP_STATE_SCOPES, `${path}.scope`, 'state write scope', {
    required: true,
  });
  const field = cleanText(write.field ?? write.key);
  if (!field) {
    add(ctx.hard_errors, 'missing_state_write_field', `${path}.field`, 'state write requires a field');
    return;
  }
  validateEnum(
    ctx,
    write.operation,
    RELATIONSHIP_WRITE_OPERATIONS,
    `${path}.operation`,
    'state write operation',
    { required: true }
  );
  if (!Object.prototype.hasOwnProperty.call(write, 'value') && write.operation !== 'clear') {
    add(ctx.hard_errors, 'missing_state_write_value', `${path}.value`, 'state write requires a value');
  }
  validateEnum(
    ctx,
    write.visibility,
    RELATIONSHIP_VISIBILITIES,
    `${path}.visibility`,
    'state write visibility',
    { required: true }
  );
  if (!cleanText(write.reason ?? write.provenance)) {
    add(ctx.hard_errors, 'missing_state_write_reason', `${path}.reason`, 'state write requires a reason/provenance');
  }

  const definition = findRelationshipDefinition(relationshipDefinitions, field, scope);
  if (!definition) {
    if (relationshipDefinitions.has(field)) {
      add(
        ctx.hard_errors,
        'relationship_scope_mismatch',
        `${path}.scope`,
        `field "${field}" is not registered for scope "${scope}"`
      );
    } else {
      add(
        ctx.hard_errors,
        'unregistered_relationship_field',
        `${path}.field`,
        `relationship/social state field "${field}" is not registered`
      );
    }
    return;
  }
  const allowedWriteScopes = normalizeArray(definition.allowed_write_scopes).length > 0
    ? normalizeArray(definition.allowed_write_scopes).map(normalizeRelationshipScope)
    : [definition.scope];
  if (scope && !allowedWriteScopes.includes(scope)) {
    add(
      ctx.hard_errors,
      'relationship_scope_not_allowed',
      `${path}.scope`,
      `field "${field}" cannot be written to scope "${scope}"`
    );
  }
  if (definition.type === 'ladder' && write.operation === 'set') {
    const values = relationshipValues(definition);
    if (!values.includes(write.value)) {
      add(
        ctx.hard_errors,
        'invalid_ladder_value',
        `${path}.value`,
        `value "${write.value}" is not allowed for ladder field "${field}"`
      );
    }
  }
}

function collectWrites(value) {
  if (!isPlainObject(value)) {
    return [];
  }
  return [
    ...normalizeArray(value.state_changes),
    ...normalizeArray(value.relationship_writes),
    ...normalizeArray(value.relationship_state_writes),
    ...normalizeArray(value.social_state_writes),
    ...normalizeArray(value.writes),
  ];
}

function collectRelationshipReads(value) {
  if (!isPlainObject(value)) {
    return [];
  }
  return [
    ...normalizeArray(value.relationship_reads),
    ...normalizeArray(value.relationship_state_reads),
    ...normalizeArray(value.social_state_reads),
    ...normalizeArray(value.availability?.relationship_reads),
    ...normalizeArray(value.availability?.relationship_state_reads),
  ];
}

function parseShorthandRead(value) {
  const raw = cleanText(value);
  const match = raw.match(/^([A-Za-z0-9_-]+)\s*(>=|<=|>|<|==|=|!=)\s*(.+)$/);
  if (!match) {
    return null;
  }
  return {
    field: match[1],
    operator: match[2],
    value: match[3],
  };
}

function validateRead(ctx, read, path, relationshipDefinitions) {
  if (typeof read === 'string') {
    const parsed = parseShorthandRead(read);
    if (!parsed) {
      add(ctx.hard_errors, 'ambiguous_shorthand_read', path, 'relationship/social state shorthand read could not be parsed safely');
      return;
    }
    const definitions = relationshipDefinitions.get(parsed.field) ?? [];
    if (definitions.length !== 1) {
      add(ctx.hard_errors, 'ambiguous_shorthand_read', path, `relationship/social state shorthand "${parsed.field}" is ambiguous`);
      return;
    }
    if (!cleanText(parsed.operator)) {
      add(ctx.hard_errors, 'missing_relationship_read_operator', path, 'relationship read requires an operator');
    }
    return;
  }
  if (!isPlainObject(read)) {
    add(ctx.hard_errors, 'invalid_relationship_read', path, 'relationship/social state read must be an object');
    return;
  }
  const scope = validateEnum(ctx, normalizeRelationshipScope(read.scope), RELATIONSHIP_STATE_SCOPES, `${path}.scope`, 'relationship read scope', {
    required: false,
  });
  if (!cleanText(read.target_id ?? read.target)) {
    add(ctx.hard_errors, 'missing_relationship_read_target', `${path}.target_id`, 'relationship read requires an explicit target');
  }
  const field = cleanText(read.field ?? read.key);
  if (!field) {
    add(ctx.hard_errors, 'missing_relationship_read_field', `${path}.field`, 'relationship read requires a field');
  } else if (!hasRelationshipDefinition(relationshipDefinitions, field, scope)) {
    add(
      ctx.hard_errors,
      relationshipDefinitions.has(field) ? 'relationship_scope_mismatch' : 'unregistered_relationship_field',
      `${path}.field`,
      relationshipDefinitions.has(field)
        ? `relationship/social state field "${field}" is not registered for scope "${scope}"`
        : `relationship/social state field "${field}" is not registered`
    );
  } else if (!scope && (relationshipDefinitions.get(field) ?? []).length > 1) {
    add(
      ctx.hard_errors,
      'ambiguous_shorthand_read',
      `${path}.scope`,
      `relationship/social state field "${field}" needs an explicit scope`
    );
  }
  if (!cleanText(read.operator)) {
    add(ctx.hard_errors, 'missing_relationship_read_operator', `${path}.operator`, 'relationship read requires an operator');
  }
}

function validateReadsAndWrites(ctx, owner, path, relationshipDefinitions) {
  for (const [index, read] of collectRelationshipReads(owner).entries()) {
    validateRead(ctx, read, `${path}.relationship_reads[${index}]`, relationshipDefinitions);
  }
  const shorthand = owner?.requires_state ?? owner?.relationship_state;
  if (typeof shorthand === 'string') {
    validateRead(ctx, shorthand, `${path}.relationship_state`, relationshipDefinitions);
  }
  for (const [index, write] of collectWrites(owner).entries()) {
    validateWrite(ctx, write, `${path}.state_changes[${index}]`, relationshipDefinitions);
  }
}

function branchText(branch) {
  return hasAuthoredText(branch) || hasAuthoredText(branch?.result) || hasAuthoredText(branch?.output);
}

function allMoveIds(scene) {
  return new Set(
    normalizeArray(scene.committed_social_moves)
      .map((move) => itemId(move, ['move_id', 'id', 'slug', 'key']))
      .filter(Boolean)
  );
}

function allQuestionIds(scene) {
  return new Set(
    normalizeArray(scene.clarifying_questions)
      .map((question) => itemId(question, ['question_id', 'id', 'slug', 'key']))
      .filter(Boolean)
  );
}

function allSurfaceIds(scene) {
  const surface = scene.conversation_surface;
  return new Set([itemId(surface, ['surface_id', 'id', 'slug', 'key'])].filter(Boolean));
}

function validateConversationSurface(ctx, scene) {
  const surface = scene.conversation_surface;
  if (!isPlainObject(surface)) {
    add(ctx.hard_errors, 'missing_conversation_surface', 'conversation_surface', 'dialogue scene requires a conversation_surface object');
    return;
  }
  if (!itemId(surface, ['surface_id', 'id', 'slug', 'key'])) {
    add(ctx.hard_errors, 'missing_required_id', 'conversation_surface.surface_id', 'conversation surface requires surface_id');
  }
  const paragraphs = normalizeArray(surface.paragraphs);
  if (paragraphs.length === 0) {
    add(ctx.hard_errors, 'missing_surface_paragraphs', 'conversation_surface.paragraphs', 'conversation surface requires player-facing paragraphs');
  }
  for (const [index, paragraph] of paragraphs.entries()) {
    if (!hasAuthoredText(paragraph)) {
      add(ctx.hard_errors, 'missing_surface_text', `conversation_surface.paragraphs[${index}]`, 'surface paragraph requires text');
    }
    if (paragraph.source_visibility === 'hidden_only') {
      add(
        ctx.hard_errors,
        'player_facing_hidden_source',
        `conversation_surface.paragraphs[${index}].source_visibility`,
        'player-facing surface paragraph cannot use hidden-only source'
      );
    }
  }
  if (paragraphs.length < 2) {
    add(ctx.warnings, 'short_conversation_surface', 'conversation_surface.paragraphs', 'conversation surface is very short');
  }
}

function validatePassiveInsights(ctx, scene, relationshipDefinitions) {
  const insights = normalizeArray(scene.passive_social_insight ?? scene.passive_social_insights);
  validateUniqueIds(ctx, insights, ['insight_id', 'id', 'slug', 'key', 'interaction_id'], 'passive_social_insight', 'Passive Social Insight');
  for (const [index, insight] of insights.entries()) {
    const path = `passive_social_insight[${index}]`;
    if (!isPlainObject(insight)) {
      add(ctx.hard_errors, 'invalid_shape', path, 'Passive Social Insight must be an object');
      continue;
    }
    validateCheck(ctx, insight, path, { required: insight.requires_check !== false });
    if (!branchText(insight.on_success)) {
      add(ctx.hard_errors, 'missing_result_branch', `${path}.on_success`, 'Passive Social Insight requires authored success text');
    }
    validateReadsAndWrites(ctx, insight, path, relationshipDefinitions);
    validateReadsAndWrites(ctx, insight.on_success, `${path}.on_success`, relationshipDefinitions);
    validateReadsAndWrites(ctx, insight.on_failure, `${path}.on_failure`, relationshipDefinitions);
  }
}

function validateClarifyingQuestions(ctx, scene, relationshipDefinitions) {
  const questions = normalizeArray(scene.clarifying_questions);
  validateUniqueIds(ctx, questions, ['question_id', 'id', 'slug', 'key', 'interaction_id'], 'clarifying_questions', 'Clarifying Question');
  if (questions.length === 0) {
    add(ctx.warnings, 'no_clarifying_questions', 'clarifying_questions', 'dialogue scene has no Clarifying Questions');
  }
  for (const [index, question] of questions.entries()) {
    const path = `clarifying_questions[${index}]`;
    if (!isPlainObject(question)) {
      add(ctx.hard_errors, 'invalid_shape', path, 'Clarifying Question must be an object');
      continue;
    }
    if (!cleanText(question.label ?? question.prompt)) {
      add(ctx.hard_errors, 'missing_label', `${path}.label`, 'Clarifying Question requires a label or prompt');
    }
    if (question.requires_check === true) {
      validateCheck(ctx, question, path, { required: true });
      if (!branchText(question.on_success)) {
        add(ctx.hard_errors, 'missing_result_branch', `${path}.on_success`, 'checked Clarifying Question requires success text');
      }
      if (!branchText(question.on_failure)) {
        add(ctx.hard_errors, 'missing_result_branch', `${path}.on_failure`, 'checked Clarifying Question requires failure text');
      }
    } else if (!branchText(question.result)) {
      add(ctx.hard_errors, 'missing_authored_result', `${path}.result`, 'no-check Clarifying Question requires authored result text');
    }
    if (question.emit_canonical_event === true && question.canonical === false) {
      add(
        ctx.warnings,
        'noncanonical_question_history',
        `${path}.emit_canonical_event`,
        'non-canonical Clarifying Question is marked for campaign history'
      );
    }
    if (normalizeArray(question.unlocks).length > 3) {
      add(ctx.warnings, 'deep_unlock_chain', `${path}.unlocks`, 'Clarifying Question unlock chain may be too deep');
    }
    validateReadsAndWrites(ctx, question, path, relationshipDefinitions);
    validateReadsAndWrites(ctx, question.result, `${path}.result`, relationshipDefinitions);
    validateReadsAndWrites(ctx, question.on_success, `${path}.on_success`, relationshipDefinitions);
    validateReadsAndWrites(ctx, question.on_failure, `${path}.on_failure`, relationshipDefinitions);
  }
}

function validateCommittedMoves(ctx, scene, relationshipDefinitions) {
  const moves = normalizeArray(scene.committed_social_moves);
  validateUniqueIds(ctx, moves, ['move_id', 'id', 'slug', 'key', 'interaction_id'], 'committed_social_moves', 'Committed Social Move');
  if (moves.length === 0) {
    add(ctx.warnings, 'no_committed_social_moves', 'committed_social_moves', 'dialogue scene has no committed social moves');
  }
  if (moves.length > 8) {
    add(ctx.warnings, 'many_committed_social_moves', 'committed_social_moves', 'many committed social moves may lack resolution pressure');
  }
  for (const [index, move] of moves.entries()) {
    const path = `committed_social_moves[${index}]`;
    if (!isPlainObject(move)) {
      add(ctx.hard_errors, 'invalid_shape', path, 'Committed Social Move must be an object');
      continue;
    }
    if (!cleanText(move.label)) {
      add(ctx.hard_errors, 'missing_label', `${path}.label`, 'Committed Social Move requires a label');
    }
    validateEnum(
      ctx,
      move.social_move_type,
      SOCIAL_MOVE_TYPES,
      `${path}.social_move_type`,
      'social move type',
      { required: true }
    );
    if (typeof move.requires_check !== 'boolean') {
      add(
        ctx.hard_errors,
        'missing_requires_check',
        `${path}.requires_check`,
        'Committed Social Move must explicitly declare requires_check'
      );
    }
    if (!isPlainObject(move.preview) || !hasAuthoredText(move.preview)) {
      add(ctx.hard_errors, 'missing_preview_behavior', `${path}.preview`, 'Committed Social Move requires authored preview behavior');
    }
    const consumesBeat = move.consumes_dialogue_beat ?? move.consumes_beat ?? move.beat_cost;
    if (consumesBeat === undefined || consumesBeat === null) {
      add(ctx.hard_errors, 'missing_beat_cost', `${path}.beat_cost`, 'Committed Social Move requires explicit beat cost/consumption metadata');
    }
    if (move.requires_check === true) {
      validateCheck(ctx, move, path, { required: true, requireAbility: true });
      if (!branchText(move.on_success)) {
        add(ctx.hard_errors, 'missing_result_branch', `${path}.on_success`, 'checked Committed Social Move requires success branch text');
      }
      if (!branchText(move.on_failure)) {
        add(ctx.hard_errors, 'missing_result_branch', `${path}.on_failure`, 'checked Committed Social Move requires failure branch text');
      }
    } else if (move.requires_check === false) {
      const hasResult =
        branchText(move.result) ||
        branchText(move.no_check_result) ||
        normalizeArray(move.variants).some((variant) => branchText(variant.result ?? variant));
      if (!hasResult) {
        add(
          ctx.hard_errors,
          'missing_authored_result',
          `${path}.result`,
          'no-check Committed Social Move requires authored result behavior'
        );
      }
    }
    validateReadsAndWrites(ctx, move, path, relationshipDefinitions);
    validateReadsAndWrites(ctx, move.result, `${path}.result`, relationshipDefinitions);
    validateReadsAndWrites(ctx, move.no_check_result, `${path}.no_check_result`, relationshipDefinitions);
    validateReadsAndWrites(ctx, move.on_success, `${path}.on_success`, relationshipDefinitions);
    validateReadsAndWrites(ctx, move.on_failure, `${path}.on_failure`, relationshipDefinitions);
    for (const [variantIndex, variant] of normalizeArray(move.variants).entries()) {
      validateReadsAndWrites(ctx, variant, `${path}.variants[${variantIndex}]`, relationshipDefinitions);
    }
  }
}

function validateGenericFallback(ctx, scene, relationshipDefinitions) {
  const fallback = scene.generic_fallback;
  if (!isPlainObject(fallback) || fallback.enabled !== true) {
    return;
  }

  if (!Number.isInteger(Number(fallback.usage_limit ?? fallback.max_uses_per_scene ?? fallback.exhaustion_policy?.max_uses_per_scene))) {
    add(ctx.hard_errors, 'unsafe_generic_fallback', 'generic_fallback.usage_limit', 'enabled generic fallback requires an explicit usage limit');
  }
  if (normalizeArray(fallback.allowed_social_move_types ?? fallback.safe_intents).length === 0) {
    add(
      ctx.hard_errors,
      'unsafe_generic_fallback',
      'generic_fallback.allowed_social_move_types',
      'enabled generic fallback requires narrow allowed social move types or safe intents'
    );
  }
  if (!isPlainObject(fallback.result_scope_constraints ?? fallback.constraints)) {
    add(
      ctx.hard_errors,
      'unsafe_generic_fallback',
      'generic_fallback.result_scope_constraints',
      'enabled generic fallback requires explicit result scope constraints'
    );
  }
  if (!branchText(fallback.success_behavior ?? fallback.fallback_response ?? fallback.result)) {
    add(ctx.hard_errors, 'unsafe_generic_fallback', 'generic_fallback.success_behavior', 'generic fallback requires authored success behavior');
  }
  if (!branchText(fallback.failure_behavior ?? fallback.fallback_response ?? fallback.result)) {
    add(ctx.hard_errors, 'unsafe_generic_fallback', 'generic_fallback.failure_behavior', 'generic fallback requires authored failure behavior');
  }

  const majorOutputs = [
    ...normalizeArray(fallback.knowledge_grants),
    ...normalizeArray(fallback.state_changes),
    ...normalizeArray(fallback.relationship_writes),
    ...normalizeArray(fallback.exits),
    ...normalizeArray(fallback.transitions),
  ];
  if (majorOutputs.length > 0 && fallback.authorizes_major_outputs !== true) {
    add(
      ctx.hard_errors,
      'unsafe_generic_fallback',
      'generic_fallback.authorizes_major_outputs',
      'generic fallback cannot grant major clues, state changes, confessions, or transitions unless explicitly authorized'
    );
  }
  const fallbackText = JSON.stringify(fallback).toLowerCase();
  if (/\b(confess|secret|reveal hidden|gm_only|debug)\b/.test(fallbackText) && fallback.authorizes_major_outputs !== true) {
    add(
      ctx.hard_errors,
      'unsafe_generic_fallback',
      'generic_fallback',
      'generic fallback text/config appears to allow unsafe hidden or major outputs'
    );
  }
  add(
    ctx.warnings,
    'generic_fallback_enabled',
    'generic_fallback',
    'generic fallback is enabled; keep constraints narrow and authored'
  );
  validateReadsAndWrites(ctx, fallback, 'generic_fallback', relationshipDefinitions);
}

function validateExits(ctx, scene) {
  const exits = normalizeArray(scene.dialogue_exits ?? scene.dialogue_exit ?? scene.exits);
  validateUniqueIds(ctx, exits, ['exit_id', 'id', 'slug', 'key', 'interaction_id'], 'dialogue_exits', 'Dialogue Exit');
  if (exits.length === 0) {
    add(ctx.warnings, 'no_dialogue_exits', 'dialogue_exits', 'dialogue scene has no exits');
  }
  for (const [index, exit] of exits.entries()) {
    const path = `dialogue_exits[${index}]`;
    if (!isPlainObject(exit)) {
      add(ctx.hard_errors, 'invalid_shape', path, 'Dialogue Exit must be an object');
      continue;
    }
    const exitType = validateEnum(ctx, exit.exit_type ?? exit.type, DIALOGUE_EXIT_TYPES, `${path}.exit_type`, 'dialogue exit type', {
      required: true,
    });
    if (!hasAuthoredText(exit.behavior ?? exit.result ?? exit.summary ?? exit)) {
      add(ctx.hard_errors, 'missing_exit_behavior', `${path}.behavior`, 'Dialogue Exit requires explicit authored behavior');
    }
    if (['transition', 'beat_action', 'gated', 'risky'].includes(exitType)) {
      const transition = exit.transition ?? exit.target ?? exit.target_ref;
      if (!isPlainObject(transition)) {
        add(ctx.hard_errors, 'missing_exit_target', `${path}.transition`, `${exitType} exit requires an explicit transition target`);
      } else {
        validateEnum(
          ctx,
          transition.target_type ?? transition.type,
          DIALOGUE_TRANSITION_TARGET_TYPES,
          `${path}.transition.target_type`,
          'dialogue transition target type',
          { required: true }
        );
        if (!cleanText(transition.target_id ?? transition.scene_id ?? transition.dialogue_scene_id ?? transition.key)) {
          add(ctx.hard_errors, 'missing_exit_target', `${path}.transition.target_id`, `${exitType} exit requires a target id/key`);
        }
      }
    }
  }
}

function validateCompletedRecordAndTranscript(ctx, scene) {
  const record = scene.completed_dialogue_record ?? scene.completed_dialogue_record_template;
  if (record !== undefined && !isPlainObject(record)) {
    add(ctx.hard_errors, 'invalid_shape', 'completed_dialogue_record', 'completed dialogue record must be an object');
  }
  if (isPlainObject(record)) {
    const id = itemId(record, ['record_id', 'id', 'slug', 'key']);
    if (!id && record.template !== true) {
      add(ctx.hard_errors, 'missing_required_id', 'completed_dialogue_record.record_id', 'completed dialogue record requires record_id');
    }
    for (const [index, source] of normalizeArray(record.player_facing_sources ?? record.sources).entries()) {
      const visibility = cleanText(source.visibility ?? source.source_visibility);
      if (visibility && !PLAYER_SAFE_SOURCE_VISIBILITIES.includes(visibility)) {
        add(
          ctx.hard_errors,
          'player_facing_hidden_source',
          `completed_dialogue_record.player_facing_sources[${index}]`,
          'player-facing completed dialogue record cannot use hidden-only source'
        );
      }
    }
    for (const [index, source] of normalizeArray(record.summary_sources ?? record.summary?.sources).entries()) {
      const visibility = cleanText(source.visibility ?? source.source_visibility);
      if (visibility && !PLAYER_SAFE_SOURCE_VISIBILITIES.includes(visibility)) {
        add(
          ctx.hard_errors,
          'player_facing_hidden_source',
          `completed_dialogue_record.summary_sources[${index}]`,
          'completed dialogue summary cannot use hidden-only or debug-only source material'
        );
      }
    }
  }

  for (const [index, source] of normalizeArray(scene.summary_behavior?.sources).entries()) {
    const visibility = cleanText(source.visibility ?? source.source_visibility);
    if (visibility && !PLAYER_SAFE_SOURCE_VISIBILITIES.includes(visibility)) {
      add(
        ctx.hard_errors,
        'player_facing_hidden_source',
        `summary_behavior.sources[${index}]`,
        'player-facing dialogue summary cannot use hidden-only or debug-only source material'
      );
    }
  }

  const recap = scene.npc_profile_recap ?? scene.profile_recap;
  if (isPlainObject(recap)) {
    const visibility = cleanText(recap.visibility ?? recap.source_visibility);
    if (
      recap.player_facing === true &&
      (visibility === 'hidden_only' || recap.include_raw_relationship_state === true || recap.include_audit_records === true)
    ) {
      add(
        ctx.hard_errors,
        'player_facing_hidden_source',
        'npc_profile_recap',
        'NPC/profile recap hooks cannot expose hidden relationship state or audit records'
      );
    }
  }

  const searchIndex = scene.dialogue_search_index ?? scene.search_index;
  if (isPlainObject(searchIndex)) {
    const visibility = cleanText(searchIndex.visibility ?? searchIndex.visibility_scope);
    if (searchIndex.player_facing !== false && visibility && !['player', 'player_visible', 'player_safe'].includes(visibility)) {
      add(
        ctx.hard_errors,
        'player_facing_hidden_source',
        'dialogue_search_index.visibility',
        'player-facing dialogue search index must use explicit player-safe visibility'
      );
    }
  }

  for (const [index, turn] of normalizeArray(scene.transcript_turns ?? scene.transcript?.turns).entries()) {
    const path = `transcript_turns[${index}]`;
    if (!isPlainObject(turn)) {
      add(ctx.hard_errors, 'invalid_shape', path, 'transcript turn must be an object');
      continue;
    }
    if (!itemId(turn, ['turn_id', 'id', 'slug', 'key'])) {
      add(ctx.hard_errors, 'missing_required_id', `${path}.turn_id`, 'transcript turn requires turn_id');
    }
    if ((turn.visibility ?? turn.source_visibility) === 'hidden_only' && turn.player_facing === true) {
      add(
        ctx.hard_errors,
        'player_facing_hidden_source',
        `${path}.visibility`,
        'player-facing transcript turn cannot use hidden-only source'
      );
    }
  }
}

function validateLifecycle(ctx, scene) {
  const annotations = normalizeArray(scene.annotation_chains ?? scene.annotations);
  const corrections = normalizeArray(scene.correction_chains ?? scene.corrections);
  const annotationIds = new Set();
  const correctionIds = new Set();
  const activePlayerFacingByTarget = new Map();

  const validateLifecycleSafety = (item, path, kind) => {
    const reviewStatus = cleanText(item.review_status);
    const lifecycleStatus = cleanText(item.lifecycle_status);
    const sourceVisibility = cleanText(item.source_visibility ?? item.visibility);
    if (item.player_facing === true && sourceVisibility && !PLAYER_SAFE_SOURCE_VISIBILITIES.includes(sourceVisibility)) {
      add(ctx.hard_errors, 'player_facing_hidden_source', `${path}.source_visibility`, `player-facing ${kind} cannot use hidden-only or debug-only source`);
    }
    if (item.player_facing === true && ['suggested', 'generated', 'pending_review'].includes(reviewStatus)) {
      add(ctx.hard_errors, 'player_facing_pending_lifecycle', `${path}.player_facing`, `pending ${kind} records cannot be player-facing`);
    }
    if ((reviewStatus === 'suppressed' || item.record_type === 'suppression') && !cleanText(item.suppression_scope)) {
      add(ctx.hard_errors, 'missing_suppression_scope', `${path}.suppression_scope`, `suppressed ${kind} records require explicit suppression_scope`);
    }
    if ((lifecycleStatus === 'retracted' || item.record_type === 'retraction') && !cleanText(item.retraction_reason)) {
      add(ctx.hard_errors, 'missing_retraction_reason', `${path}.retraction_reason`, `retracted ${kind} records require retraction_reason`);
    }
    const replacement = cleanText(item.replacement_record_id ?? item.replacement_id);
    if ((item.record_type === 'replacement' || cleanText(item.supersedes_id)) && replacement === '' && lifecycleStatus === 'superseded') {
      add(ctx.debug_notices, 'missing_helpful_debug_metadata', `${path}.replacement_record_id`, `superseded ${kind} record should link to its replacement when known`);
    }
    const text = `${textFrom(item.original_text ?? item)} ${textFrom(item.approved_or_active_text ?? item.active_text)}`.toLowerCase();
    if (item.player_facing === true && /\b(preview confidence|debug route|audit log|lifecycle status|record id|gm\/dev)\b/.test(text)) {
      add(ctx.hard_errors, 'player_facing_internal_terms', path, `player-facing ${kind} text should not expose lifecycle/debug implementation terms`);
    }
    if (item.player_facing === true && lifecycleStatus === 'active' && ['approved', 'approved_with_edits'].includes(reviewStatus)) {
      const targetKey = `${cleanText(item.target_type)}:${cleanText(item.target_id)}`;
      if (targetKey !== ':') {
        const existing = activePlayerFacingByTarget.get(targetKey);
        if (existing) {
          add(
            ctx.hard_errors,
            'multiple_active_player_facing_lifecycle_records',
            path,
            `only one active player-facing lifecycle record should be active for ${targetKey}`,
            { previous_path: existing }
          );
        } else {
          activePlayerFacingByTarget.set(targetKey, path);
        }
      }
    }
  };

  validateUniqueIds(ctx, annotations, ['annotation_id', 'id', 'chain_id', 'key'], 'annotation_chains', 'annotation chain');
  validateUniqueIds(ctx, corrections, ['correction_id', 'id', 'chain_id', 'key'], 'correction_chains', 'correction chain');

  for (const [index, annotation] of annotations.entries()) {
    const path = `annotation_chains[${index}]`;
    if (!isPlainObject(annotation)) {
      add(ctx.hard_errors, 'invalid_shape', path, 'annotation chain must be an object');
      continue;
    }
    const id = itemId(annotation, ['annotation_id', 'id', 'chain_id', 'key']);
    if (id) {
      annotationIds.add(id);
    }
    validateEnum(ctx, annotation.review_status, ANNOTATION_REVIEW_STATUSES, `${path}.review_status`, 'annotation review status', {
      required: true,
    });
    validateEnum(ctx, annotation.lifecycle_status, ANNOTATION_LIFECYCLE_STATUSES, `${path}.lifecycle_status`, 'annotation lifecycle status', {
      required: true,
    });
    validateLifecycleSafety(annotation, path, 'annotation');
  }

  for (const [index, correction] of corrections.entries()) {
    const path = `correction_chains[${index}]`;
    if (!isPlainObject(correction)) {
      add(ctx.hard_errors, 'invalid_shape', path, 'correction chain must be an object');
      continue;
    }
    const id = itemId(correction, ['correction_id', 'id', 'chain_id', 'key']);
    if (id) {
      correctionIds.add(id);
    }
    validateEnum(ctx, correction.review_status, CORRECTION_REVIEW_STATUSES, `${path}.review_status`, 'correction review status', {
      required: true,
    });
    validateEnum(ctx, correction.lifecycle_status, CORRECTION_LIFECYCLE_STATUSES, `${path}.lifecycle_status`, 'correction lifecycle status', {
      required: true,
    });
    const annotationId = cleanText(correction.annotation_id);
    if (annotationId && !annotationIds.has(annotationId)) {
      add(ctx.hard_errors, 'broken_lifecycle_link', `${path}.annotation_id`, `correction references missing annotation "${annotationId}"`);
    }
    const supersedes = cleanText(correction.supersedes_correction_id);
    if (supersedes && !correctionIds.has(supersedes)) {
      add(ctx.hard_errors, 'broken_lifecycle_link', `${path}.supersedes_correction_id`, `correction supersedes missing correction "${supersedes}"`);
    }
    if (cleanText(correction.replacement_record_id) && !correctionIds.has(cleanText(correction.replacement_record_id))) {
      add(
        ctx.hard_errors,
        'broken_lifecycle_link',
        `${path}.replacement_record_id`,
        `correction replacement link references missing correction "${cleanText(correction.replacement_record_id)}"`
      );
    }
    validateLifecycleSafety(correction, path, 'correction');
  }
}

function validateOverrideMappings(ctx, scene) {
  const ids = new Set([...allMoveIds(scene), ...allQuestionIds(scene), ...allSurfaceIds(scene)]);
  const mappings = [
    ...normalizeArray(scene.override_mappings),
    ...normalizeArray(scene.generic_fallback?.override_mappings),
    ...normalizeArray(scene.summary_behavior?.override_mappings),
  ];
  for (const [index, mapping] of mappings.entries()) {
    const target = cleanText(mapping?.target_id ?? mapping?.move_id ?? mapping?.question_id ?? mapping?.surface_id);
    if (target && !ids.has(target)) {
      add(ctx.hard_errors, 'missing_override_mapping', `override_mappings[${index}]`, `override mapping references missing target "${target}"`);
    }
  }
}

function emitDebugNotices(ctx, scene, relationshipDefinitions) {
  const labels = new Map();
  const checkDuplicateLabel = (label, path) => {
    const key = lower(label);
    if (!key) {
      return;
    }
    if (labels.has(key)) {
      add(ctx.debug_notices, 'duplicate_wording', path, `label duplicates wording from ${labels.get(key)}`);
    } else {
      labels.set(key, path);
    }
  };

  normalizeArray(scene.clarifying_questions).forEach((question, index) =>
    checkDuplicateLabel(question.label ?? question.prompt, `clarifying_questions[${index}].label`)
  );
  normalizeArray(scene.committed_social_moves).forEach((move, index) =>
    checkDuplicateLabel(move.label, `committed_social_moves[${index}].label`)
  );
  normalizeArray(scene.dialogue_exits ?? scene.dialogue_exit ?? scene.exits).forEach((exit, index) =>
    checkDuplicateLabel(exit.label ?? exit.title, `dialogue_exits[${index}].label`)
  );

  const writtenFields = new Set();
  const readFields = new Set();
  const collect = (value) => {
    for (const write of collectWrites(value)) {
      if (write?.field) {
        writtenFields.add(cleanText(write.field));
      }
    }
    for (const read of collectRelationshipReads(value)) {
      if (read?.field) {
        readFields.add(cleanText(read.field));
      }
    }
  };
  for (const question of normalizeArray(scene.clarifying_questions)) {
    collect(question);
    collect(question.result);
    collect(question.on_success);
    collect(question.on_failure);
  }
  for (const move of normalizeArray(scene.committed_social_moves)) {
    collect(move);
    collect(move.result);
    collect(move.on_success);
    collect(move.on_failure);
  }
  for (const field of relationshipDefinitions.keys()) {
    if (!writtenFields.has(field)) {
      add(ctx.debug_notices, 'unused_relationship_field', `relationship_state_definitions.${field}`, `relationship field "${field}" is not written in this scene`);
    }
    if (!readFields.has(field)) {
      add(ctx.debug_notices, 'unread_relationship_field', `relationship_state_definitions.${field}`, `relationship field "${field}" is not read in this scene`);
    }
  }
  if (!isPlainObject(scene.debug_metadata) && !isPlainObject(scene.validation_metadata?.debug_metadata)) {
    add(ctx.debug_notices, 'missing_debug_metadata', 'debug_metadata', 'dialogue scene has no helpful debug metadata');
  }
}

export function validateDialogueFocusCommitScene(scene, options = {}) {
  const ctx = {
    profile: options.profile ?? 'playtest_ready',
    hard_errors: [],
    warnings: [],
    debug_notices: [],
  };

  if (!isPlainObject(scene)) {
    add(ctx.hard_errors, 'invalid_shape', 'dialogue_scene', 'dialogue scene must be an object');
    return { ok: false, ...ctx, errors: ctx.hard_errors.map(issueText) };
  }

  const sceneId = itemId(scene, ['id', 'slug', 'key', 'dialogue_scene_id']);
  if (!sceneId) {
    add(ctx.hard_errors, 'missing_required_id', 'dialogue_scene.id', 'dialogue scene requires id, slug, key, or dialogue_scene_id');
  }
  const model = cleanText(scene.interaction_domain ?? scene.dialogue_model ?? scene.scene_type);
  if (!model) {
    add(ctx.hard_errors, 'missing_dialogue_model', 'dialogue_scene.interaction_domain', 'dialogue scene requires interaction_domain/dialogue_model/scene_type');
  } else if (![...DIALOGUE_SCENE_MODELS, ...DIALOGUE_SCENE_TYPES].includes(model)) {
    add(
      ctx.hard_errors,
      'invalid_dialogue_model',
      'dialogue_scene.interaction_domain',
      `dialogue model must be one of: ${[...DIALOGUE_SCENE_MODELS, ...DIALOGUE_SCENE_TYPES].join(', ')}`
    );
  }
  if (!cleanText(scene.title ?? scene.name)) {
    add(ctx.warnings, 'missing_dialogue_title', 'dialogue_scene.title', 'dialogue scene has no title/name');
  }
  if (normalizeArray(scene.participants).length === 0) {
    add(ctx.hard_errors, 'missing_participants', 'participants', 'dialogue scene requires at least one participant');
  } else {
    validateUniqueIds(ctx, normalizeArray(scene.participants), ['participant_id', 'npc_template_slug', 'id', 'slug', 'key'], 'participants', 'participant');
  }
  if (!isPlainObject(scene.entry_behavior)) {
    add(ctx.warnings, 'missing_entry_behavior', 'entry_behavior', 'dialogue scene has no explicit entry behavior');
  }

  const relationshipDefinitions = buildRelationshipDefinitions(ctx, scene);
  validateConversationSurface(ctx, scene);
  validatePassiveInsights(ctx, scene, relationshipDefinitions);
  validateClarifyingQuestions(ctx, scene, relationshipDefinitions);
  validateCommittedMoves(ctx, scene, relationshipDefinitions);
  validateGenericFallback(ctx, scene, relationshipDefinitions);
  validateExits(ctx, scene);
  validateCompletedRecordAndTranscript(ctx, scene);
  validateLifecycle(ctx, scene);
  validateOverrideMappings(ctx, scene);
  emitDebugNotices(ctx, scene, relationshipDefinitions);

  return {
    ok: ctx.hard_errors.length === 0,
    ...ctx,
    errors: ctx.hard_errors.map(issueText),
  };
}

export function validateDialogueFocusCommitScenes(scenes, options = {}) {
  const results = normalizeArray(scenes).map((scene) => validateDialogueFocusCommitScene(scene, options));
  return {
    ok: results.every((result) => result.ok),
    results,
    hard_errors: results.flatMap((result) => result.hard_errors),
    warnings: results.flatMap((result) => result.warnings),
    debug_notices: results.flatMap((result) => result.debug_notices),
  };
}
