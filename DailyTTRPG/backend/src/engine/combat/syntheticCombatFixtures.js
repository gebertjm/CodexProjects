import {
  COMBAT_ACTION_TIMING_CATEGORIES,
  COMBAT_EFFECT_TYPES,
  COMBAT_RESOURCE_CATEGORIES,
  COMBAT_TARGET_POLICIES,
} from './actionEffectResourceFramework.js';
import {
  AUTOMATIC_CONTROL_MODES,
  TACTICAL_OPERATION_CATEGORIES,
  createConservativeDefaultTacticalProfile,
  executeAutomaticOperation,
  openAutomaticCombatTurn,
  projectAutomaticForPlayer,
} from './automaticTurnRuntime.js';
import {
  COMBAT_CHECKPOINT_KINDS,
  COMBAT_OPERATION_TYPES,
  beginDurableCombatOperation,
  completeDurableCombatOperation,
  ensureCombatPersistenceState,
  enterCombatRecoveryNeeded,
  recordCombatOperationCheckpoint,
  resumeDurableCombatOperation,
} from './combatPersistenceRuntime.js';
import {
  buildCombatFocusContext,
  buildCombatFocusReadModel,
  projectCombatFocusForPlayer,
  resolveCombatFocusQuestion,
} from './combatFocus.js';
import {
  buildCombatVisibilityDecisionReport,
  validateCombatInspectorProjectionSafety,
} from './combatTraceVisibilityInspector.js';
import {
  CONDITION_IDS,
  createConditionInstance,
  evaluateZeroHitPointTransition,
  startConcentration,
} from './conditionStateLifecycle.js';
import {
  buildEncounterResolutionDefinition,
  projectEncounterResolutionForPlayer,
} from './encounterResolutionRuntime.js';
import {
  DND5E_2014_RULESET,
  openPlayerCombatTurn,
  previewAction,
  previewEndTurn,
  previewMovement,
  projectPlayerTurnForPlayer,
  submitAction,
  submitEndTurn,
  submitMovement,
} from './playerTurnRuntime.js';
import {
  REACTION_PREFERENCE_VALUES,
  REACTION_TIMING_POINTS,
  REACTION_TRIGGER_TYPES,
  REACTION_TYPES,
  assertNoReactionPlayerHiddenData,
  collectEligibleReactions,
  createOpportunityAttackTriggerFromMovement,
  createReactionDefinition,
  createReactionQueue,
  createReactionResourceState,
  openPlayerReactionWindow,
  previewReaction,
  submitReaction,
} from './reactionInterruptRuntime.js';
import {
  COVER_CATEGORIES,
  CREATURE_SIZE_CATEGORIES,
  PROXIMITY_STATES,
  createSpatialRelationship,
  createZoneTransition,
} from './spatialMovement.js';
import {
  ALLY_CONFIRMATION_POLICIES,
  TARGET_INCLUSION_POLICIES,
  TARGET_SET_LOCK_POLICIES,
  buildTargetPreview,
} from './targetingParticipantDynamics.js';

export const SYNTHETIC_COMBAT_FIXTURE_STAGE = '6D.17';

export const SYNTHETIC_COMBAT_FIXTURE_LAYERS = Object.freeze({
  BACKEND_RUNTIME: 'backend_runtime',
  PERSISTENCE_REPLAY: 'persistence_replay',
  VISIBILITY_INSPECTOR: 'visibility_inspector',
  FLUTTER_CONTRACT: 'flutter_contract',
});

export const SYNTHETIC_COMBAT_FIXTURE_SUITES = Object.freeze({
  FOUNDATION: 'foundation',
  ACTION_RESOURCE: 'action_resource',
  CONDITION_CONCENTRATION: 'condition_concentration',
  POSITIONING: 'positioning',
  PLAYER_TURN: 'player_turn',
  REACTION_INTERRUPT: 'reaction_interrupt',
  AUTOMATIC_TURN: 'automatic_turn',
  MULTI_TARGET: 'multi_target',
  COMBAT_FOCUS: 'combat_focus',
  PERSISTENCE_RECOVERY: 'persistence_recovery',
  ENCOUNTER_RESOLUTION: 'encounter_resolution',
  VISIBILITY_INSPECTOR: 'visibility_inspector',
  FLUTTER: 'flutter',
});

export const SYNTHETIC_COMBAT_REQUIRED_MECHANICS = Object.freeze([
  { mechanic_id: 'ruleset.dnd5e_2014', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME] },
  { mechanic_id: 'preview.non_mutating', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME] },
  { mechanic_id: 'submit.commit_revalidate', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME] },
  { mechanic_id: 'result.player_bundle_safe', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME, SYNTHETIC_COMBAT_FIXTURE_LAYERS.FLUTTER_CONTRACT] },
  { mechanic_id: 'turn.parent_sub_resolution', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME] },
  { mechanic_id: 'turn.end_confirmation', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME, SYNTHETIC_COMBAT_FIXTURE_LAYERS.FLUTTER_CONTRACT] },
  { mechanic_id: 'movement.zone_cover_reach', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME] },
  { mechanic_id: 'movement.opportunity_candidate', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME] },
  { mechanic_id: 'action.resource_cost_dedupe', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME, SYNTHETIC_COMBAT_FIXTURE_LAYERS.PERSISTENCE_REPLAY] },
  { mechanic_id: 'condition.zero_hp', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME] },
  { mechanic_id: 'condition.concentration', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME] },
  { mechanic_id: 'reaction.interrupt_resume', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME, SYNTHETIC_COMBAT_FIXTURE_LAYERS.PERSISTENCE_REPLAY] },
  { mechanic_id: 'automatic.deterministic_profile', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME] },
  { mechanic_id: 'targeting.area_ally_visibility', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME] },
  { mechanic_id: 'combat_focus.question_reuse', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME, SYNTHETIC_COMBAT_FIXTURE_LAYERS.FLUTTER_CONTRACT] },
  { mechanic_id: 'persistence.replay_duplicate_conflict', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.PERSISTENCE_REPLAY] },
  { mechanic_id: 'recovery.needed_freezes_controls', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.PERSISTENCE_REPLAY] },
  { mechanic_id: 'resolution.after_action_review', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME, SYNTHETIC_COMBAT_FIXTURE_LAYERS.FLUTTER_CONTRACT] },
  { mechanic_id: 'visibility.player_denylist', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME, SYNTHETIC_COMBAT_FIXTURE_LAYERS.VISIBILITY_INSPECTOR, SYNTHETIC_COMBAT_FIXTURE_LAYERS.FLUTTER_CONTRACT] },
  { mechanic_id: 'inspector.gm_dev_projection', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.VISIBILITY_INSPECTOR] },
  { mechanic_id: 'flutter.state_contracts', required_layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.FLUTTER_CONTRACT] },
]);

const SYNTHETIC_PROHIBITED_STORY_FRAGMENTS = Object.freeze([
  'greyvale',
  'rusk',
  'shrine',
  'dunmere',
  'tomas',
  'elin',
  'mara',
  'lysa',
  'garren',
]);

