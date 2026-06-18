import {
  CONDITION_IDS,
  CONDITION_LIFECYCLE_EVENTS,
  CONDITION_PERSISTENCE_POLICIES,
  createConditionInstance,
  evaluateCombatEndPersistence,
  stabilizeParticipant,
} from './conditionStateLifecycle.js';
import {
  COMBAT_CHECKPOINT_KINDS,
  COMBAT_OPERATION_STATUSES,
  COMBAT_OPERATION_TYPES,
  appendCombatEvent,
  ensureCombatPersistenceState,
  runDurableCombatOperation,
} from './combatPersistenceRuntime.js';
import {
  RUSK_ENCOUNTER_IDS,
  RUSK_OUTCOME_IDS,
  RUSK_PARTICIPANT_IDS,
} from './canonicalRuskEncounter.js';
import {
  PLAYER_TURN_STATUSES,
} from './playerTurnRuntime.js';
import {
  buildCombatPlayerResultBundle,
  assertNoCombatPlayerHiddenData,
} from '../../services/interactionCore/combatAdapterContract.js';
import {
  computePendingLevelsFromXp,
  getDefaultXpThresholds,
} from '../../utils/advancementRules.js';

export const ENCOUNTER_RESOLUTION_STATUSES = Object.freeze({
  NOT_READY: 'not_ready',
  RESOLUTION_PHASE_READY: 'resolution_phase_ready',
  WAITING_FOR_MANDATORY_COMPLETION: 'waiting_for_mandatory_completion',
  WAITING_FOR_AUTHORED_CHOICE: 'waiting_for_authored_resolution_choice',
  RESOLVING: 'resolving',
  COMPLETE: 'complete',
  DUPLICATE_RETURNED: 'duplicate_returned',
  UNAVAILABLE: 'unavailable',
  RECOVERY_NEEDED: 'recovery_needed',
});

export const ENCOUNTER_RESOLUTION_NEXT_BEAT_KINDS = Object.freeze({
  AFTERMATH_REVIEW: 'aftermath_review',
  WAITING_FOR_MANDATORY_COMPLETION: 'waiting_for_mandatory_completion',
  WAITING_FOR_AUTHORED_CHOICE: 'waiting_for_authored_resolution_choice',
  RECOVERY_NEEDED: 'recovery_needed',
  UNAVAILABLE: 'unavailable',
});

export const ENCOUNTER_REWARD_TYPES = Object.freeze({
  EXPERIENCE: 'experience',
  CURRENCY: 'currency',
  ITEM: 'item',
  DOWNTIME: 'downtime',
});

export const RUSK_AFTERMATH_VARIANT_IDS = Object.freeze({
  LETHAL_RUSK_DEFEAT: RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL,
  NONLETHAL_RUSK_DEFEAT: RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL,
  RUSK_SURRENDER: RUSK_OUTCOME_IDS.RUSK_SURRENDER,
  PLAYER_RETREAT: RUSK_OUTCOME_IDS.PLAYER_RETREAT,
  PLAYER_FAIL_FORWARD_DEFEAT: RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD,
});