const PLAYER_HIDDEN_DATA_FRAGMENTS = Object.freeze([
  'gm_notes',
  'debug_envelope',
  'hidden_dc',
  'raw_roll',
  'armor_class_hidden',
  'exact_enemy_hit_points',
  'hidden_requirements',
  'failed_hidden_requirements',
  'raw_state',
  'state_write',
  'mutation_plan',
  'idempotency_key',
  'source_state_version',
  'action_window_internal',
  'internal_routing',
  'combat_pending',
  'future_supported',
  'target_encounter_id',
  'branch_id',
  'path_harness',
  'stack trace',
  'trace_id',
  'gm_trace',
  'source file',
  '.js:',
  '.dart:',
]);

export const DEFAULT_SYNTHETIC_COMBAT_FIXTURES = Object.freeze([
  {
    fixture_id: 'synthetic.foundation.attack_roll_hit',
    fixture_version: '1.0.0',
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.FOUNDATION,
    title: 'Neutral attack roll hit',
    executor: 'player_turn_attack',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME],
    mechanics: [
      'ruleset.dnd5e_2014',
      'preview.non_mutating',
      'submit.commit_revalidate',
      'result.player_bundle_safe',
      'turn.parent_sub_resolution',
    ],
  },
  {
    fixture_id: 'synthetic.actions.resource_dedupe',
    fixture_version: '1.0.0',
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.ACTION_RESOURCE,
    title: 'Neutral action resource and duplicate boundary',
    executor: 'persistence_replay',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME, SYNTHETIC_COMBAT_FIXTURE_LAYERS.PERSISTENCE_REPLAY],
    mechanics: ['action.resource_cost_dedupe', 'persistence.replay_duplicate_conflict', 'visibility.player_denylist'],
  },
  {
    fixture_id: 'synthetic.conditions.concentration_zero_hp',
    fixture_version: '1.0.0',
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.CONDITION_CONCENTRATION,
    title: 'Neutral concentration and zero-hit-point transitions',
    executor: 'condition_concentration',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME],
    mechanics: ['condition.zero_hp', 'condition.concentration', 'visibility.player_denylist'],
  },
  {
    fixture_id: 'synthetic.positioning.cover_reach_movement',
    fixture_version: '1.0.0',
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.POSITIONING,
    title: 'Neutral movement, cover, reach, and opportunity candidate',
    executor: 'movement_reaction_handoff',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME],
    mechanics: ['movement.zone_cover_reach', 'movement.opportunity_candidate', 'preview.non_mutating'],
  },
  {
    fixture_id: 'synthetic.turn.preview_submit_end_turn',
    fixture_version: '1.0.0',
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.PLAYER_TURN,
    title: 'Neutral player turn preview, submit, and end-turn confirmation',
    executor: 'player_turn_end_turn',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME],
    mechanics: ['turn.parent_sub_resolution', 'turn.end_confirmation', 'preview.non_mutating', 'submit.commit_revalidate'],
  },
  {
    fixture_id: 'synthetic.reactions.opportunity_interrupt',
    fixture_version: '1.0.0',
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.REACTION_INTERRUPT,
    title: 'Neutral opportunity interrupt and resume',
    executor: 'reaction_interrupt',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME, SYNTHETIC_COMBAT_FIXTURE_LAYERS.PERSISTENCE_REPLAY],
    mechanics: ['reaction.interrupt_resume', 'movement.opportunity_candidate', 'result.player_bundle_safe'],
  },
  {
    fixture_id: 'synthetic.automatic.deterministic_profile',
    fixture_version: '1.0.0',
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.AUTOMATIC_TURN,
    title: 'Neutral automatic deterministic profile',
    executor: 'automatic_turn',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME],
    mechanics: ['automatic.deterministic_profile', 'visibility.player_denylist'],
  },
  {
    fixture_id: 'synthetic.targeting.area_ally_visibility',
    fixture_version: '1.0.0',
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.MULTI_TARGET,
    title: 'Neutral area target visibility and ally confirmation',
    executor: 'targeting_preview',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME],
    mechanics: ['targeting.area_ally_visibility', 'preview.non_mutating', 'visibility.player_denylist'],
  },
  {
    fixture_id: 'synthetic.focus.question_reuse',
    fixture_version: '1.0.0',
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.COMBAT_FOCUS,
    title: 'Neutral Combat Focus question and reuse surface',
    executor: 'combat_focus',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME, SYNTHETIC_COMBAT_FIXTURE_LAYERS.FLUTTER_CONTRACT],
    mechanics: ['combat_focus.question_reuse', 'flutter.state_contracts', 'visibility.player_denylist'],
  },
  {
    fixture_id: 'synthetic.persistence.replay_recovery',
    fixture_version: '1.0.0',
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.PERSISTENCE_RECOVERY,
    title: 'Neutral persistence replay and recovery',
    executor: 'persistence_recovery',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.PERSISTENCE_REPLAY],
    mechanics: ['persistence.replay_duplicate_conflict', 'recovery.needed_freezes_controls'],
  },
  {
    fixture_id: 'synthetic.resolution.after_action_review',
    fixture_version: '1.0.0',
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.ENCOUNTER_RESOLUTION,
    title: 'Neutral encounter resolution review contract',
    executor: 'encounter_resolution',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME, SYNTHETIC_COMBAT_FIXTURE_LAYERS.FLUTTER_CONTRACT],
    mechanics: ['resolution.after_action_review', 'result.player_bundle_safe'],
  },
  {
    fixture_id: 'synthetic.inspector.visibility_report',
    fixture_version: '1.0.0',
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.VISIBILITY_INSPECTOR,
    title: 'Neutral visibility and GM/dev inspector report',
    executor: 'visibility_inspector',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.VISIBILITY_INSPECTOR, SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME],
    mechanics: ['visibility.player_denylist', 'inspector.gm_dev_projection'],
  },
  {
    fixture_id: 'synthetic.flutter.active_turn_states',
    fixture_version: '1.0.0',
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.FLUTTER,
    title: 'Neutral Flutter combat state contracts',
    executor: 'flutter_projection',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.FLUTTER_CONTRACT],
    mechanics: ['flutter.state_contracts', 'result.player_bundle_safe', 'turn.end_confirmation', 'visibility.player_denylist'],
  },
]);

function cleanText(value, fallback = '') {
  if (value == null) return fallback;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || fallback;
}

export function cloneFixtureValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function fixtureError(message, details = {}) {
  const error = new Error(message);
  error.code = details.code ?? 'SYNTHETIC_FIXTURE_ERROR';
  error.details = details;
  return error;
}

function stableSyntheticId(parts = []) {
  return asArray(parts).map((part) => cleanText(part, 'none').replace(/[^a-zA-Z0-9_-]+/g, '-')).join(':');
}

function assertSyntheticExecutionAllowed(input = {}) {
  if (input.allow_synthetic_fixtures !== true && input.allowSyntheticFixtures !== true) {
    throw fixtureError('Synthetic combat fixtures are disabled unless explicitly enabled for test/dev execution.', {
      code: 'SYNTHETIC_FIXTURES_DISABLED',
    });
  }
}

export function buildSyntheticParticipant(overrides = {}) {
  const id = cleanText(overrides.participant_id ?? overrides.participantId, 'pc-1');
  return {
    participant_id: id,
    display_name: cleanText(overrides.display_name ?? overrides.displayName, id),
    faction: cleanText(overrides.faction, id.startsWith('enemy') ? 'enemy' : 'player'),
    control_mode: cleanText(overrides.control_mode ?? overrides.controlMode, id.startsWith('enemy') ? AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ENEMY : AUTOMATIC_CONTROL_MODES.PLAYER),
    player_controlled: overrides.player_controlled ?? overrides.playerControlled ?? !id.startsWith('enemy'),
    is_player_character: overrides.is_player_character ?? overrides.isPlayerCharacter ?? !id.startsWith('enemy'),
    current_zone_id: cleanText(overrides.current_zone_id ?? overrides.currentZoneId, 'training-yard'),
    size: cleanText(overrides.size, CREATURE_SIZE_CATEGORIES.MEDIUM),
    speed: overrides.speed ?? 30,
    speed_walk: overrides.speed_walk ?? overrides.speed ?? 30,
    armor_class: overrides.armor_class ?? overrides.armorClass ?? 13,
    current_hit_points: overrides.current_hit_points ?? overrides.currentHitPoints ?? 20,
    max_hit_points: overrides.max_hit_points ?? overrides.maxHitPoints ?? 20,
    temporary_hit_points: overrides.temporary_hit_points ?? overrides.temporaryHitPoints ?? 0,
    active: overrides.active ?? true,
    defeated: overrides.defeated ?? false,
    hidden: overrides.hidden ?? false,
    can_be_perceived: overrides.can_be_perceived ?? overrides.canBePerceived ?? true,
    visible: overrides.visible ?? true,
    turn_order: overrides.turn_order ?? overrides.turnOrder,
    initiative_position: overrides.initiative_position ?? overrides.initiativePosition,
    relationships: cloneFixtureValue(overrides.relationships ?? []),
    ...overrides,
  };
}

export function buildSyntheticAction(actionId, timingCategory = COMBAT_ACTION_TIMING_CATEGORIES.ACTION, overrides = {}) {
  return {
    action_id: actionId,
    player_label: cleanText(overrides.player_label ?? overrides.playerLabel, actionId.replace(/[-_]/g, ' ')),
    ruleset: DND5E_2014_RULESET,
    timing_category: timingCategory,
    target_policy: overrides.target_policy ?? overrides.targetPolicy ?? COMBAT_TARGET_POLICIES.NO_TARGET,
    target_inclusion_policy: overrides.target_inclusion_policy ?? overrides.targetInclusionPolicy,
    action_level_costs: cloneFixtureValue(overrides.action_level_costs ?? overrides.actionLevelCosts ?? []),
    concentration: cloneFixtureValue(overrides.concentration ?? null),
    authored_metadata: cloneFixtureValue(overrides.authored_metadata ?? overrides.authoredMetadata ?? {}),
    effect_steps: cloneFixtureValue(overrides.effect_steps ?? overrides.effectSteps ?? [
      {
        step_id: 'marker',
        order: 1,
        effect_type: COMBAT_EFFECT_TYPES.STATE_MARKER,
        player_summary: `${cleanText(overrides.player_label ?? overrides.playerLabel, actionId)} resolves.`,
      },
    ]),
  };
}

function syntheticStrike(overrides = {}) {
  return buildSyntheticAction('synthetic-strike', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, {
    player_label: 'Synthetic Strike',
    target_policy: COMBAT_TARGET_POLICIES.ONE_ENEMY,
    target_inclusion_policy: {
      policy_id: TARGET_INCLUSION_POLICIES.SELECTED_CREATURES_UP_TO_LIMIT,
      action_id: 'synthetic-strike',
      min_targets: 1,
      max_targets: 1,
      visibility_required: true,
      authored_filter: { relationships: ['hostile'] },
      player_safe_description: 'Choose one visible hostile target.',
      target_set_lock_policy: TARGET_SET_LOCK_POLICIES.DYNAMIC_AUTHORED_REVALIDATE_EACH_TARGET,
    },
    effect_steps: [
      { step_id: 'attack', order: 1, effect_type: COMBAT_EFFECT_TYPES.ATTACK_ROLL },
      {
        step_id: 'damage',
        order: 2,
        effect_type: COMBAT_EFFECT_TYPES.DIRECT_DAMAGE,
        depends_on_step_id: 'attack',
        requires_outcome: { was_hit: true },
        params: {
          linked_attack_step_id: 'attack',
          components: [{ damage_type: 'slashing', dice_count: 1, dice_size: 6, flat_modifier: 2 }],
        },
      },
    ],
    ...overrides,
  });
}

function syntheticAreaAction() {
  return buildSyntheticAction('synthetic-area-burst', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, {
    player_label: 'Synthetic Area Burst',
    target_policy: COMBAT_TARGET_POLICIES.AREA,
    target_inclusion_policy: {
      policy_id: TARGET_INCLUSION_POLICIES.ALL_CREATURES_IN_TARGET_GROUP,
      action_id: 'synthetic-area-burst',
      target_group: 'training-yard-group',
      visibility_required: true,
      ally_confirmation_policy: ALLY_CONFIRMATION_POLICIES.ANY_VISIBLE_NON_HOSTILE,
      player_safe_description: 'Affects visible creatures in the training yard.',
    },
    effect_steps: [
      { step_id: 'save', order: 1, effect_type: COMBAT_EFFECT_TYPES.SAVING_THROW, params: { ability: 'dexterity', difficulty_class: 12 } },
      {
        step_id: 'damage',
        order: 2,
        effect_type: COMBAT_EFFECT_TYPES.DIRECT_DAMAGE,
        params: { components: [{ damage_type: 'force', dice_count: 2, dice_size: 4, flat_modifier: 0 }] },
      },
    ],
  });
}

function syntheticReactionDefinition() {
  return createReactionDefinition({
    reaction_id: 'synthetic-opportunity-strike',
    reaction_type: REACTION_TYPES.OPPORTUNITY_ATTACK,
    player_name: 'Synthetic Opportunity Strike',
    trigger_type: REACTION_TRIGGER_TYPES.OPPORTUNITY_ATTACK,
    timing_point: REACTION_TIMING_POINTS.BEFORE_MOVEMENT_LEAVES_THREATENED_REACH,
    action_definition: buildSyntheticAction('synthetic-opportunity-strike', COMBAT_ACTION_TIMING_CATEGORIES.REACTION, {
      player_label: 'Synthetic Opportunity Strike',
      target_policy: COMBAT_TARGET_POLICIES.ONE_ENEMY,
      authored_metadata: { attack_kind: 'melee' },
      effect_steps: [
        { step_id: 'attack', order: 1, effect_type: COMBAT_EFFECT_TYPES.ATTACK_ROLL },
        {
          step_id: 'damage',
          order: 2,
          effect_type: COMBAT_EFFECT_TYPES.DIRECT_DAMAGE,
          depends_on_step_id: 'attack',
          requires_outcome: { was_hit: true },
          params: {
            linked_attack_step_id: 'attack',
            components: [{ damage_type: 'slashing', dice_count: 1, dice_size: 4, flat_modifier: 1 }],
          },
        },
      ],
    }),
    authored_priority: 10,
    preference_key: 'opportunity_attack',
    player_safe_description: 'Strike as a creature leaves reach.',
  });
}