export const PLAYER_PROHIBITED_AFTERMATH_STRINGS = Object.freeze([
  'armor_class',
  'difficulty_class',
  'raw_roll',
  'roll_record',
  'idempotency_key',
  'source_state_version',
  'current_state_version',
  'resulting_state_version',
  'operation_fingerprint',
  'checkpoint',
  'mutation_plan',
  'gm_dev',
  'trace',
  'provenance',
  'control_mode',
  'combat_pending',
  'future_supported',
  'target_encounter',
  'source_path',
  'hidden',
  'internal',
]);

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function stableId(parts = []) {
  return parts.map((part) => cleanText(part ?? 'none')).filter(Boolean).join(':');
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function participantId(input = {}) {
  if (!input || typeof input !== 'object') return cleanText(input);
  return cleanText(input.participant_id ?? input.participantId ?? input.id);
}

function findParticipant(state = {}, id) {
  return asArray(state.participants).find((entry) => participantId(entry) === cleanText(id)) ?? null;
}

function participantHp(participant = {}) {
  return toNumber(participant.current_hit_points ?? participant.currentHp ?? participant.current_hp, 0);
}

function healthBand(participant = {}) {
  const hp = participantHp(participant);
  const max = Math.max(toNumber(participant.max_hit_points ?? participant.maxHp ?? participant.max_hp, 1), 1);
  if (participant.dead === true) return 'dead';
  if (participant.defeated === true || hp <= 0) return 'down';
  const ratio = hp / max;
  if (ratio >= 0.75) return 'steady';
  if (ratio >= 0.4) return 'wounded';
  return 'badly_wounded';
}

function condition(type, participantIdValue, input = {}) {
  return createConditionInstance({
    condition_type: type,
    target_participant_id: participantIdValue,
    condition_instance_id: input.condition_instance_id ?? stableId(['aftermath-condition', participantIdValue, type]),
    persistence_policy: input.persistence_policy ?? CONDITION_PERSISTENCE_POLICIES.PERSISTENT,
    duration: input.duration ?? {},
    player_text: input.player_text ?? null,
  });
}

function output(outputKind, id, title, summary, extra = {}) {
  return {
    output_kind: outputKind,
    [`${outputKind}_id`]: id,
    title,
    player_summary: summary,
    status: extra.status ?? undefined,
    progress: extra.progress ?? undefined,
    tags: extra.tags ?? undefined,
  };
}

function historyOutput(id, title, summary) {
  return {
    output_kind: 'history',
    event_id: id,
    title,
    player_summary: summary,
    category: 'combat_aftermath',
  };
}

function latestDevelopment(id, title, summary) {
  return {
    output_kind: 'latest_development',
    latest_development_id: id,
    title,
    player_summary: summary,
  };
}

function archiveEntry(id, title, summary, tags = []) {
  return {
    output_kind: 'archive_search',
    archive_entry_id: id,
    title,
    player_summary: summary,
    tags,
  };
}

function buildRuskOutputs(outcomeId) {
  const baseKnowledge = {
    [RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL]: [
      output('knowledge', 'rusk_surface_threat_ended_lethal', 'Rusk is dead', 'Rusk can no longer threaten the Grey Road directly.'),
    ],
    [RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL]: [
      output('knowledge', 'rusk_surface_threat_ended_nonlethal', 'Rusk was subdued', 'Rusk survived the fight and can be dealt with after the shrine.'),
    ],
    [RUSK_OUTCOME_IDS.RUSK_SURRENDER]: [
      output('knowledge', 'rusk_surrendered_at_shrine', 'Rusk surrendered', 'Rusk yielded once the fight turned against him.'),
    ],
    [RUSK_OUTCOME_IDS.PLAYER_RETREAT]: [
      output('knowledge', 'rusk_remains_at_shrine_after_retreat', 'Rusk remains at the shrine', 'You escaped the fight, but Rusk was not stopped.'),
    ],
    [RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD]: [
      output('knowledge', 'rusk_overwhelmed_you_at_shrine', 'Rusk overwhelmed you', 'The confrontation exposed the threat, even though the fight went against you.'),
    ],
  };
  const objectiveStatus = [
    RUSK_OUTCOME_IDS.PLAYER_RETREAT,
    RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD,
  ].includes(outcomeId)
    ? 'active'
    : 'completed';
  const objectiveSummary = objectiveStatus === 'completed'
    ? 'The immediate surface threat at the shrine is resolved.'
    : 'The shrine threat remains unresolved and must be handled after recovery.';
  return {
    objective_outputs: [
      output('objective', 'resolve-the-threat', 'Resolve the Threat', objectiveSummary, {
        status: objectiveStatus,
        progress: objectiveStatus === 'completed' ? 1 : 0.6,
      }),
    ],
    knowledge_outputs: baseKnowledge[outcomeId] ?? [
      output('knowledge', 'rusk_resolution_needs_review', 'The shrine fight needs review', 'The shrine fight ended in a way that needs safe follow-up.'),
    ],
    history_outputs: [
      historyOutput(
        stableId(['rusk-aftermath-history', outcomeId]),
        'The shrine fight ended',
        ruskAftermathSummary(outcomeId)
      ),
    ],
    latest_development_output: latestDevelopment(
      stableId(['rusk-aftermath-latest', outcomeId]),
      'Shrine Ruins Aftermath',
      ruskAftermathSummary(outcomeId)
    ),
    archive_search_outputs: [
      archiveEntry(
        stableId(['rusk-aftermath-archive', outcomeId]),
        'Shrine Ruins Aftermath',
        ruskAftermathSummary(outcomeId),
        ['greyvale', 'shrine', 'rusk', 'aftermath']
      ),
    ],
  };
}

function ruskAftermathSummary(outcomeId) {
  switch (outcomeId) {
    case RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL:
      return 'Rusk falls at the shrine, ending the immediate surface threat.';
    case RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL:
      return 'Rusk is subdued and left alive as the shrine fight ends.';
    case RUSK_OUTCOME_IDS.RUSK_SURRENDER:
      return 'Rusk gives up the fight, leaving the shrine aftermath to settle around his surrender.';
    case RUSK_OUTCOME_IDS.PLAYER_RETREAT:
      return 'You break away from the shrine, alive but without ending Rusk’s threat.';
    case RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD:
      return 'You are overwhelmed at the shrine, but the story continues through a safe recovery aftermath.';
    default:
      return 'The shrine fight reaches an authored aftermath.';
  }
}

function ruskVariantLabel(outcomeId) {
  switch (outcomeId) {
    case RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL:
      return 'Rusk Defeated';
    case RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL:
      return 'Rusk Subdued';
    case RUSK_OUTCOME_IDS.RUSK_SURRENDER:
      return 'Rusk Surrenders';
    case RUSK_OUTCOME_IDS.PLAYER_RETREAT:
      return 'Retreat From The Shrine';
    case RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD:
      return 'Recovered From Defeat';
    default:
      return 'Shrine Aftermath';
  }
}

function ruskResolutionPath(outcomeId) {
  switch (outcomeId) {
    case RUSK_OUTCOME_IDS.RUSK_SURRENDER:
      return 'negotiation';
    case RUSK_OUTCOME_IDS.PLAYER_RETREAT:
      return 'escape';
    case RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD:
      return 'fail_forward';
    default:
      return 'combat';
  }
}

export function buildCanonicalRuskAftermathDefinitions(input = {}) {
  const encounter = input.encounter ?? input.encounter_content ?? input.encounterContent ?? null;
  const rewardValue = encounter?.reward_value ?? {
    xp: 150,
    grant_on_resolution: true,
    equivalent_across_paths: true,
  };
  const variants = Object.values(RUSK_AFTERMATH_VARIANT_IDS).map((outcomeId) => {
    const outputs = buildRuskOutputs(outcomeId);
    return {
      outcome_id: outcomeId,
      aftermath_state_id: RUSK_ENCOUNTER_IDS.AFTERMATH_STATE,
      aftermath_variant_id: outcomeId,
      label: ruskVariantLabel(outcomeId),
      summary: ruskAftermathSummary(outcomeId),
      resolution_path: ruskResolutionPath(outcomeId),
      reward_value: {
        xp: toNumber(rewardValue.xp, 150),
        grant_on_resolution: rewardValue.grant_on_resolution !== false,
        equivalent_across_paths: rewardValue.equivalent_across_paths === true,
      },
      outputs,
      post_combat_hook_identity: RUSK_ENCOUNTER_IDS.HOOK,
      supported: true,
    };
  });
  return {
    contract_stage: '6D.14',
    encounter_id: RUSK_ENCOUNTER_IDS.ENCOUNTER,
    encounter_title: encounter?.name ?? 'Rusk at the Shrine',
    shared_aftermath_state_id: RUSK_ENCOUNTER_IDS.AFTERMATH_STATE,
    variants,
    reward_policy: {
      source: 'encounter.reward_value',
      grant_on_resolution: rewardValue.grant_on_resolution !== false,
      equivalent_across_paths: rewardValue.equivalent_across_paths === true,
      xp: toNumber(rewardValue.xp, 150),
    },
  };
}

export function buildEncounterResolutionDefinition(input = {}) {
  const handoff = input.handoff ?? input.completion_handoff ?? input.completionHandoff ?? input.state?.canonical_rusk_handoff ?? null;
  const canonicalRusk = handoff?.encounter_id === RUSK_ENCOUNTER_IDS.ENCOUNTER ||
    handoff?.shared_aftermath_state_id === RUSK_ENCOUNTER_IDS.AFTERMATH_STATE ||
    input.encounter_id === RUSK_ENCOUNTER_IDS.ENCOUNTER;
  if (canonicalRusk) {
    return buildCanonicalRuskAftermathDefinitions(input);
  }
  const outcomes = asArray(input.outcomes).map((entry) => ({
    outcome_id: cleanText(entry.outcome_id ?? entry.outcomeId),
    aftermath_state_id: cleanText(entry.aftermath_state_id ?? entry.aftermathStateId),
    aftermath_variant_id: cleanText(entry.aftermath_variant_id ?? entry.aftermathVariantId),
    label: cleanText(entry.label) || 'Encounter aftermath',
    summary: cleanText(entry.summary) || 'The encounter reaches an aftermath.',
    resolution_path: cleanText(entry.resolution_path ?? entry.resolutionPath) || 'combat',
    reward_value: cloneSerializable(entry.reward_value ?? entry.rewardValue ?? {}),
    outputs: cloneSerializable(entry.outputs ?? {}),
    supported: entry.supported !== false,
  })).filter((entry) => entry.outcome_id);
  return {
    contract_stage: '6D.14',
    encounter_id: cleanText(input.encounter_id ?? handoff?.encounter_id),
    encounter_title: cleanText(input.encounter_title ?? input.encounterTitle) || 'Combat Encounter',
    shared_aftermath_state_id: cleanText(input.shared_aftermath_state_id ?? handoff?.shared_aftermath_state_id),
    variants: outcomes,
    reward_policy: cloneSerializable(input.reward_policy ?? input.rewardPolicy ?? {}),
  };
}

function variantForOutcome(definition, outcomeId) {
  return asArray(definition.variants).find((entry) => cleanText(entry.outcome_id) === cleanText(outcomeId)) ?? null;
}

export function validateEncounterCompletionHandoff(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const handoff = input.handoff ?? state.canonical_rusk_handoff ?? state.encounter_completion_handoff ?? null;
  if (!handoff || handoff.status !== 'completion_handoff_ready') {
    return {
      valid: false,
      status: ENCOUNTER_RESOLUTION_STATUSES.NOT_READY,
      player_safe_message: 'The encounter has not reached an aftermath handoff yet.',
      issues: [{ code: 'missing_completion_handoff' }],
    };
  }
  const definition = input.definition ?? buildEncounterResolutionDefinition({ ...input, state, handoff });
  const variant = variantForOutcome(definition, handoff.outcome_id);
  if (!variant || variant.supported === false) {
    return {
      valid: false,
      status: ENCOUNTER_RESOLUTION_STATUSES.UNAVAILABLE,
      player_safe_message: 'This encounter ending needs GM review before aftermath can be applied.',
      issues: [{ code: 'unsupported_outcome', outcome_id: handoff.outcome_id }],
    };
  }
  return {
    valid: true,
    status: ENCOUNTER_RESOLUTION_STATUSES.RESOLUTION_PHASE_READY,
    handoff,
    definition,
    variant,
    issues: [],
  };
}

export function verifyMandatoryCombatCompletion(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const blockers = [];
  if (cleanText(state.active_reaction_window_id)) {
    blockers.push({ code: 'active_reaction_window', player_safe_summary: 'A required reaction window must finish before aftermath.' });
  }
  if (state.parent_turn?.status === PLAYER_TURN_STATUSES.PAUSED_FOR_REACTION || state.parent_turn?.status === 'paused_for_reaction') {
    blockers.push({ code: 'parent_turn_paused_for_reaction', player_safe_summary: 'The current combat interruption must finish before aftermath.' });
  }
  if (asArray(state.reaction_windows).some((window) => ['open', 'waiting_for_player', 'waiting_for_automatic'].includes(cleanText(window.status)))) {
    blockers.push({ code: 'open_reaction_window', player_safe_summary: 'A reaction is still waiting to resolve.' });
  }
  return {
    ready: blockers.length === 0,
    status: blockers.length === 0
      ? ENCOUNTER_RESOLUTION_STATUSES.RESOLUTION_PHASE_READY
      : ENCOUNTER_RESOLUTION_STATUSES.WAITING_FOR_MANDATORY_COMPLETION,
    blockers,
    player_safe_message: blockers.length === 0
      ? 'The combat is ready for aftermath.'
      : 'The encounter is ending, but a required combat step must finish first.',
  };
}

function outcomeMatchesCombatState(state, outcomeId) {
  const rusk = findParticipant(state, RUSK_PARTICIPANT_IDS.RUSK);
  const player = findParticipant(state, RUSK_PARTICIPANT_IDS.PLAYER);
  const playerAtRetreat = asArray(state.spatial?.participants).some((entry) =>
    participantId(entry) === RUSK_PARTICIPANT_IDS.PLAYER && cleanText(entry.current_zone_id) === 'grey-road-retreat'
  );
  if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL || outcomeId === RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL) {
    return rusk && (rusk.defeated === true || participantHp(rusk) <= 0);
  }
  if (outcomeId === RUSK_OUTCOME_IDS.RUSK_SURRENDER) {
    return Boolean(state.automatic_surrender_intent?.actor_participant_id === RUSK_PARTICIPANT_IDS.RUSK);
  }
  if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_RETREAT) {
    return state.player_retreat_declared === true || playerAtRetreat;
  }
  if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD) {
    return player && (player.defeated === true || participantHp(player) <= 0);
  }
  return false;
}