export function buildSyntheticCombatState(overrides = {}) {
  const relationship = createSpatialRelationship({
    participant_a_id: 'pc-1',
    participant_b_id: 'enemy-1',
    proximity: overrides.pc_enemy_proximity ?? PROXIMITY_STATES.ENGAGED,
  });
  const participants = overrides.participants ?? [
    buildSyntheticParticipant({
      participant_id: 'pc-1',
      display_name: 'Avery Test',
      faction: 'player',
      control_mode: AUTOMATIC_CONTROL_MODES.PLAYER,
      player_controlled: true,
      is_player_character: true,
      current_zone_id: 'training-yard',
      relationships: [relationship],
      turn_order: 1,
      initiative_position: 1,
    }),
    buildSyntheticParticipant({
      participant_id: 'enemy-1',
      display_name: 'Training Adversary',
      faction: 'enemy',
      control_mode: AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ENEMY,
      player_controlled: false,
      is_player_character: false,
      current_hit_points: 12,
      max_hit_points: 12,
      armor_class: 12,
      current_zone_id: 'training-yard',
      relationships: [relationship],
      turn_order: 2,
      initiative_position: 2,
    }),
    buildSyntheticParticipant({
      participant_id: 'ally-1',
      display_name: 'Test Ally',
      faction: 'player',
      control_mode: AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ALLY,
      player_controlled: false,
      is_player_character: false,
      current_hit_points: 10,
      max_hit_points: 10,
      current_zone_id: 'training-yard',
      turn_order: 3,
      initiative_position: 3,
    }),
  ];
  return {
    combat: {
      combat_id: cleanText(overrides.combat_id ?? overrides.combatId, 'synthetic-combat'),
      encounter_id: 'synthetic-neutral-encounter',
      encounter_title: 'Neutral Synthetic Encounter',
      status: 'active',
      ruleset: DND5E_2014_RULESET,
      round_number: 1,
      initiative_position: 1,
      current_participant_id: cleanText(overrides.current_participant_id ?? overrides.currentParticipantId, 'pc-1'),
      current_state_version: 'synthetic-v1',
      ...(overrides.combat ?? {}),
    },
    current_participant_id: cleanText(overrides.current_participant_id ?? overrides.currentParticipantId, 'pc-1'),
    current_state_version: 'synthetic-v1',
    participants,
    actions: overrides.actions ?? [
      syntheticStrike(),
      buildSyntheticAction('synthetic-bonus-guard', COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION, {
        player_label: 'Synthetic Bonus Guard',
        target_policy: COMBAT_TARGET_POLICIES.SELF,
      }),
      buildSyntheticAction('synthetic-signal', COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION, {
        player_label: 'Synthetic Signal',
        target_policy: COMBAT_TARGET_POLICIES.SELF,
      }),
      buildSyntheticAction('synthetic-dash', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, {
        player_label: 'Dash',
        authored_metadata: { runtime_effect: 'dash' },
      }),
      buildSyntheticAction('synthetic-dodge', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, {
        player_label: 'Dodge',
        authored_metadata: { runtime_effect: 'dodge' },
      }),
      syntheticAreaAction(),
    ],
    resources: overrides.resources ?? [
      {
        resource_id: 'synthetic-limited-use',
        label: 'Synthetic Limited Use',
        category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE,
        owner_ref: 'pc-1',
        current: 1,
        maximum: 1,
      },
    ],
    conditions: overrides.conditions ?? [],
    spatial: overrides.spatial ?? {
      participants: [
        {
          participant_id: 'pc-1',
          current_zone_id: 'training-yard',
          size: CREATURE_SIZE_CATEGORIES.MEDIUM,
          speed: 30,
          relationships: [relationship],
          cover_relationships: [{ source_id: 'crate', category: COVER_CATEGORIES.HALF }],
        },
        {
          participant_id: 'enemy-1',
          current_zone_id: 'training-yard',
          size: CREATURE_SIZE_CATEGORIES.MEDIUM,
          speed: 30,
          relationships: [relationship],
        },
      ],
      zones: [
        { zone_id: 'training-yard', label: 'Training Yard' },
        { zone_id: 'cover-line', label: 'Cover Line' },
        { zone_id: 'far-marker', label: 'Far Marker' },
      ],
      transitions: [
        createZoneTransition({
          transition_id: 'yard-to-cover',
          source_zone_id: 'training-yard',
          destination_zone_id: 'cover-line',
          base_cost: 10,
          player_description: 'Move to the cover line.',
        }),
        createZoneTransition({
          transition_id: 'cover-to-marker',
          source_zone_id: 'cover-line',
          destination_zone_id: 'far-marker',
          base_cost: 15,
        }),
      ],
    },
    reaction_definitions: overrides.reaction_definitions ?? [syntheticReactionDefinition()],
    reaction_triggers: overrides.reaction_triggers ?? {},
    reaction_queues: overrides.reaction_queues ?? {},
    reaction_windows: overrides.reaction_windows ?? {},
    reaction_resources: overrides.reaction_resources ?? {
      'enemy-1': createReactionResourceState({ participant_id: 'enemy-1' }),
      'pc-1': createReactionResourceState({ participant_id: 'pc-1' }),
    },
    reaction_preferences: overrides.reaction_preferences ?? {
      'enemy-1': { opportunity_attack: REACTION_PREFERENCE_VALUES.ASK },
    },
    tactical_profiles: overrides.tactical_profiles ?? [createConservativeDefaultTacticalProfile()],
    combat_focus_answers: overrides.combat_focus_answers ?? [],
    faction_relationships: overrides.faction_relationships ?? [
      { faction_a: 'player', faction_b: 'enemy', relationship: 'hostile' },
      { faction_a: 'player', faction_b: 'player', relationship: 'ally' },
    ],
    participant_revision: 'synthetic-participants-v1',
    faction_revision: 'synthetic-factions-v1',
    ...(overrides.rest ?? {}),
  };
}

function fixtureContainsProhibitedStory(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  return SYNTHETIC_PROHIBITED_STORY_FRAGMENTS.filter((fragment) => serialized.includes(fragment));
}

export function validateSyntheticCombatFixture(fixture = {}) {
  const issues = [];
  if (!cleanText(fixture.fixture_id)) issues.push({ code: 'missing_fixture_id' });
  if (!cleanText(fixture.fixture_version)) issues.push({ code: 'missing_fixture_version' });
  if (!cleanText(fixture.suite_id)) issues.push({ code: 'missing_suite_id' });
  if (!cleanText(fixture.executor)) issues.push({ code: 'missing_executor' });
  if (asArray(fixture.layers).length === 0) issues.push({ code: 'missing_layers' });
  if (asArray(fixture.mechanics).length === 0) issues.push({ code: 'missing_mechanics' });
  const prohibited = fixtureContainsProhibitedStory(fixture);
  if (prohibited.length > 0) {
    issues.push({ code: 'prohibited_story_fixture_reference', fragments: prohibited });
  }
  if (fixture.ruleset && JSON.stringify(fixture.ruleset) !== JSON.stringify(DND5E_2014_RULESET)) {
    issues.push({ code: 'unsupported_ruleset' });
  }
  return {
    valid: issues.length === 0,
    fixture_id: fixture.fixture_id ?? null,
    issues,
  };
}

export function createSyntheticFixtureRegistry(fixtures = DEFAULT_SYNTHETIC_COMBAT_FIXTURES) {
  const registry = new Map();
  const issues = [];
  for (const fixture of fixtures) {
    const validation = validateSyntheticCombatFixture(fixture);
    if (!validation.valid) {
      issues.push(...validation.issues.map((issue) => ({ ...issue, fixture_id: fixture.fixture_id ?? null })));
    }
    if (registry.has(fixture.fixture_id)) {
      issues.push({ code: 'duplicate_fixture_id', fixture_id: fixture.fixture_id });
    }
    registry.set(fixture.fixture_id, Object.freeze({ ruleset: DND5E_2014_RULESET, ...cloneFixtureValue(fixture) }));
  }
  return {
    fixture_count: registry.size,
    valid: issues.length === 0,
    issues,
    list: (filter = {}) => [...registry.values()]
      .filter((fixture) => !filter.suite_id || fixture.suite_id === filter.suite_id)
      .filter((fixture) => !filter.layer || asArray(fixture.layers).includes(filter.layer))
      .map(cloneFixtureValue),
    get: (fixtureId) => cloneFixtureValue(registry.get(fixtureId)),
  };
}