export function selectEncounterOutcome(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const handoff = input.handoff ?? state.canonical_rusk_handoff ?? null;
  const definition = input.definition ?? buildEncounterResolutionDefinition({ ...input, state, handoff });
  const outcomeId = cleanText(input.outcome_id ?? input.outcomeId ?? handoff?.outcome_id);
  const variant = variantForOutcome(definition, outcomeId);
  if (!variant) {
    return {
      status: ENCOUNTER_RESOLUTION_STATUSES.UNAVAILABLE,
      selected: false,
      outcome_id: outcomeId,
      player_safe_message: 'That encounter ending is not supported yet.',
      gm_dev_trace: { reason: 'missing_aftermath_variant', outcome_id: outcomeId },
    };
  }
  if (definition.encounter_id === RUSK_ENCOUNTER_IDS.ENCOUNTER && !outcomeMatchesCombatState(state, outcomeId)) {
    return {
      status: ENCOUNTER_RESOLUTION_STATUSES.RECOVERY_NEEDED,
      selected: false,
      outcome_id: outcomeId,
      player_safe_message: 'The encounter ending needs GM review before aftermath can be applied.',
      gm_dev_trace: { reason: 'outcome_does_not_match_terminal_combat_state', outcome_id: outcomeId },
    };
  }
  return {
    status: 'selected',
    selected: true,
    outcome_id: outcomeId,
    variant,
    aftermath_state_id: variant.aftermath_state_id,
    aftermath_variant_id: variant.aftermath_variant_id,
  };
}

export function enterEncounterResolutionPhase(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const validation = validateEncounterCompletionHandoff({ ...input, state });
  if (!validation.valid) return { ...validation, state };
  const mandatory = verifyMandatoryCombatCompletion({ state });
  state.encounter_resolution = {
    ...(state.encounter_resolution ?? {}),
    resolution_id: cleanText(state.encounter_resolution?.resolution_id) ||
      stableId(['encounter-resolution', validation.handoff.combat_id, validation.handoff.outcome_id]),
    status: mandatory.status,
    encounter_id: validation.handoff.encounter_id,
    combat_id: validation.handoff.combat_id,
    outcome_id: validation.handoff.outcome_id,
    aftermath_state_id: validation.variant.aftermath_state_id,
    aftermath_variant_id: validation.variant.aftermath_variant_id,
    normal_combat_controls_locked: true,
    mandatory_completion: mandatory,
    applied_markers: state.encounter_resolution?.applied_markers ?? {},
  };
  state.normal_combat_controls_locked = true;
  if (state.combat) {
    state.combat.status = mandatory.ready ? 'resolving' : 'resolution_pending';
  }
  if (state.parent_turn) {
    state.parent_turn.status = PLAYER_TURN_STATUSES.CLOSED;
    state.parent_turn.turn_close_reason = 'encounter_resolution_phase';
  }
  if (state.action_window) {
    state.action_window.status = 'closed';
    state.action_window.close_reason = 'encounter_resolution_phase';
  }
  return {
    status: mandatory.status,
    ready: mandatory.ready,
    state,
    handoff: validation.handoff,
    definition: validation.definition,
    variant: validation.variant,
    mandatory_completion: mandatory,
  };
}

export function rejectNormalCombatInputDuringResolution(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const active = state.normal_combat_controls_locked === true ||
    ['resolving', 'resolution_pending', 'resolved'].includes(cleanText(state.combat?.status)) ||
    Boolean(state.encounter_resolution);
  if (!active) {
    return { status: 'allowed', ordinary_controls_available: true };
  }
  const response = {
    status: ENCOUNTER_RESOLUTION_STATUSES.UNAVAILABLE,
    committed: false,
    ordinary_controls_available: false,
    player_safe_message: state.encounter_resolution?.status === ENCOUNTER_RESOLUTION_STATUSES.COMPLETE
      ? 'The encounter is complete. Review the aftermath instead of taking combat turns.'
      : 'The encounter is resolving. Combat actions are unavailable until aftermath is ready.',
    read_model: projectEncounterResolutionForPlayer({ state }),
  };
  assertNoEncounterResolutionPlayerHiddenData(response);
  return response;
}

function pushUnique(list, entry, idFields = ['id']) {
  const output = asArray(list);
  const entryId = idFields.map((field) => cleanText(entry?.[field])).find(Boolean) ?? JSON.stringify(entry);
  const exists = output.some((candidate) =>
    idFields.some((field) => cleanText(candidate?.[field]) && cleanText(candidate?.[field]) === entryId)
  );
  if (!exists) output.push(cloneSerializable(entry));
  return output;
}

function addCondition(participant, type, input = {}) {
  const next = { ...participant };
  next.conditions = pushUnique(asArray(next.conditions), condition(type, participantId(participant), input), ['condition_instance_id']);
  return next;
}

export function finalizeEncounterParticipants(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const outcomeId = cleanText(input.outcome_id ?? input.outcomeId ?? state.encounter_resolution?.outcome_id);
  const finalized = [];
  state.participants = asArray(state.participants).map((participant) => {
    const id = participantId(participant);
    let next = { ...participant };
    if (id === RUSK_PARTICIPANT_IDS.RUSK) {
      if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL) {
        next.current_hit_points = 0;
        next.defeated = true;
        next.dead = true;
        next.active = false;
        next = addCondition(next, CONDITION_IDS.DEAD);
      } else if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL) {
        next.current_hit_points = 0;
        next.defeated = true;
        next.dead = false;
        next.stable = true;
        next.active = false;
        next = addCondition(next, CONDITION_IDS.UNCONSCIOUS, { condition_instance_id: 'rusk-aftermath-unconscious' });
        next = addCondition(next, CONDITION_IDS.STABLE, { condition_instance_id: 'rusk-aftermath-stable' });
      } else if (outcomeId === RUSK_OUTCOME_IDS.RUSK_SURRENDER) {
        next.surrendered = true;
        next.defeated = false;
        next.active = false;
        next.faction = 'surrendered';
      } else if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_RETREAT || outcomeId === RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD) {
        next.active = true;
        next.defeated = false;
      }
    }
    if (id === RUSK_PARTICIPANT_IDS.PLAYER && outcomeId === RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD) {
      next.current_hit_points = 0;
      next.defeated = true;
      next.protected_fail_forward = true;
      next.death_save_state = stabilizeParticipant({ participant: next, natural_recovery_at: 'safe_aftermath' }).death_save_state;
      next = addCondition(next, CONDITION_IDS.UNCONSCIOUS, { condition_instance_id: 'player-aftermath-unconscious' });
      next = addCondition(next, CONDITION_IDS.STABLE, { condition_instance_id: 'player-aftermath-stable' });
    }
    finalized.push({
      participant_id: id,
      health_band: healthBand(next),
      defeated: next.defeated === true,
      dead: next.dead === true,
      surrendered: next.surrendered === true,
      stable: next.stable === true || next.death_save_state?.stable === true,
    });
    return next;
  });
  state.encounter_resolution = {
    ...(state.encounter_resolution ?? {}),
    participant_finalization: finalized,
  };
  return { status: 'finalized', state, participant_finalization: finalized };
}

export function expireCombatEffectsAndCarryPersistentEffects(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const allConditions = asArray(state.conditions).concat(asArray(state.participants).flatMap((participant) => asArray(participant.conditions)));
  const persistence = evaluateCombatEndPersistence({
    conditions: allConditions,
    concentration: state.concentration,
  });
  state.conditions = persistence.persisted_conditions;
  state.expired_combat_conditions = persistence.expired_conditions;
  if (persistence.concentration?.carry_forward) {
    state.adventure_concentration = {
      ...(state.concentration ?? {}),
      carry_forward: true,
      adventure_duration_seconds: persistence.concentration.adventure_duration_seconds,
    };
  } else if (state.concentration) {
    state.concentration = {
      ...state.concentration,
      active: false,
      ended_reason: CONDITION_LIFECYCLE_EVENTS.COMBAT_ENDED,
    };
  }
  state.encounter_resolution = {
    ...(state.encounter_resolution ?? {}),
    condition_persistence: {
      persisted_count: persistence.persisted_conditions.length,
      expired_count: persistence.expired_conditions.length,
      concentration_status: persistence.concentration?.status ?? null,
    },
  };
  return { status: 'evaluated', state, condition_persistence: state.encounter_resolution.condition_persistence };
}