export function validateSyntheticCombatFixtureRegistry(fixtures = DEFAULT_SYNTHETIC_COMBAT_FIXTURES) {
  return createSyntheticFixtureRegistry(fixtures);
}

export function listSyntheticCombatFixtures(input = {}) {
  if (input.environment === 'production' && input.allow_synthetic_fixtures !== true && input.allowSyntheticFixtures !== true) {
    throw fixtureError('Synthetic combat fixtures are not listable in production without explicit test/dev opt-in.', {
      code: 'SYNTHETIC_FIXTURES_DISABLED',
    });
  }
  return createSyntheticFixtureRegistry(input.fixtures ?? DEFAULT_SYNTHETIC_COMBAT_FIXTURES).list(input);
}

export function getSyntheticCombatFixture(fixtureId, input = {}) {
  const fixture = createSyntheticFixtureRegistry(input.fixtures ?? DEFAULT_SYNTHETIC_COMBAT_FIXTURES).get(fixtureId);
  if (!fixture) {
    throw fixtureError(`Unknown synthetic combat fixture: ${fixtureId}`, { code: 'UNKNOWN_SYNTHETIC_FIXTURE', fixture_id: fixtureId });
  }
  return fixture;
}

let syntheticRunSequence = 0;

export function createSyntheticFixtureRunContext(input = {}) {
  const fixture = input.fixture ?? getSyntheticCombatFixture(input.fixture_id ?? input.fixtureId);
  syntheticRunSequence += 1;
  return {
    fixture_id: fixture.fixture_id,
    fixture_version: fixture.fixture_version,
    fixture_run_id: cleanText(input.fixture_run_id ?? input.fixtureRunId) || stableSyntheticId(['synthetic-run', fixture.fixture_id, syntheticRunSequence]),
    stage: SYNTHETIC_COMBAT_FIXTURE_STAGE,
    status: 'created',
    checkpoints: [],
    warnings: [],
    errors: [],
    cleanup: { reset_called: false, destroy_called: false },
    state: null,
  };
}

export function resetSyntheticFixtureRunContext(context = {}) {
  context.checkpoints = [];
  context.warnings = [];
  context.errors = [];
  context.state = null;
  context.cleanup = { ...(context.cleanup ?? {}), reset_called: true };
  return context;
}

export function destroySyntheticFixtureRunContext(context = {}) {
  context.state = null;
  context.cleanup = { ...(context.cleanup ?? {}), destroy_called: true };
  context.status = 'destroyed';
  return context;
}

function pushCheckpoint(context, checkpoint_id, detail = {}) {
  const checkpoint = {
    checkpoint_id,
    order: context.checkpoints.length + 1,
    detail: cloneFixtureValue(detail),
  };
  context.checkpoints.push(checkpoint);
  return checkpoint;
}

export function assertNoSyntheticFixturePlayerHiddenData(payload = {}) {
  const serialized = JSON.stringify(payload).toLowerCase();
  const leaks = PLAYER_HIDDEN_DATA_FRAGMENTS.filter((fragment) => serialized.includes(fragment));
  if (leaks.length > 0) {
    throw fixtureError('Synthetic fixture player projection leaked hidden combat data.', {
      code: 'SYNTHETIC_PLAYER_HIDDEN_DATA_LEAK',
      leaks,
    });
  }
  return true;
}

function executePlayerTurnAttack(context) {
  const state = openPlayerCombatTurn(buildSyntheticCombatState()).state;
  pushCheckpoint(context, 'turn_opened', { parent_turn_id: state.parent_turn.parent_turn_id });
  const before = JSON.stringify(state);
  const preview = previewAction({ state, action_id: 'synthetic-strike', target_id: 'enemy-1' });
  pushCheckpoint(context, 'preview_action', { mutates_state: preview.mutates_state, source_state_version: preview.source_state_version });
  if (JSON.stringify(state) !== before) throw fixtureError('Synthetic action preview mutated state.', { code: 'PREVIEW_MUTATED_STATE' });
  const result = submitAction({
    state,
    action_id: 'synthetic-strike',
    target_id: 'enemy-1',
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'synthetic-action-1',
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 18, damage: [4] },
  });
  const player = projectPlayerTurnForPlayer(result.read_model ?? result.current_read_model ?? result);
  assertNoSyntheticFixturePlayerHiddenData(player);
  pushCheckpoint(context, 'submit_action', {
    status: result.status,
    committed: result.committed,
    sub_resolution_count: asArray(result.state.parent_turn.sub_resolutions).length,
  });
  context.state = result.state;
  return { status: 'passed', read_model: player, trace: result.gm_dev_trace, result };
}

function executePlayerTurnEndTurn(context) {
  let state = openPlayerCombatTurn(buildSyntheticCombatState()).state;
  const preview = previewEndTurn(state);
  pushCheckpoint(context, 'preview_end_turn', { confirmation_required: preview.confirmation.required });
  const first = submitEndTurn({
    state,
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'synthetic-end-turn-1',
  });
  pushCheckpoint(context, 'end_turn_without_confirmation', { status: first.status });
  const moved = submitMovement({
    state,
    destination_zone_id: 'cover-line',
    selected_transition_ids: ['yard-to-cover'],
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'synthetic-move-before-end',
  });
  state = moved.state;
  const ended = submitEndTurn({
    state,
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'synthetic-end-turn-confirmed',
    confirm_end_turn: true,
  });
  const player = projectPlayerTurnForPlayer(ended.read_model ?? ended.current_read_model ?? ended);
  assertNoSyntheticFixturePlayerHiddenData(player);
  pushCheckpoint(context, 'end_turn_confirmed', { status: ended.status, turn_status: ended.state.parent_turn.status });
  context.state = ended.state;
  return { status: 'passed', read_model: player, trace: ended.gm_dev_trace, result: ended };
}

function executeMovementReactionHandoff(context) {
  const state = openPlayerCombatTurn(buildSyntheticCombatState()).state;
  const before = JSON.stringify(state);
  const preview = previewMovement({
    state,
    destination_zone_id: 'cover-line',
    selected_transition_ids: ['yard-to-cover'],
    before_proximity: PROXIMITY_STATES.ENGAGED,
    after_proximity: PROXIMITY_STATES.NEARBY,
  });
  if (JSON.stringify(state) !== before) throw fixtureError('Synthetic movement preview mutated state.', { code: 'PREVIEW_MUTATED_STATE' });
  const movement = submitMovement({
    state,
    destination_zone_id: 'cover-line',
    selected_transition_ids: ['yard-to-cover'],
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'synthetic-move-reaction',
    before_proximity: PROXIMITY_STATES.ENGAGED,
    after_proximity: PROXIMITY_STATES.NEARBY,
  });
  const player = projectPlayerTurnForPlayer(movement.read_model ?? movement.current_read_model ?? movement);
  assertNoSyntheticFixturePlayerHiddenData(player);
  pushCheckpoint(context, 'movement_reaction_handoff', {
    status: movement.status,
    next_decision: movement.next_decision?.next_decision_kind,
    has_reaction_trigger: movement.player_result_bundle?.known_reaction_trigger != null,
  });
  context.state = movement.state;
  return { status: 'passed', read_model: player, trace: movement.gm_dev_trace, result: movement };
}