export function calculateEncounterRewards(input = {}) {
  const variant = input.variant ?? {};
  const rewardValue = variant.reward_value ?? input.reward_value ?? input.rewardValue ?? {};
  const rewards = {
    experience: rewardValue.grant_on_resolution === false
      ? 0
      : Math.max(0, toNumber(rewardValue.xp, 0)),
    currency: cloneSerializable(rewardValue.currency ?? {}),
    items: asArray(rewardValue.items),
    downtime: Math.max(0, toNumber(rewardValue.downtime_days ?? rewardValue.downtimeDays, 0)),
    equivalent_across_paths: rewardValue.equivalent_across_paths === true,
  };
  return {
    status: 'calculated',
    reward_application_id: cleanText(input.reward_application_id ?? input.rewardApplicationId) ||
      stableId(['reward', input.encounter_id ?? input.encounterId, input.character_id ?? input.characterId, input.outcome_id ?? input.outcomeId]),
    rewards,
  };
}

function progressionState(state) {
  state.character_progression = {
    character_id: cleanText(state.character_progression?.character_id ?? state.active_character_id ?? state.character_id) || 'character-greyvale',
    level: Math.max(1, toNumber(state.character_progression?.level, 1)),
    experience_points: Math.max(0, toNumber(state.character_progression?.experience_points, 0)),
    pending_level_count: Math.max(0, toNumber(state.character_progression?.pending_level_count, 0)),
    level_up_available: Boolean(state.character_progression?.level_up_available),
    applied_rewards: asArray(state.character_progression?.applied_rewards),
  };
  return state.character_progression;
}

export function detectPendingAdvancement(input = {}) {
  const character = input.character_progression ?? input.characterProgression ?? {};
  const level = Math.max(1, toNumber(character.level, 1));
  const xp = Math.max(0, toNumber(character.experience_points, 0));
  const pending = Math.max(0, toNumber(character.pending_level_count, 0));
  const additionalPending = computePendingLevelsFromXp(xp, level, pending, input.thresholds ?? getDefaultXpThresholds());
  const totalPending = pending + additionalPending;
  return {
    status: totalPending > 0 ? 'pending_advancement_available' : 'no_pending_advancement',
    level,
    experience_points: xp,
    pending_level_count: totalPending,
    level_up_available: totalPending > 0,
    target_level: totalPending > 0 ? level + totalPending : null,
    level_changed: false,
  };
}

export function applyEncounterRewards(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const rewardPlan = input.reward_plan ?? input.rewardPlan ?? calculateEncounterRewards(input);
  const progression = progressionState(state);
  const marker = cleanText(rewardPlan.reward_application_id);
  const alreadyApplied = progression.applied_rewards.some((entry) => cleanText(entry.reward_application_id) === marker);
  if (!alreadyApplied) {
    const xp = Math.max(0, toNumber(rewardPlan.rewards?.experience, 0));
    progression.experience_points += xp;
    const pending = detectPendingAdvancement({ character_progression: progression });
    progression.pending_level_count = pending.pending_level_count;
    progression.level_up_available = pending.level_up_available;
    progression.applied_rewards.push({
      reward_application_id: marker,
      reward_type: ENCOUNTER_REWARD_TYPES.EXPERIENCE,
      amount: xp,
      outcome_id: cleanText(input.outcome_id ?? input.outcomeId),
    });
  }
  state.encounter_resolution = {
    ...(state.encounter_resolution ?? {}),
    rewards: {
      reward_application_id: marker,
      experience_awarded: Math.max(0, toNumber(rewardPlan.rewards?.experience, 0)),
      duplicate: alreadyApplied,
      pending_advancement: detectPendingAdvancement({ character_progression: progression }),
      items: asArray(rewardPlan.rewards?.items),
      currency: rewardPlan.rewards?.currency ?? {},
      downtime_days: rewardPlan.rewards?.downtime ?? 0,
    },
  };
  return { status: alreadyApplied ? 'duplicate' : 'applied', state, rewards: state.encounter_resolution.rewards };
}

function outputId(entry = {}) {
  return cleanText(entry.knowledge_id ?? entry.objective_id ?? entry.event_id ?? entry.latest_development_id ?? entry.archive_entry_id ?? entry.id);
}

function upsertOutput(list, entry) {
  const id = outputId(entry);
  const values = asArray(list);
  const index = values.findIndex((candidate) => outputId(candidate) === id);
  if (index >= 0) {
    values[index] = { ...values[index], ...cloneSerializable(entry) };
  } else {
    values.push(cloneSerializable(entry));
  }
  return values;
}

export function applyAdventureStateUpdates(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const variant = input.variant ?? {};
  const outputs = variant.outputs ?? {};
  state.objective_outputs = asArray(outputs.objective_outputs).reduce(upsertOutput, asArray(state.objective_outputs));
  state.knowledge_outputs = asArray(outputs.knowledge_outputs).reduce(upsertOutput, asArray(state.knowledge_outputs));
  state.history_outputs = asArray(outputs.history_outputs).reduce(upsertOutput, asArray(state.history_outputs));
  state.archive_search_outputs = asArray(outputs.archive_search_outputs).reduce(upsertOutput, asArray(state.archive_search_outputs));
  state.latest_development_output = cloneSerializable(outputs.latest_development_output ?? state.latest_development_output ?? null);
  state.adventure_state = {
    ...(state.adventure_state ?? {}),
    current_state_id: variant.aftermath_state_id,
    current_variant_id: variant.aftermath_variant_id,
    state_title: 'Shrine Ruins Aftermath',
    variant_label: variant.label,
    status: 'review',
  };
  state.world_state_flags = {
    ...(state.world_state_flags ?? {}),
    surface_threat_resolved: ![
      RUSK_OUTCOME_IDS.PLAYER_RETREAT,
      RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD,
    ].includes(variant.outcome_id),
    shrine_aftermath_reached: true,
  };
  state.npc_state_updates = upsertOutput(state.npc_state_updates, {
    id: stableId(['npc-state', RUSK_PARTICIPANT_IDS.RUSK, variant.outcome_id]),
    npc_id: RUSK_PARTICIPANT_IDS.RUSK,
    status: variant.outcome_id,
    player_summary: variant.summary,
  });
  state.encounter_resolution = {
    ...(state.encounter_resolution ?? {}),
    adventure_outputs: {
      objective_count: asArray(outputs.objective_outputs).length,
      knowledge_count: asArray(outputs.knowledge_outputs).length,
      history_count: asArray(outputs.history_outputs).length,
      archive_search_count: asArray(outputs.archive_search_outputs).length,
      latest_development: Boolean(outputs.latest_development_output),
    },
  };
  return { status: 'applied', state, adventure_state: state.adventure_state };
}

function eventSummary(event = {}) {
  return cleanText(event.player_safe_summary) || 'Combat progress was recorded.';
}

export function buildPostCombatReview(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const variant = input.variant ?? {};
  const events = asArray(state.combat_persistence?.events)
    .filter((event) => eventSummary(event))
    .map((event, index) => ({
      order: index + 1,
      round: event.round_number ?? state.combat?.round_number ?? 1,
      turn: cleanText(event.parent_turn_id) || 'encounter',
      summary: eventSummary(event),
    }));
  const grouped = [];
  for (const event of events) {
    let group = grouped.find((entry) => entry.round === event.round && entry.turn === event.turn);
    if (!group) {
      group = { round: event.round, turn: event.turn, events: [] };
      grouped.push(group);
    }
    group.events.push({ order: event.order, summary: event.summary });
  }
  const review = {
    review_id: stableId(['post-combat-review', state.combat?.combat_id, variant.outcome_id]),
    title: variant.label ?? 'Encounter Complete',
    summary: variant.summary ?? 'The encounter is complete.',
    outcome_label: variant.label ?? null,
    aftermath_state_title: 'Shrine Ruins Aftermath',
    rewards: {
      experience_points_awarded: state.encounter_resolution?.rewards?.experience_awarded ?? 0,
      pending_advancement: state.encounter_resolution?.rewards?.pending_advancement?.level_up_available === true,
    },
    chronological_log: grouped,
    calculation_details_available: events.length > 0,
  };
  state.post_combat_review = review;
  state.encounter_resolution = {
    ...(state.encounter_resolution ?? {}),
    post_combat_review: review,
  };
  return { status: 'built', state, review };
}

function buildAftermathResultBundle(state, variant) {
  return buildCombatPlayerResultBundle({
    attempted_action: {
      label: 'Resolve encounter aftermath',
      summary: 'Apply the supported encounter outcome and move to review.',
    },
    result: {
      label: variant.label,
      summary: variant.summary,
    },
    consequences: [
      { label: 'Combat closed', summary: 'Ordinary combat turns and actions are no longer available.' },
    ],
    discoveries: asArray(variant.outputs?.knowledge_outputs).map((entry) => ({
      knowledge_id: entry.knowledge_id,
      title: entry.title,
      summary: entry.player_summary,
    })),
    progress: asArray(variant.outputs?.objective_outputs).map((entry) => ({
      id: entry.objective_id,
      title: entry.title,
      summary: entry.player_summary,
      status: entry.status,
    })),
    next: {
      label: 'Review Shrine Ruins aftermath',
      summary: 'Review the outcome, rewards, objectives, and what remains unresolved.',
    },
    status: {
      state: 'encounter_aftermath_review',
      label: 'Encounter complete',
    },
  });
}

function markResolutionComplete(state, variant, playerResultBundle) {
  state.encounter_resolution = {
    ...(state.encounter_resolution ?? {}),
    status: ENCOUNTER_RESOLUTION_STATUSES.COMPLETE,
    outcome_id: variant.outcome_id,
    aftermath_state_id: variant.aftermath_state_id,
    aftermath_variant_id: variant.aftermath_variant_id,
    normal_combat_controls_locked: true,
    player_result_bundle: playerResultBundle,
    next_beat: {
      next_beat_kind: ENCOUNTER_RESOLUTION_NEXT_BEAT_KINDS.AFTERMATH_REVIEW,
      review_only: true,
      opens_combat_window: false,
      opens_adventure_state: variant.aftermath_state_id,
    },
  };
  state.normal_combat_controls_locked = true;
  if (state.combat) {
    state.combat.status = 'resolved';
    state.combat.resolution_status = 'aftermath_complete';
    state.combat.closed_reason = 'encounter_aftermath_complete';
  }
  if (state.parent_turn) {
    state.parent_turn.status = PLAYER_TURN_STATUSES.CLOSED;
    state.parent_turn.turn_close_reason = 'encounter_resolved';
  }
  if (state.action_window) {
    state.action_window.status = 'closed';
    state.action_window.close_reason = 'encounter_resolved';
  }
  if (state.canonical_rusk_handoff) {
    state.canonical_rusk_handoff.aftermath_applied = true;
    state.canonical_rusk_handoff.rewards_applied = true;
    state.canonical_rusk_handoff.objective_outputs_applied = true;
    state.canonical_rusk_handoff.knowledge_outputs_applied = true;
    state.canonical_rusk_handoff.history_outputs_applied = true;
    state.canonical_rusk_handoff.latest_development_applied = true;
  }
}

function enterEncounterResolutionRecovery(state, issue) {
  state.encounter_resolution = {
    ...(state.encounter_resolution ?? {}),
    status: ENCOUNTER_RESOLUTION_STATUSES.RECOVERY_NEEDED,
    normal_combat_controls_locked: true,
    recovery: {
      reason: cleanText(issue?.reason ?? issue?.code) || 'encounter_resolution_mismatch',
      player_safe_message: 'The encounter ending needs GM review before aftermath can be applied.',
      ordinary_controls_available: false,
      refresh_safe: true,
      retry_safe: false,
    },
  };
  state.normal_combat_controls_locked = true;
  if (state.combat) state.combat.status = 'recovery_needed';
  if (state.parent_turn) state.parent_turn.status = PLAYER_TURN_STATUSES.RECOVERY_NEEDED;
  return {
    status: ENCOUNTER_RESOLUTION_STATUSES.RECOVERY_NEEDED,
    state,
    player_safe_message: state.encounter_resolution.recovery.player_safe_message,
    read_model: projectEncounterResolutionForPlayer({ state }),
    gm_dev_trace: { reason: issue?.reason ?? issue?.code ?? null, issue },
  };
}