function executeReactionInterrupt(context) {
  const state = openPlayerCombatTurn(buildSyntheticCombatState({
    participants: [
      buildSyntheticParticipant({ participant_id: 'pc-1', display_name: 'Avery Test', faction: 'player', control_mode: AUTOMATIC_CONTROL_MODES.PLAYER, player_controlled: true, is_player_character: true }),
      buildSyntheticParticipant({ participant_id: 'enemy-1', display_name: 'Training Adversary', faction: 'enemy', control_mode: AUTOMATIC_CONTROL_MODES.PLAYER, player_controlled: true, is_player_character: false }),
    ],
    reaction_preferences: { 'enemy-1': { opportunity_attack: REACTION_PREFERENCE_VALUES.ASK } },
  })).state;
  const trigger = createOpportunityAttackTriggerFromMovement({
    state,
    mover_participant_id: 'pc-1',
    before_proximity: PROXIMITY_STATES.ENGAGED,
    after_proximity: PROXIMITY_STATES.NEARBY,
    potential_reactors: ['enemy-1'],
    continuation_id: 'synthetic-continuation-1',
  });
  const collection = collectEligibleReactions({ state, trigger });
  const queue = createReactionQueue({ trigger, legal_reactions: collection.legal_reactions });
  state.reaction_queues[queue.queue_id] = queue;
  const opened = openPlayerReactionWindow({
    state,
    trigger,
    legal_reactions: collection.legal_reactions,
    participant_id: 'enemy-1',
  });
  assertNoReactionPlayerHiddenData(opened.read_model);
  const preview = previewReaction({
    state: opened.state,
    reaction_window_id: opened.reaction_window.reaction_window_id,
    reaction_id: 'synthetic-opportunity-strike',
  });
  const submitted = submitReaction({
    state: opened.state,
    reaction_window_id: opened.reaction_window.reaction_window_id,
    reaction_id: 'synthetic-opportunity-strike',
    source_state_version: opened.reaction_window.source_state_version,
    idempotency_key: 'synthetic-reaction-1',
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 18, damage: [3] },
  });
  pushCheckpoint(context, 'reaction_interrupt', {
    preview_mutates_state: preview.mutates_state,
    submit_status: submitted.status,
    continuation_id: opened.reaction_window.continuation_id,
  });
  context.state = submitted.state;
  return { status: 'passed', read_model: submitted.read_model, trace: submitted.gm_dev_trace, result: submitted };
}

function executeAutomaticTurn(context) {
  const state = buildSyntheticCombatState({
    current_participant_id: 'enemy-1',
    combat: { current_participant_id: 'enemy-1', initiative_position: 2 },
  });
  const opened = openAutomaticCombatTurn(state);
  const selected = executeAutomaticOperation({
    state: opened.state,
    operation: { operation_category: TACTICAL_OPERATION_CATEGORIES.ACTION, action_id: 'synthetic-strike', target_id: 'pc-1' },
    idempotency_key: 'synthetic-auto-strike',
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 18, damage: [2] },
  });
  const player = projectAutomaticForPlayer(selected);
  assertNoSyntheticFixturePlayerHiddenData(player);
  pushCheckpoint(context, 'automatic_turn', {
    status: selected.status,
    actor: selected.state.parent_turn?.actor_participant_id,
  });
  context.state = selected.state;
  return { status: 'passed', read_model: player.read_model, trace: selected.gm_dev_trace, result: selected };
}

function executeTargetingPreview(context) {
  const state = buildSyntheticCombatState({
    participants: [
      buildSyntheticParticipant({ participant_id: 'pc-1', display_name: 'Avery Test', faction: 'player', control_mode: AUTOMATIC_CONTROL_MODES.PLAYER }),
      buildSyntheticParticipant({ participant_id: 'enemy-1', display_name: 'Training Adversary', faction: 'enemy' }),
      buildSyntheticParticipant({ participant_id: 'ally-1', display_name: 'Test Ally', faction: 'player', control_mode: AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ALLY }),
      buildSyntheticParticipant({ participant_id: 'enemy-hidden', display_name: 'Hidden Adversary', faction: 'enemy', hidden: true, can_be_perceived: false }),
    ],
  });
  const action = syntheticAreaAction();
  const preview = buildTargetPreview({ state, action, actor_id: 'pc-1' });
  const player = preview;
  assertNoSyntheticFixturePlayerHiddenData(player);
  pushCheckpoint(context, 'targeting_preview', {
    visible_count: preview.visible_target_group.length,
    includes_hidden: JSON.stringify(preview).includes('enemy-hidden'),
    ally_confirmation_required: preview.visible_ally_confirmation.required,
  });
  context.state = state;
  return { status: 'passed', read_model: player, trace: { policy: preview.target_policy }, result: preview };
}

function executeCombatFocus(context) {
  const state = openPlayerCombatTurn(buildSyntheticCombatState()).state;
  const focusContext = buildCombatFocusContext({ state, actor_id: 'pc-1' });
  const answer = resolveCombatFocusQuestion({
    context: focusContext,
    question: 'Which reactions remain available?',
  });
  const readModel = buildCombatFocusReadModel({ context: focusContext, limit: 4 });
  const player = projectCombatFocusForPlayer(answer);
  assertNoSyntheticFixturePlayerHiddenData(player);
  pushCheckpoint(context, 'combat_focus', {
    answer_status: answer.status,
    read_model_status: readModel.status,
    suggestion_count: readModel.suggestions?.length ?? 0,
  });
  context.state = state;
  return { status: 'passed', read_model: { ...readModel, latest_answer: player.answer }, trace: answer.gm_dev_trace, result: answer };
}

function executeConditionConcentration(context) {
  const state = buildSyntheticCombatState();
  const concentrated = startConcentration({
    participant_id: 'pc-1',
    source_participant_id: 'pc-1',
    concentration: { label: 'Synthetic Focus' },
    existing_concentration: null,
  });
  const zero = evaluateZeroHitPointTransition({
    participant: buildSyntheticParticipant({ participant_id: 'enemy-1', current_hit_points: 0, max_hit_points: 12, faction: 'enemy' }),
    damage_context: { damage_type: 'slashing', nonlethal: true },
  });
  const prone = createConditionInstance({
    condition_type: CONDITION_IDS.PRONE,
    target_participant_id: 'pc-1',
    source_participant_id: 'enemy-1',
    duration: { duration_type: 'rounds', duration_value: 1, remaining_rounds: 1 },
  });
  const player = {
    status: 'evaluated',
    concentration: { label: concentrated.concentration?.label },
    zero_hit_point_status: zero.status,
    visible_conditions: [{ condition_type: prone.condition_type, label: prone.player_label }],
  };
  assertNoSyntheticFixturePlayerHiddenData(player);
  pushCheckpoint(context, 'condition_concentration', player);
  context.state = state;
  return { status: 'passed', read_model: player, trace: { concentrated, zero }, result: player };
}