export function resolveEncounterAftermath(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  if (state.encounter_resolution?.status === ENCOUNTER_RESOLUTION_STATUSES.COMPLETE) {
    const duplicate = {
      status: ENCOUNTER_RESOLUTION_STATUSES.DUPLICATE_RETURNED,
      duplicate: true,
      state,
      player_result_bundle: state.encounter_resolution.player_result_bundle,
      read_model: projectEncounterResolutionForPlayer({ state }),
      next_beat: state.encounter_resolution.next_beat,
    };
    assertNoEncounterResolutionPlayerHiddenData(duplicate.read_model);
    return duplicate;
  }
  const phase = enterEncounterResolutionPhase(input);
  if (!phase.ready) {
    return {
      status: phase.status,
      state,
      player_safe_message: phase.mandatory_completion?.player_safe_message ?? phase.player_safe_message,
      read_model: projectEncounterResolutionForPlayer({ state }),
      gm_dev_trace: buildEncounterResolutionGmDevTrace({ state, phase: 'waiting_for_mandatory_completion' }),
    };
  }
  const selected = selectEncounterOutcome({ ...input, state, handoff: phase.handoff, definition: phase.definition });
  if (!selected.selected) {
    return enterEncounterResolutionRecovery(state, selected.gm_dev_trace ?? selected);
  }
  const variant = selected.variant;
  const resolutionId = state.encounter_resolution.resolution_id;
  const result = runDurableCombatOperation({
    state,
    operation_type: COMBAT_OPERATION_TYPES.ENCOUNTER_COMPLETION_HANDOFF,
    combat_id: phase.handoff.combat_id,
    encounter_id: phase.handoff.encounter_id,
    completion_handoff_id: stableId(['encounter-resolution', phase.handoff.combat_id, phase.handoff.outcome_id]),
    idempotency_key: input.idempotency_key ?? input.idempotencyKey ?? stableId(['encounter-resolution', resolutionId]),
    execute: ({ state: durableState, recordCheckpoint }) => {
      durableState.encounter_resolution.status = ENCOUNTER_RESOLUTION_STATUSES.RESOLVING;
      recordCheckpoint({
        checkpoint_kind: COMBAT_CHECKPOINT_KINDS.MUTATION_PERSISTED,
        data: { phase: 'resolution_claimed', resolution_id: resolutionId },
      });
      const finalization = finalizeEncounterParticipants({ state: durableState, outcome_id: variant.outcome_id });
      recordCheckpoint({
        checkpoint_kind: COMBAT_CHECKPOINT_KINDS.MUTATION_PERSISTED,
        data: { phase: 'participants_finalized', count: finalization.participant_finalization.length },
      });
      const persistence = expireCombatEffectsAndCarryPersistentEffects({ state: durableState });
      recordCheckpoint({
        checkpoint_kind: COMBAT_CHECKPOINT_KINDS.MUTATION_PERSISTED,
        data: { phase: 'combat_effects_finalized', condition_persistence: persistence.condition_persistence },
      });
      const rewardPlan = calculateEncounterRewards({
        variant,
        encounter_id: phase.definition.encounter_id,
        character_id: durableState.active_character_id ?? durableState.character_id,
        outcome_id: variant.outcome_id,
      });
      const rewards = applyEncounterRewards({
        state: durableState,
        reward_plan: rewardPlan,
        outcome_id: variant.outcome_id,
      });
      recordCheckpoint({
        checkpoint_kind: COMBAT_CHECKPOINT_KINDS.MUTATION_PERSISTED,
        data: { phase: 'rewards_applied', reward_application_id: rewards.rewards.reward_application_id },
      });
      applyAdventureStateUpdates({ state: durableState, variant });
      recordCheckpoint({
        checkpoint_kind: COMBAT_CHECKPOINT_KINDS.MUTATION_PERSISTED,
        data: { phase: 'adventure_state_updated', aftermath_state_id: variant.aftermath_state_id },
      });
      const playerResultBundle = buildAftermathResultBundle(durableState, variant);
      markResolutionComplete(durableState, variant, playerResultBundle);
      const review = buildPostCombatReview({ state: durableState, variant }).review;
      recordCheckpoint({
        checkpoint_kind: COMBAT_CHECKPOINT_KINDS.RESULT_PERSISTED,
        data: { phase: 'post_combat_review_built', review_id: review.review_id },
      });
      appendCombatEvent({
        state: durableState,
        event_type: 'encounter_aftermath_complete',
        player_safe_summary: variant.summary,
        detail: { encounter_id: phase.definition.encounter_id, outcome_id: variant.outcome_id },
      });
      const playerReadModel = projectEncounterResolutionForPlayer({ state: durableState });
      return {
        status: ENCOUNTER_RESOLUTION_STATUSES.COMPLETE,
        resolution_id: resolutionId,
        outcome_id: variant.outcome_id,
        aftermath_state_id: variant.aftermath_state_id,
        aftermath_variant_id: variant.aftermath_variant_id,
        player_result_bundle: playerResultBundle,
        read_model: playerReadModel,
        next_beat: durableState.encounter_resolution.next_beat,
        player_result: {
          status: 'encounter_complete',
          result: variant.summary,
          review_only: true,
        },
        player_safe_summary: variant.summary,
        gm_dev_trace: buildEncounterResolutionGmDevTrace({
          state: durableState,
          phase: 'resolved',
          definition: phase.definition,
          variant,
        }),
      };
    },
  });
  return {
    status: result.status === COMBAT_OPERATION_STATUSES.RESOLVED
      ? ENCOUNTER_RESOLUTION_STATUSES.COMPLETE
      : result.status,
    state,
    operation_id: result.operation_id,
    player_result_bundle: state.encounter_resolution?.player_result_bundle ?? result.result?.player_result_bundle,
    read_model: projectEncounterResolutionForPlayer({ state }),
    next_beat: state.encounter_resolution?.next_beat,
    durable_result: result,
    gm_dev_trace: buildEncounterResolutionGmDevTrace({ state, phase: 'resolve_result' }),
  };
}

export function rebuildEncounterResolutionReview(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  if (!state.encounter_resolution?.outcome_id) {
    return { status: ENCOUNTER_RESOLUTION_STATUSES.NOT_READY, review: null };
  }
  const definition = buildEncounterResolutionDefinition({ state });
  const variant = variantForOutcome(definition, state.encounter_resolution.outcome_id);
  if (!variant) return { status: ENCOUNTER_RESOLUTION_STATUSES.UNAVAILABLE, review: null };
  return buildPostCombatReview({ state, variant });
}

function safeParticipant(participant = {}) {
  const id = participantId(participant);
  const isPlayer = id === RUSK_PARTICIPANT_IDS.PLAYER || participant.faction === 'player' || participant.player_controlled === true;
  return {
    participant_id: id,
    display_name: participant.display_name ?? participant.name ?? id,
    is_player: isPlayer,
    hit_points: isPlayer
      ? {
          current: Math.max(0, participantHp(participant)),
          maximum: Math.max(1, toNumber(participant.max_hit_points ?? participant.maxHp ?? participant.max_hp, 1)),
          temporary: Math.max(0, toNumber(participant.temporary_hit_points ?? participant.temporaryHp ?? participant.temporary_hp, 0)),
        }
      : null,
    health_band: isPlayer ? null : healthBand(participant),
    defeated: participant.defeated === true || participant.dead === true || participantHp(participant) <= 0,
    surrendered: participant.surrendered === true,
    stable: participant.stable === true || participant.death_save_state?.stable === true,
  };
}

export function projectEncounterResolutionForPlayer(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const resolution = state.encounter_resolution ?? {};
  const review = state.post_combat_review ?? resolution.post_combat_review ?? null;
  const projection = {
    encounter_title: state.combat?.encounter_title ?? 'Combat Encounter',
    status: resolution.status ?? state.combat?.status ?? ENCOUNTER_RESOLUTION_STATUSES.NOT_READY,
    aftermath: resolution.aftermath_state_id || state.adventure_state?.current_state_id
      ? {
          state_id: resolution.aftermath_state_id ?? state.adventure_state.current_state_id,
          variant_id: resolution.aftermath_variant_id ?? state.adventure_state?.current_variant_id,
          title: state.adventure_state?.state_title ?? 'Encounter Aftermath',
          label: state.adventure_state?.variant_label ?? review?.outcome_label ?? null,
          summary: review?.summary ?? state.latest_development_output?.player_summary ?? null,
        }
      : null,
    result: resolution.player_result_bundle ?? null,
    rewards: resolution.rewards
      ? {
          experience_points_awarded: resolution.rewards.experience_awarded,
          items: asArray(resolution.rewards.items).map((item) => ({
            item_id: cleanText(item.item_id ?? item.id),
            label: cleanText(item.label ?? item.name),
            quantity: toNumber(item.quantity, 1),
          })),
          currency: resolution.rewards.currency ?? {},
          pending_advancement: resolution.rewards.pending_advancement
            ? {
                available: resolution.rewards.pending_advancement.level_up_available,
                target_level: resolution.rewards.pending_advancement.target_level,
                level_changed: false,
              }
            : null,
        }
      : null,
    objectives: asArray(state.objective_outputs).map((entry) => ({
      objective_id: entry.objective_id,
      title: entry.title,
      status: entry.status,
      progress: entry.progress,
      summary: entry.player_summary,
    })),
    knowledge: asArray(state.knowledge_outputs).map((entry) => ({
      knowledge_id: entry.knowledge_id,
      title: entry.title,
      summary: entry.player_summary,
      status: entry.status,
    })),
    history: asArray(state.history_outputs).map((entry) => ({
      history_id: entry.event_id,
      title: entry.title,
      summary: entry.player_summary,
    })),
    latest_development: state.latest_development_output
      ? {
          title: state.latest_development_output.title,
          summary: state.latest_development_output.player_summary,
        }
      : null,
    review: review
      ? {
          title: review.title,
          summary: review.summary,
          rewards: review.rewards,
          chronological_log: review.chronological_log,
          calculation_details_available: review.calculation_details_available,
        }
      : null,
    participants: asArray(state.participants).map(safeParticipant),
    ordinary_controls_available: false,
    combat_controls_available: false,
    next_step: resolution.status === ENCOUNTER_RESOLUTION_STATUSES.COMPLETE
      ? 'Review the aftermath and continue from the Shrine Ruins aftermath state.'
      : resolution.status === ENCOUNTER_RESOLUTION_STATUSES.WAITING_FOR_MANDATORY_COMPLETION
        ? 'Finish the required combat interruption before aftermath can apply.'
        : 'Wait for the encounter aftermath to finish resolving.',
  };
  assertNoEncounterResolutionPlayerHiddenData(projection);
  return projection;
}

export function buildEncounterResolutionGmDevTrace(input = {}) {
  const state = input.state ? ensureCombatPersistenceState(input.state) : null;
  const resolution = state?.encounter_resolution ?? {};
  return {
    trace_kind: 'encounter_resolution_aftermath_rewards',
    contract_stage: '6D.14',
    phase: input.phase ?? null,
    combat: cloneSerializable(state?.combat ?? null),
    handoff: cloneSerializable(state?.canonical_rusk_handoff ?? state?.encounter_completion_handoff ?? null),
    resolution: cloneSerializable(resolution),
    definition: cloneSerializable(input.definition ?? null),
    selected_variant: cloneSerializable(input.variant ?? null),
    participants: cloneSerializable(state?.participants ?? []),
    rewards: cloneSerializable(resolution.rewards ?? null),
    adventure_state: cloneSerializable(state?.adventure_state ?? null),
    outputs: {
      objectives: cloneSerializable(state?.objective_outputs ?? []),
      knowledge: cloneSerializable(state?.knowledge_outputs ?? []),
      history: cloneSerializable(state?.history_outputs ?? []),
      latest_development: cloneSerializable(state?.latest_development_output ?? null),
      archive_search: cloneSerializable(state?.archive_search_outputs ?? []),
    },
    post_combat_review: cloneSerializable(state?.post_combat_review ?? null),
    operation_order: cloneSerializable(state?.combat_persistence?.operation_order ?? []),
    visibility_filtering_notes: [
      'player_projection_keeps_aftermath_summary_rewards_and_review_only',
      'player_projection_omits_exact_enemy_statistics_operation_checkpoints_and_trace',
      'gm_dev_trace_retains_handoff_rewards_outputs_and_operation_order',
    ],
  };
}

export function assertNoEncounterResolutionPlayerHiddenData(payload = {}) {
  const serialized = JSON.stringify(payload);
  for (const forbidden of PLAYER_PROHIBITED_AFTERMATH_STRINGS) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Encounter resolution player payload contains prohibited data: ${forbidden}`);
    }
  }
  assertNoCombatPlayerHiddenData(payload);
  return true;
}