function executePersistenceReplay(context) {
  const state = ensureCombatPersistenceState({
    ...buildSyntheticCombatState(),
    parent_turn: {
      parent_turn_id: 'synthetic-turn-1',
      combat_id: 'synthetic-combat',
      actor_participant_id: 'pc-1',
      status: 'open',
      round_number: 1,
      initiative_position: 1,
      action_window_id: 'synthetic-window-1',
      current_state_version: 'synthetic-v1',
      sub_resolutions: [],
    },
    action_window: { action_window_id: 'synthetic-window-1', status: 'open' },
  });
  const request = {
    operation_type: COMBAT_OPERATION_TYPES.PLAYER_ACTION,
    parent_turn_id: 'synthetic-turn-1',
    actor_participant_id: 'pc-1',
    action_id: 'synthetic-strike',
    target_id: 'enemy-1',
    source_state_version: 'synthetic-v1',
    idempotency_key: 'synthetic-persist-1',
  };
  const operation = beginDurableCombatOperation({ state, ...request });
  recordCombatOperationCheckpoint({
    state,
    operation_id: operation.operation_id,
    checkpoint_kind: COMBAT_CHECKPOINT_KINDS.ROLL_PERSISTED,
    detail: { roll_id: 'synthetic-roll-1', total: 18, origin: 'synthetic_fixture_roll_plan' },
  });
  completeDurableCombatOperation({
    state,
    operation_id: operation.operation_id,
    result: { player_result: { result: 'Synthetic operation resolved once.' } },
    player_safe_summary: 'Synthetic operation resolved once.',
  });
  const duplicate = beginDurableCombatOperation({ state, ...request });
  const conflict = beginDurableCombatOperation({ state, ...request, target_id: 'ally-1' });
  pushCheckpoint(context, 'persistence_replay', {
    duplicate_status: duplicate.status,
    conflict_status: conflict.status,
  });
  context.state = state;
  return { status: 'passed', read_model: { duplicate_status: duplicate.status, conflict_status: conflict.status }, trace: { operation, duplicate, conflict }, result: duplicate };
}

function executePersistenceRecovery(context) {
  const state = ensureCombatPersistenceState(buildSyntheticCombatState());
  const recovery = enterCombatRecoveryNeeded({
    state,
    recovery_kind: 'synthetic_partial_commit',
    failed_step: 'synthetic_effect_apply',
    player_safe_message: 'Combat needs a safe review before continuing.',
    gm_dev_repair_action: 'inspect_synthetic_fixture',
  });
  const resumed = resumeDurableCombatOperation({ state: recovery.state, operation_id: 'missing-operation' });
  const player = recovery.read_model ?? recovery.player_read_model ?? recovery;
  assertNoSyntheticFixturePlayerHiddenData(player);
  pushCheckpoint(context, 'persistence_recovery', {
    recovery_status: recovery.status,
    resume_status: resumed.status,
  });
  context.state = recovery.state;
  return { status: 'passed', read_model: player, trace: recovery.gm_dev_trace, result: recovery };
}

function executeEncounterResolution(context) {
  const definition = buildEncounterResolutionDefinition({
    encounter_id: 'synthetic-neutral-encounter',
    encounter_title: 'Neutral Synthetic Encounter',
    shared_aftermath_state_id: 'synthetic-aftermath',
    outcomes: [
      {
        outcome_id: 'synthetic-victory',
        aftermath_state_id: 'synthetic-aftermath',
        aftermath_variant_id: 'synthetic-victory',
        label: 'Synthetic Victory',
        summary: 'The neutral fixture encounter is resolved.',
        resolution_path: 'combat',
        reward_value: { xp: 1, grant_on_resolution: true },
        outputs: { history: [{ history_id: 'synthetic-resolution-history' }] },
      },
    ],
  });
  const player = projectEncounterResolutionForPlayer({
    status: 'complete',
    definition,
    aftermath: {
      state_id: 'synthetic-aftermath',
      title: 'Synthetic Aftermath',
      summary: 'The neutral fixture encounter is resolved.',
    },
    rewards: { experience_points_awarded: 1, pending_advancement: { available: false } },
    review: { title: 'Synthetic Review', summary: 'Review the fixture outcome.' },
  });
  assertNoSyntheticFixturePlayerHiddenData(player);
  pushCheckpoint(context, 'encounter_resolution', {
    outcome_count: definition.variants.length,
    player_status: player.status,
  });
  return { status: 'passed', read_model: player, trace: { definition }, result: player };
}

function executeVisibilityInspector(context) {
  const state = ensureCombatPersistenceState(buildSyntheticCombatState());
  const safety = validateCombatInspectorProjectionSafety({
    state,
    viewer: { participant_id: 'pc-1' },
  });
  const report = buildCombatVisibilityDecisionReport({
    state,
    viewer_participant_id: 'pc-1',
  });
  const playerReadModel = { safety_status: safety.status };
  assertNoSyntheticFixturePlayerHiddenData(playerReadModel);
  pushCheckpoint(context, 'visibility_inspector', {
    safety_status: safety.status,
    decision_count: report.decisions.length,
  });
  context.state = state;
  return { status: 'passed', read_model: playerReadModel, trace: { safety, report }, result: safety };
}

export function projectSyntheticFixtureForFlutter(input = {}) {
  const stateKind = cleanText(input.state_kind ?? input.stateKind, 'active_turn');
  const base = {
    encounter_title: 'Neutral Synthetic Encounter',
    combat_status: stateKind === 'recovery' ? 'recovery_needed' : stateKind === 'resolution' ? 'complete' : 'active',
    round: 1,
    current_actor: {
      participant_id: 'pc-1',
      display_name: 'Avery Test',
      is_actor: true,
      is_player: true,
      hit_points: { current: 18, max: 20, temporary: 0 },
    },
    visible_participants: [
      {
        participant_id: 'pc-1',
        display_name: 'Avery Test',
        is_player: true,
        hit_points: { current: 18, max: 20 },
      },
      {
        participant_id: 'enemy-1',
        display_name: 'Training Adversary',
        health_band: 'hurt',
      },
    ],
    movement: { base_movement: 30, movement_spent: 10, movement_remaining: 20 },
    legal_decision_categories: [
      { category: 'action', status: 'available', available: true },
      { category: 'end_turn', status: 'available', available: true },
    ],
    available_authored_actions: [
      {
        action_id: 'synthetic-strike',
        label: 'Synthetic Strike',
        timing_category: 'action',
        available: true,
        target_candidates: [{ target_id: 'enemy-1', label: 'Training Adversary', health_band: 'hurt' }],
      },
    ],
    latest_result: {
      operation_name: 'Synthetic Strike',
      result: 'The strike resolves in the fixture.',
    },
    next_step: 'Choose another combat option or end your turn.',
  };
  if (stateKind === 'reaction') {
    return {
      ...base,
      reaction_state: 'waiting_for_player',
      trigger: { summary: 'Training Adversary leaves your reach.' },
      legal_reaction_options: [{ reaction_id: 'synthetic-opportunity-strike', label: 'Opportunity Strike' }],
      decline_option: { label: 'Let it pass' },
      ordinary_controls_available: false,
    };
  }
  if (stateKind === 'recovery') {
    return {
      ...base,
      recovery_needed_message: 'Combat needs a safe review before continuing.',
      ordinary_controls_available: false,
      combat_controls_available: false,
    };
  }
  if (stateKind === 'resolution') {
    return {
      ...base,
      aftermath: {
        title: 'Synthetic Aftermath',
        summary: 'The neutral fixture encounter is resolved.',
      },
      rewards: {
        experience_points_awarded: 1,
        pending_advancement: { available: false },
      },
      review: {
        title: 'Synthetic Review',
        summary: 'Review the fixture outcome.',
      },
      ordinary_controls_available: false,
    };
  }
  if (stateKind === 'focus') {
    return {
      ...base,
      focus: {
        status: 'available',
        suggestions: [{ template_id: 'self.movement_remaining', question: 'How much movement remains?' }],
      },
    };
  }
  return base;
}

function executeFlutterProjection(context) {
  const projections = ['active_turn', 'reaction', 'recovery', 'resolution', 'focus']
    .map((stateKind) => projectSyntheticFixtureForFlutter({ state_kind: stateKind }));
  for (const projection of projections) {
    assertNoSyntheticFixturePlayerHiddenData(projection);
  }
  pushCheckpoint(context, 'flutter_projection', { state_count: projections.length });
  return { status: 'passed', read_model: projections[0], trace: { state_kinds: ['active_turn', 'reaction', 'recovery', 'resolution', 'focus'] }, result: { projections } };
}

const EXECUTORS = Object.freeze({
  player_turn_attack: executePlayerTurnAttack,
  player_turn_end_turn: executePlayerTurnEndTurn,
  movement_reaction_handoff: executeMovementReactionHandoff,
  reaction_interrupt: executeReactionInterrupt,
  automatic_turn: executeAutomaticTurn,
  targeting_preview: executeTargetingPreview,
  combat_focus: executeCombatFocus,
  condition_concentration: executeConditionConcentration,
  persistence_replay: executePersistenceReplay,
  persistence_recovery: executePersistenceRecovery,
  encounter_resolution: executeEncounterResolution,
  visibility_inspector: executeVisibilityInspector,
  flutter_projection: executeFlutterProjection,
});

export function runSyntheticCombatFixture(input = {}) {
  assertSyntheticExecutionAllowed(input);
  const fixture = input.fixture ?? getSyntheticCombatFixture(input.fixture_id ?? input.fixtureId, input);
  const validation = validateSyntheticCombatFixture(fixture);
  if (!validation.valid) {
    throw fixtureError('Synthetic combat fixture failed validation.', {
      code: 'INVALID_SYNTHETIC_FIXTURE',
      fixture_id: fixture.fixture_id,
      issues: validation.issues,
    });
  }
  const context = createSyntheticFixtureRunContext({ fixture, fixture_run_id: input.fixture_run_id ?? input.fixtureRunId });
  const executor = EXECUTORS[fixture.executor];
  if (!executor) {
    throw fixtureError(`No synthetic fixture executor registered for ${fixture.executor}.`, {
      code: 'UNKNOWN_SYNTHETIC_EXECUTOR',
      fixture_id: fixture.fixture_id,
      executor: fixture.executor,
    });
  }
  try {
    const result = executor(context, fixture, input);
    context.status = 'passed';
    return {
      fixture: cloneFixtureValue(fixture),
      context: cloneFixtureValue(context),
      status: result.status ?? 'passed',
      checkpoints: cloneFixtureValue(context.checkpoints),
      read_model: cloneFixtureValue(result.read_model),
      gm_dev_trace: cloneFixtureValue(result.trace),
      result: cloneFixtureValue(result.result),
    };
  } catch (error) {
    context.status = 'failed';
    context.errors.push({ message: error.message, code: error.code ?? 'SYNTHETIC_FIXTURE_EXECUTION_FAILED' });
    throw fixtureError('Synthetic combat fixture execution failed.', {
      code: 'SYNTHETIC_FIXTURE_EXECUTION_FAILED',
      fixture_id: fixture.fixture_id,
      cause: error.message,
      failure_report: buildSyntheticFixtureFailureReport(error, context),
    });
  }
}

export function runSyntheticCombatFixtureSuite(input = {}) {
  assertSyntheticExecutionAllowed(input);
  const registry = createSyntheticFixtureRegistry(input.fixtures ?? DEFAULT_SYNTHETIC_COMBAT_FIXTURES);
  const fixtures = registry.list({ suite_id: input.suite_id ?? input.suiteId, layer: input.layer });
  const maxParallelism = Math.max(1, Math.min(Number(input.max_parallelism ?? input.maxParallelism ?? 1), 2));
  const results = fixtures.map((fixture) => runSyntheticCombatFixture({
    ...input,
    fixture,
    allow_synthetic_fixtures: true,
  }));
  return {
    status: results.every((entry) => entry.status === 'passed') ? 'passed' : 'failed',
    suite_id: input.suite_id ?? input.suiteId ?? 'all',
    fixture_count: fixtures.length,
    max_parallelism: maxParallelism,
    bounded_parallelism: true,
    results,
  };
}

export function runAllSyntheticCombatFixtures(input = {}) {
  return runSyntheticCombatFixtureSuite({ ...input, allow_synthetic_fixtures: input.allow_synthetic_fixtures ?? input.allowSyntheticFixtures ?? true });
}

export function generateSyntheticCombatCoverageReport(input = {}) {
  const registry = createSyntheticFixtureRegistry(input.fixtures ?? DEFAULT_SYNTHETIC_COMBAT_FIXTURES);
  const fixtures = registry.list();
  const mechanics = SYNTHETIC_COMBAT_REQUIRED_MECHANICS.map((required) => {
    const coveringFixtures = fixtures.filter((fixture) => asArray(fixture.mechanics).includes(required.mechanic_id));
    const coveredLayers = [...new Set(coveringFixtures.flatMap((fixture) => fixture.layers))];
    const missingLayers = required.required_layers.filter((layer) => !coveredLayers.includes(layer));
    return {
      mechanic_id: required.mechanic_id,
      required_layers: [...required.required_layers],
      fixtures: coveringFixtures.map((fixture) => fixture.fixture_id),
      covered_layers: coveredLayers,
      missing_layers: missingLayers,
      covered: coveringFixtures.length > 0 && missingLayers.length === 0,
    };
  });
  const gaps = mechanics.filter((entry) => !entry.covered);
  return {
    stage: SYNTHETIC_COMBAT_FIXTURE_STAGE,
    fixture_count: fixtures.length,
    valid_registry: registry.valid,
    registry_issues: registry.issues,
    mechanics,
    gaps,
    summary: {
      required_mechanic_count: mechanics.length,
      covered_mechanic_count: mechanics.filter((entry) => entry.covered).length,
      gap_count: gaps.length,
    },
  };
}

export function assertSyntheticCombatCoverageComplete(report = generateSyntheticCombatCoverageReport()) {
  if (!report.valid_registry || report.gaps.length > 0) {
    throw fixtureError('Synthetic combat fixture coverage is incomplete.', {
      code: 'SYNTHETIC_COVERAGE_INCOMPLETE',
      gaps: report.gaps,
      registry_issues: report.registry_issues,
    });
  }
  return true;
}

export function buildSyntheticFixtureFailureReport(error, context = {}) {
  return {
    stage: SYNTHETIC_COMBAT_FIXTURE_STAGE,
    fixture_id: context.fixture_id ?? null,
    fixture_version: context.fixture_version ?? null,
    fixture_run_id: context.fixture_run_id ?? null,
    status: context.status ?? 'failed',
    last_checkpoint_id: context.checkpoints?.at?.(-1)?.checkpoint_id ?? null,
    checkpoint_count: context.checkpoints?.length ?? 0,
    message: error?.message ?? 'Synthetic fixture failed.',
    code: error?.code ?? 'SYNTHETIC_FIXTURE_FAILURE',
    cleanup_status: context.cleanup ?? {},
  };
}
