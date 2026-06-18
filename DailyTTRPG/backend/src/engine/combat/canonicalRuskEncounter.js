import {
  COMBAT_ACTION_TIMING_CATEGORIES,
  COMBAT_EFFECT_TYPES,
  COMBAT_TARGET_POLICIES,
} from './actionEffectResourceFramework.js';
import {
  AUTOMATIC_CONTROL_MODES,
  AUTOMATIC_NEXT_DECISION_KINDS,
  TACTICAL_CONDITION_TYPES,
  TACTICAL_OPERATION_CATEGORIES,
  TACTICAL_POSITIONING_SELECTORS,
  TACTICAL_PROFILE_SCOPES,
  TACTICAL_TARGET_SELECTORS,
  buildTacticalContext,
  createTacticalProfile,
  evaluateSurrenderDecision,
  executeAutomaticOperation,
  openAutomaticCombatTurn,
  selectDeterministicOperation,
} from './automaticTurnRuntime.js';
import {
  COMBAT_FOCUS_ANSWER_STATUSES,
  assertNoCombatFocusPlayerHiddenData,
  resolveStructuredCombatFocusQuestion,
} from './combatFocus.js';
import {
  COMBAT_CHECKPOINT_KINDS,
  COMBAT_OPERATION_STATUSES,
  COMBAT_OPERATION_TYPES,
  assertNoCombatPersistencePlayerHiddenData,
  ensureCombatPersistenceState,
  runDurableCombatOperation,
} from './combatPersistenceRuntime.js';
import {
  DND5E_2014_RULESET,
  ROLL_GENERATION_ORIGINS,
} from './rulesResolution.js';
import {
  PROXIMITY_STATES,
  createSpatialRelationship,
  createZoneTransition,
} from './spatialMovement.js';
import {
  REACTION_PREFERENCE_VALUES,
  REACTION_TIMING_POINTS,
  REACTION_TRIGGER_TYPES,
  REACTION_TYPES,
  createOpportunityAttackTriggerFromMovement,
  createReactionDefinition,
  createReactionResourceState,
  processReactionTrigger,
} from './reactionInterruptRuntime.js';
import {
  PLAYER_TURN_STATUSES,
  TURN_NEXT_DECISION_KINDS,
  openPlayerCombatTurn,
  submitAction,
  submitEndTurn,
  submitMovement,
} from './playerTurnRuntime.js';
import {
  COMBAT_RESOLUTION_STATUSES,
} from '../../services/interactionCore/combatAdapterContract.js';

export const RUSK_ENCOUNTER_IDS = Object.freeze({
  ENCOUNTER: 'shrine-rusk-confrontation',
  COMBAT: 'greyvale:shrine-rusk-confrontation',
  CAMPAIGN: 'shadows_grey_road',
  SCENE: 'shrine-ruins',
  DIALOGUE: 'rusk-at-the-shrine',
  RUSK_STAT_BLOCK: 'rusk-bandit',
  HOOK: 'grey-road-shrine-combat-resolution',
  AFTERMATH_STATE: 'shrine_ruins_aftermath',
});

export const RUSK_PARTICIPANT_IDS = Object.freeze({
  PLAYER: 'pc-1',
  RUSK: 'rusk-bandit',
});

export const RUSK_ZONE_IDS = Object.freeze({
  SHRINE_EDGE: 'shrine-edge',
  SHRINE_CENTER: 'shrine-center',
  RETREAT_ROAD: 'grey-road-retreat',
});

export const RUSK_ACTION_IDS = Object.freeze({
  PLAYER_STRIKE: 'greyvale-player-strike',
  RUSK_BLADE: 'rusk-rusty-blade',
  RUSK_OPPORTUNITY_STRIKE: 'rusk-opportunity-strike',
  PLAYER_OPPORTUNITY_STRIKE: 'greyvale-player-opportunity-strike',
  DODGE: 'dodge',
});

export const RUSK_OUTCOME_IDS = Object.freeze({
  PLAYER_VICTORY_LETHAL: 'rusk_defeat_lethal',
  PLAYER_VICTORY_NONLETHAL: 'rusk_defeat_nonlethal',
  RUSK_UNCONSCIOUS: 'rusk_unconscious',
  RUSK_CAPTURED: 'rusk_captured',
  RUSK_SURRENDER: 'rusk_surrender',
  PLAYER_RETREAT: 'player_retreat',
  PLAYER_SURRENDER: 'player_surrender',
  PLAYER_DEFEAT_FAIL_FORWARD: 'player_defeat_fail_forward',
  UNUSUAL_RESOLUTION_NEEDED: 'unusual_resolution_needed',
});

const PLAYER_PROHIBITED_STRINGS = Object.freeze([
  'armor_class',
  'difficulty_class',
  'raw_roll',
  'roll_record',
  'roll_override',
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
  'surrender_threshold',
  'combat_pending',
  'future_supported',
  'target_encounter',
  'source_path',
  'hidden',
]);

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizedKey(value) {
  return cleanText(value).toLowerCase();
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

function participantMaxHp(participant = {}) {
  return Math.max(toNumber(participant.max_hit_points ?? participant.maxHp ?? participant.max_hp, 1), 1);
}

function healthBand(participant = {}) {
  if (participant.defeated === true || participantHp(participant) <= 0) return 'defeated';
  const percent = participantHp(participant) / participantMaxHp(participant);
  if (percent >= 0.75) return 'steady';
  if (percent >= 0.4) return 'wounded';
  return 'badly_wounded';
}

function actionStepDamage(flatModifier = 2) {
  return {
    step_id: 'damage',
    order: 2,
    effect_type: COMBAT_EFFECT_TYPES.DIRECT_DAMAGE,
    depends_on_step_id: 'attack',
    requires_outcome: { was_hit: true },
    params: {
      linked_attack_step_id: 'attack',
      components: [{ damage_type: 'slashing', dice_count: 1, dice_size: 6, flat_modifier: flatModifier }],
    },
  };
}

function meleeAttackAction(input = {}) {
  return {
    action_id: input.action_id,
    action_name: input.action_name ?? input.player_label,
    player_label: input.player_label,
    ruleset: DND5E_2014_RULESET,
    timing_category: input.timing_category ?? COMBAT_ACTION_TIMING_CATEGORIES.ACTION,
    target_policy: COMBAT_TARGET_POLICIES.ONE_ENEMY,
    authored_metadata: {
      attack_kind: 'melee',
      canonical_rusk_encounter: true,
      ...(input.authored_metadata ?? {}),
    },
    effect_steps: [
      {
        step_id: 'attack',
        order: 1,
        effect_type: COMBAT_EFFECT_TYPES.ATTACK_ROLL,
        params: input.attack_params ?? {},
      },
      actionStepDamage(input.flat_modifier ?? 2),
    ],
  };
}

export function buildCanonicalRuskActionDefinitions(input = {}) {
  const ruskFlatModifier = toNumber(input.rusk_flat_modifier ?? input.ruskFlatModifier, 2);
  const playerFlatModifier = toNumber(input.player_flat_modifier ?? input.playerFlatModifier, 2);
  return [
    meleeAttackAction({
      action_id: RUSK_ACTION_IDS.PLAYER_STRIKE,
      action_name: 'Strike Rusk',
      player_label: 'Strike Rusk',
      flat_modifier: playerFlatModifier,
    }),
    meleeAttackAction({
      action_id: RUSK_ACTION_IDS.RUSK_BLADE,
      action_name: 'Rusty Blade',
      player_label: 'Rusty Blade',
      flat_modifier: ruskFlatModifier,
    }),
    meleeAttackAction({
      action_id: RUSK_ACTION_IDS.RUSK_OPPORTUNITY_STRIKE,
      action_name: 'Rusk Opportunity Strike',
      player_label: 'Opportunity Strike',
      timing_category: COMBAT_ACTION_TIMING_CATEGORIES.REACTION,
      flat_modifier: ruskFlatModifier,
    }),
    meleeAttackAction({
      action_id: RUSK_ACTION_IDS.PLAYER_OPPORTUNITY_STRIKE,
      action_name: 'Opportunity Strike',
      player_label: 'Opportunity Strike',
      timing_category: COMBAT_ACTION_TIMING_CATEGORIES.REACTION,
      flat_modifier: playerFlatModifier,
    }),
    {
      action_id: RUSK_ACTION_IDS.DODGE,
      action_name: 'Dodge',
      player_label: 'Dodge',
      ruleset: DND5E_2014_RULESET,
      timing_category: COMBAT_ACTION_TIMING_CATEGORIES.ACTION,
      target_policy: COMBAT_TARGET_POLICIES.SELF,
      authored_metadata: { runtime_effect: 'dodge', canonical_rusk_encounter: true },
      effect_steps: [{
        step_id: 'dodge-marker',
        order: 1,
        effect_type: COMBAT_EFFECT_TYPES.STATE_MARKER,
        player_summary: 'Dodge is active.',
      }],
    },
  ];
}

function relationship(a, b, proximity) {
  return createSpatialRelationship({
    participant_a_id: a,
    participant_b_id: b,
    proximity,
  });
}

function setRelationship(state, proximity = PROXIMITY_STATES.ENGAGED) {
  const relation = relationship(RUSK_PARTICIPANT_IDS.PLAYER, RUSK_PARTICIPANT_IDS.RUSK, proximity);
  state.participants = asArray(state.participants).map((participant) => ({
    ...participant,
    relationships: participantId(participant) === RUSK_PARTICIPANT_IDS.PLAYER || participantId(participant) === RUSK_PARTICIPANT_IDS.RUSK
      ? [relation]
      : asArray(participant.relationships),
  }));
  state.spatial = state.spatial ?? {};
  state.spatial.participants = asArray(state.spatial.participants).map((entry) => ({
    ...entry,
    relationships: participantId(entry) === RUSK_PARTICIPANT_IDS.PLAYER || participantId(entry) === RUSK_PARTICIPANT_IDS.RUSK
      ? [relation]
      : asArray(entry.relationships),
  }));
  return relation;
}

export function buildCanonicalRuskSpatialState(input = {}) {
  const proximity = input.proximity ?? PROXIMITY_STATES.NEARBY;
  const relation = relationship(RUSK_PARTICIPANT_IDS.PLAYER, RUSK_PARTICIPANT_IDS.RUSK, proximity);
  return {
    participants: [
      {
        participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
        current_zone_id: input.player_zone_id ?? input.playerZoneId ?? RUSK_ZONE_IDS.SHRINE_EDGE,
        size: 'medium',
        speed: 30,
        relationships: [relation],
      },
      {
        participant_id: RUSK_PARTICIPANT_IDS.RUSK,
        current_zone_id: input.rusk_zone_id ?? input.ruskZoneId ?? RUSK_ZONE_IDS.SHRINE_CENTER,
        size: 'medium',
        speed: 30,
        relationships: [relation],
      },
    ],
    zones: [
      {
        zone_id: RUSK_ZONE_IDS.SHRINE_EDGE,
        player_name: 'Shrine Edge',
        player_description: 'Broken stones and low brush mark the edge of the ruins.',
      },
      {
        zone_id: RUSK_ZONE_IDS.SHRINE_CENTER,
        player_name: 'Shrine Center',
        player_description: 'The open stones leave little room to hide from Rusk.',
      },
      {
        zone_id: RUSK_ZONE_IDS.RETREAT_ROAD,
        player_name: 'Grey Road Retreat',
        player_description: 'The Grey Road gives you a visible way out of the shrine fight.',
      },
    ],
    transitions: [
      createZoneTransition({
        transition_id: 'edge-to-center',
        source_zone_id: RUSK_ZONE_IDS.SHRINE_EDGE,
        destination_zone_id: RUSK_ZONE_IDS.SHRINE_CENTER,
        base_cost: 15,
        player_description: 'Move into Rusk’s reach',
      }),
      createZoneTransition({
        transition_id: 'center-to-edge',
        source_zone_id: RUSK_ZONE_IDS.SHRINE_CENTER,
        destination_zone_id: RUSK_ZONE_IDS.SHRINE_EDGE,
        base_cost: 15,
        player_description: 'Back toward the broken edge of the shrine',
      }),
      createZoneTransition({
        transition_id: 'edge-to-retreat-road',
        source_zone_id: RUSK_ZONE_IDS.SHRINE_EDGE,
        destination_zone_id: RUSK_ZONE_IDS.RETREAT_ROAD,
        base_cost: 15,
        retreat_route_id: 'grey-road-retreat',
        player_description: 'Retreat to the Grey Road',
      }),
      createZoneTransition({
        transition_id: 'center-to-retreat-road',
        source_zone_id: RUSK_ZONE_IDS.SHRINE_CENTER,
        destination_zone_id: RUSK_ZONE_IDS.RETREAT_ROAD,
        base_cost: 25,
        retreat_route_id: 'grey-road-retreat',
        player_description: 'Break away toward the Grey Road',
      }),
    ],
  };
}

function buildPlayerParticipant(input = {}) {
  return {
    participant_id: input.participant_id ?? RUSK_PARTICIPANT_IDS.PLAYER,
    active_character_id: input.active_character_id ?? input.activeCharacterId ?? 'test-character',
    display_name: input.display_name ?? input.name ?? 'Greyvale Hero',
    faction: 'player',
    control_mode: AUTOMATIC_CONTROL_MODES.PLAYER,
    player_controlled: true,
    is_player_character: true,
    current_zone_id: input.current_zone_id ?? RUSK_ZONE_IDS.SHRINE_EDGE,
    size: 'medium',
    speed: 30,
    speed_walk: 30,
    armor_class: toNumber(input.armor_class ?? input.armorClass, 13),
    current_hit_points: toNumber(input.current_hit_points ?? input.currentHitPoints, 20),
    max_hit_points: toNumber(input.max_hit_points ?? input.maxHitPoints, 20),
    temporary_hit_points: toNumber(input.temporary_hit_points ?? input.temporaryHitPoints, 0),
    active: true,
    defeated: false,
    can_be_perceived: true,
  };
}

function buildRuskParticipant(input = {}) {
  return {
    participant_id: RUSK_PARTICIPANT_IDS.RUSK,
    stat_block_id: RUSK_ENCOUNTER_IDS.RUSK_STAT_BLOCK,
    entity_slug: RUSK_ENCOUNTER_IDS.RUSK_STAT_BLOCK,
    display_name: 'Rusk',
    faction: 'enemy',
    control_mode: AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ENEMY,
    encounter_role: 'solo_surface_antagonist',
    current_zone_id: input.current_zone_id ?? RUSK_ZONE_IDS.SHRINE_CENTER,
    size: 'medium',
    speed: 30,
    speed_walk: 30,
    armor_class: toNumber(input.armor_class ?? input.armorClass, 14),
    current_hit_points: toNumber(input.current_hit_points ?? input.currentHitPoints, 18),
    max_hit_points: toNumber(input.max_hit_points ?? input.maxHitPoints, 18),
    temporary_hit_points: toNumber(input.temporary_hit_points ?? input.temporaryHitPoints, 0),
    active: true,
    defeated: false,
    can_be_perceived: true,
    hidden: false,
  };
}

export function buildCanonicalRuskTacticalProfile(input = {}) {
  const surrenderFlag = input.surrender_permission_flag ?? input.surrenderPermissionFlag ?? 'rusk_surrender_permitted';
  return createTacticalProfile({
    profile_id: 'greyvale-rusk-direct-aggressive',
    profile_version: '1',
    internal_name: 'Greyvale Rusk direct aggressive melee profile',
    player_safe_name: 'Rusk presses the fight directly.',
    scope: TACTICAL_PROFILE_SCOPES.PARTICIPANT,
    applies_to: { participant_id: RUSK_PARTICIPANT_IDS.RUSK },
    action_priorities: [
      {
        rule_id: 'rusk-strikes-when-engaged',
        order: 10,
        action_id: RUSK_ACTION_IDS.RUSK_BLADE,
        action_category: TACTICAL_OPERATION_CATEGORIES.ACTION,
        use_conditions: [
          { type: TACTICAL_CONDITION_TYPES.ACTOR_ENGAGED },
          { type: TACTICAL_CONDITION_TYPES.ACTION_LEGAL },
        ],
        target_selector: { selector: TACTICAL_TARGET_SELECTORS.ENGAGED_HOSTILE },
      },
      {
        rule_id: 'rusk-closes-to-melee',
        order: 20,
        action_category: TACTICAL_OPERATION_CATEGORIES.MOVEMENT,
        use_conditions: [{ type: TACTICAL_CONDITION_TYPES.TARGET_VISIBLE }],
        target_selector: { selector: TACTICAL_TARGET_SELECTORS.NEAREST_VISIBLE_HOSTILE },
        positioning_requirement: {
          selector: TACTICAL_POSITIONING_SELECTORS.MOVE_TOWARD_TARGET,
          avoid_opportunity_risk: false,
        },
      },
    ],
    retreat_thresholds: [],
    surrender_thresholds: [
      {
        threshold_id: 'rusk-low-hp-and-narrative-permission',
        hit_point_percent_at_or_below: 0.35,
        requires_permission_flag: surrenderFlag,
        outcome_kind: RUSK_OUTCOME_IDS.RUSK_SURRENDER,
        gm_dev_provenance: {
          requires_both_narrative_permission_and_combat_state: true,
        },
      },
    ],
    safe_fallback: { fallback_id: 'rusk-dodge-wait-end', order: [RUSK_ACTION_IDS.DODGE, 'wait', 'end_turn'] },
    information_access_policy: { policy_id: 'observable_only' },
    player_visibility_classification: 'internal',
    gm_dev_provenance: {
      canonical_encounter_id: RUSK_ENCOUNTER_IDS.ENCOUNTER,
      tactical_intent: 'move_into_engagement_then_attack',
    },
  });
}

function reactionDefinition(input = {}) {
  return createReactionDefinition({
    reaction_id: input.reaction_id,
    reaction_type: REACTION_TYPES.OPPORTUNITY_ATTACK,
    player_name: 'Opportunity Strike',
    trigger_type: REACTION_TRIGGER_TYPES.OPPORTUNITY_ATTACK,
    timing_point: REACTION_TIMING_POINTS.BEFORE_MOVEMENT_LEAVES_THREATENED_REACH,
    action_definition: input.action_definition,
    authored_priority: 10,
    deterministic_phase: input.deterministic_phase,
    preference_key: 'opportunity_attack',
    player_safe_description: 'Strike as the opponent leaves reach.',
  });
}

export function buildCanonicalRuskReactionDefinitions(actions = buildCanonicalRuskActionDefinitions()) {
  const ruskOpportunity = actions.find((action) => action.action_id === RUSK_ACTION_IDS.RUSK_OPPORTUNITY_STRIKE);
  const playerOpportunity = actions.find((action) => action.action_id === RUSK_ACTION_IDS.PLAYER_OPPORTUNITY_STRIKE);
  return [
    reactionDefinition({
      reaction_id: RUSK_ACTION_IDS.RUSK_OPPORTUNITY_STRIKE,
      action_definition: ruskOpportunity,
      actor_eligibility: { participant_id: RUSK_PARTICIPANT_IDS.RUSK },
    }),
    reactionDefinition({
      reaction_id: RUSK_ACTION_IDS.PLAYER_OPPORTUNITY_STRIKE,
      action_definition: playerOpportunity,
      actor_eligibility: { participant_id: RUSK_PARTICIPANT_IDS.PLAYER },
    }),
  ];
}

export function buildCanonicalRuskEncounterDefinition(input = {}) {
  const encounter = input.encounter ?? input.encounter_content ?? input.encounterContent ?? null;
  const dialogue = input.dialogue ?? input.dialogue_content ?? input.dialogueContent ?? null;
  const hook = input.hook ?? input.hook_content ?? input.hookContent ?? null;
  const soloVariant = asArray(encounter?.variants).find((variant) => variant.variant_id === 'solo') ?? null;
  return {
    contract_stage: '6D.13',
    encounter_id: RUSK_ENCOUNTER_IDS.ENCOUNTER,
    encounter_title: encounter?.name ?? 'Rusk at the Shrine',
    campaign_slug: encounter?.campaign_slug ?? RUSK_ENCOUNTER_IDS.CAMPAIGN,
    scene_slug: encounter?.scene_slug ?? RUSK_ENCOUNTER_IDS.SCENE,
    dialogue_slug: dialogue?.slug ?? RUSK_ENCOUNTER_IDS.DIALOGUE,
    hook_slug: hook?.slug ?? RUSK_ENCOUNTER_IDS.HOOK,
    selected_variant_id: 'solo',
    selected_variant: soloVariant ?? {
      variant_id: 'solo',
      enemies: [{ entity_slug: RUSK_ENCOUNTER_IDS.RUSK_STAT_BLOCK, count: 1, scalable: false }],
      notes: 'Solo canonical fallback derived from active Greyvale encounter contract.',
    },
    stat_block_policy: {
      source: 'stage_6d2_verified_rusk_contract',
      entity_slug: RUSK_ENCOUNTER_IDS.RUSK_STAT_BLOCK,
      hit_point_max: 18,
      armor_class: 14,
      challenge_rating: 0.25,
      normalized_actions: [RUSK_ACTION_IDS.RUSK_BLADE],
    },
    start_state_policy: {
      authored_scene: RUSK_ENCOUNTER_IDS.SCENE,
      placement: 'conservative_visible_no_surprise',
      player_zone_id: RUSK_ZONE_IDS.SHRINE_EDGE,
      rusk_zone_id: RUSK_ZONE_IDS.SHRINE_CENTER,
      initial_proximity: PROXIMITY_STATES.NEARBY,
      cover_policy: 'none_by_default_until_authored',
      hidden_participants: false,
    },
    outcomes: Object.values(RUSK_OUTCOME_IDS),
    shared_aftermath_state_id: RUSK_ENCOUNTER_IDS.AFTERMATH_STATE,
    aftermath_mutation_stage: '6D.14',
    ruleset: DND5E_2014_RULESET,
    gm_dev_evidence: {
      encounter_content_present: Boolean(encounter),
      dialogue_content_present: Boolean(dialogue),
      hook_content_present: Boolean(hook),
      rusk_dialogue_terminal_node: Boolean(dialogue?.nodes?.some((node) => cleanText(node.id ?? node.slug) === 'rusk-fight' && node.is_terminal)),
    },
  };
}

export function buildCanonicalRuskCombatState(input = {}) {
  const definition = input.definition ?? buildCanonicalRuskEncounterDefinition(input);
  const player = buildPlayerParticipant(input.player ?? {
    active_character_id: input.active_character_id ?? input.activeCharacterId,
    display_name: input.character_name ?? input.characterName,
  });
  const rusk = buildRuskParticipant(input.rusk ?? {});
  const actions = buildCanonicalRuskActionDefinitions(input.actions ?? {});
  const spatial = buildCanonicalRuskSpatialState(input.spatial ?? {});
  const relation = relationship(RUSK_PARTICIPANT_IDS.PLAYER, RUSK_PARTICIPANT_IDS.RUSK, input.initial_proximity ?? PROXIMITY_STATES.NEARBY);
  const playerWithRelation = { ...player, relationships: [relation] };
  const ruskWithRelation = { ...rusk, relationships: [relation] };
  const playerInitiative = toNumber(input.player_initiative ?? input.playerInitiative, 14);
  const ruskInitiative = toNumber(input.rusk_initiative ?? input.ruskInitiative, 12);
  const ordered = [
    { ...playerWithRelation, initiative_total: playerInitiative },
    { ...ruskWithRelation, initiative_total: ruskInitiative },
  ].sort((left, right) => right.initiative_total - left.initiative_total || participantId(left).localeCompare(participantId(right)));
  const participants = ordered.map((participant, index) => ({
    ...participant,
    turn_order: index + 1,
    initiative_position: index + 1,
  }));
  const current = input.current_participant_id ?? input.currentParticipantId ?? participantId(participants[0]);
  return ensureCombatPersistenceState({
    combat: {
      combat_id: input.combat_id ?? RUSK_ENCOUNTER_IDS.COMBAT,
      encounter_id: RUSK_ENCOUNTER_IDS.ENCOUNTER,
      encounter_title: definition.encounter_title,
      status: 'active',
      ruleset: DND5E_2014_RULESET,
      round_number: 1,
      initiative_position: participants.find((entry) => participantId(entry) === current)?.initiative_position ?? 1,
      current_participant_id: current,
      current_state_version: 'combat-v0',
    },
    current_participant_id: current,
    participants,
    actions,
    resources: [],
    conditions: [],
    spatial: {
      ...spatial,
      participants: spatial.participants.map((entry) => ({
        ...entry,
        relationships: [relation],
      })),
    },
    faction_relationships: [
      { faction_a: 'player', faction_b: 'enemy', relationship: 'hostile' },
      { faction_a: 'enemy', faction_b: 'player', relationship: 'hostile' },
    ],
    encounter_flags: {
      rusk_surrender_permitted: Boolean(input.rusk_surrender_permitted ?? input.ruskSurrenderPermitted),
      ...(input.encounter_flags ?? input.encounterFlags ?? {}),
    },
    tactical_profiles: [buildCanonicalRuskTacticalProfile()],
    reaction_definitions: buildCanonicalRuskReactionDefinitions(actions),
    reaction_resources: {
      [RUSK_PARTICIPANT_IDS.PLAYER]: createReactionResourceState({ participant_id: RUSK_PARTICIPANT_IDS.PLAYER, reaction_available: true }),
      [RUSK_PARTICIPANT_IDS.RUSK]: createReactionResourceState({ participant_id: RUSK_PARTICIPANT_IDS.RUSK, reaction_available: true }),
    },
    reaction_preferences: input.reaction_preferences ?? input.reactionPreferences ?? {
      [RUSK_PARTICIPANT_IDS.RUSK]: { opportunity_attack: REACTION_PREFERENCE_VALUES.AUTOMATIC_USE_WHEN_LEGAL },
    },
    canonical_rusk: {
      definition,
      launch_status: 'created',
      aftermath_applied: false,
      rewards_applied: false,
    },
  });
}

export function validateCanonicalRuskLaunch(input = {}) {
  const definition = input.definition ?? buildCanonicalRuskEncounterDefinition(input);
  const errors = [];
  if (definition.encounter_id !== RUSK_ENCOUNTER_IDS.ENCOUNTER) errors.push('encounter_id_mismatch');
  if (definition.selected_variant_id !== 'solo') errors.push('solo_variant_not_selected');
  if (definition.ruleset.system !== DND5E_2014_RULESET.system || definition.ruleset.rules_version !== DND5E_2014_RULESET.rules_version) {
    errors.push('ruleset_mismatch');
  }
  return {
    valid: errors.length === 0,
    errors,
    definition,
  };
}

export function createOrResumeCanonicalRuskCombat(input = {}) {
  let state = ensureCombatPersistenceState(input.state ?? {});
  if (state.canonical_rusk?.combat_created === true) {
    return {
      status: 'resumed',
      idempotency_status: 'existing_combat',
      state,
      combat: state.combat,
      player_projection: projectCanonicalRuskForPlayer({ state }),
      gm_dev_trace: buildCanonicalRuskGmDevTrace({ state, phase: 'resume_existing' }),
    };
  }
  const definition = input.definition ?? buildCanonicalRuskEncounterDefinition(input);
  const validation = validateCanonicalRuskLaunch({ definition });
  if (!validation.valid) {
    return {
      status: 'unavailable',
      committed: false,
      player_safe_message: 'That combat cannot start yet.',
      gm_dev_trace: { validation },
    };
  }
  const result = runDurableCombatOperation({
    state,
    operation_type: COMBAT_OPERATION_TYPES.PARTICIPANT_ENTRY,
    combat_id: RUSK_ENCOUNTER_IDS.COMBAT,
    encounter_id: RUSK_ENCOUNTER_IDS.ENCOUNTER,
    actor_participant_id: input.active_character_id ?? input.activeCharacterId ?? RUSK_PARTICIPANT_IDS.PLAYER,
    idempotency_key: input.idempotency_key ?? input.idempotencyKey ?? stableId(['launch', RUSK_ENCOUNTER_IDS.ENCOUNTER, input.campaign_id ?? input.campaignId ?? 'campaign', input.active_character_id ?? input.activeCharacterId ?? 'character']),
    participant_event_id: 'canonical-rusk-launch',
    execute: ({ state: durableState, recordCheckpoint }) => {
      const combatState = buildCanonicalRuskCombatState({
        ...input,
        definition,
      });
      for (const [key, value] of Object.entries(combatState)) {
        if (key === 'combat_persistence') {
          continue;
        }
        durableState[key] = value;
      }
      durableState.combat.current_state_version = durableState.combat_persistence.current_state_version;
      durableState.current_state_version = durableState.combat_persistence.current_state_version;
      durableState.canonical_rusk = {
        ...(durableState.canonical_rusk ?? {}),
        definition,
        combat_created: true,
        launch_status: 'active',
        aftermath_applied: false,
        rewards_applied: false,
      };
      recordCheckpoint({
        checkpoint_kind: COMBAT_CHECKPOINT_KINDS.PARTICIPANT_EVENT_PERSISTED,
        data: {
          event: 'canonical_rusk_combat_created',
          encounter_id: RUSK_ENCOUNTER_IDS.ENCOUNTER,
          variant_id: 'solo',
        },
      });
      return {
        status: 'canonical_rusk_combat_started',
        combat_id: durableState.combat.combat_id,
        player_result: {
          status: 'combat_started',
          result: 'Rusk is ready at the shrine. The combat turn can begin.',
          encounter_title: definition.encounter_title,
        },
        player_safe_summary: 'Rusk combat is ready.',
        gm_dev_trace: buildCanonicalRuskGmDevTrace({ state: durableState, phase: 'launch' }),
      };
    },
  });
  state = ensureCombatPersistenceState(state);
  return {
    ...result,
    state,
    combat: state.combat,
    player_projection: projectCanonicalRuskForPlayer({ state }),
    gm_dev_trace: {
      ...(result.gm_dev_trace ?? {}),
      canonical_rusk: buildCanonicalRuskGmDevTrace({ state, phase: 'launch_result' }),
    },
  };
}

function ensurePlayerTurn(state) {
  if (state.parent_turn?.status === PLAYER_TURN_STATUSES.OPEN && state.parent_turn.actor_participant_id === RUSK_PARTICIPANT_IDS.PLAYER) {
    return { state, opened: false };
  }
  state.combat.current_participant_id = RUSK_PARTICIPANT_IDS.PLAYER;
  state.current_participant_id = RUSK_PARTICIPANT_IDS.PLAYER;
  const opened = openPlayerCombatTurn({ ...state, actor_participant_id: RUSK_PARTICIPANT_IDS.PLAYER });
  return { state: opened.state, opened: true, opened_result: opened };
}

function ensureRuskTurn(state) {
  if (state.parent_turn?.status === PLAYER_TURN_STATUSES.OPEN && state.parent_turn.actor_participant_id === RUSK_PARTICIPANT_IDS.RUSK) {
    return { state, opened: false };
  }
  state.combat.current_participant_id = RUSK_PARTICIPANT_IDS.RUSK;
  state.current_participant_id = RUSK_PARTICIPANT_IDS.RUSK;
  const opened = openAutomaticCombatTurn({ state, actor_participant_id: RUSK_PARTICIPANT_IDS.RUSK });
  return { state: opened.state, opened: true, opened_result: opened };
}

export function openCanonicalRuskPlayerTurn(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const result = ensurePlayerTurn(state);
  return {
    status: result.opened ? 'opened' : 'resumed',
    state: result.state,
    player_projection: projectCanonicalRuskForPlayer({ state: result.state }),
    gm_dev_trace: buildCanonicalRuskGmDevTrace({ state: result.state, phase: 'player_turn_opened' }),
  };
}

export function submitCanonicalRuskPlayerStrike(input = {}) {
  let state = ensureCombatPersistenceState(input.state ?? input);
  state = ensurePlayerTurn(state).state;
  if (input.engaged !== false) {
    setRelationship(state, PROXIMITY_STATES.ENGAGED);
  }
  const result = submitAction({
    state,
    action_id: RUSK_ACTION_IDS.PLAYER_STRIKE,
    target_id: RUSK_PARTICIPANT_IDS.RUSK,
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: input.idempotency_key ?? input.idempotencyKey ?? 'canonical-player-strike',
    generation_origin: input.generation_origin ?? input.generationOrigin ?? ROLL_GENERATION_ORIGINS.DETERMINISTIC_TEST_OVERRIDE,
    roll_overrides: input.roll_overrides ?? input.rollOverrides ?? { attack: 18, damage: [4] },
  });
  const stateAfter = result.state ?? state;
  if (input.nonlethal === true || input.nonlethal_declared === true || input.nonlethalDeclared === true) {
    stateAfter.last_player_nonlethal_declared = true;
  }
  return {
    ...result,
    completion: evaluateCanonicalRuskCompletion({ state: stateAfter }),
    player_projection: projectCanonicalRuskForPlayer({ state: stateAfter }),
  };
}

export function submitCanonicalRuskPlayerRetreat(input = {}) {
  let state = ensureCombatPersistenceState(input.state ?? input);
  state = ensurePlayerTurn(state).state;
  setRelationship(state, PROXIMITY_STATES.ENGAGED);
  const result = submitMovement({
    state,
    destination_zone_id: RUSK_ZONE_IDS.RETREAT_ROAD,
    selected_transition_ids: [state.spatial.participants.find((entry) => participantId(entry) === RUSK_PARTICIPANT_IDS.PLAYER)?.current_zone_id === RUSK_ZONE_IDS.SHRINE_CENTER ? 'center-to-retreat-road' : 'edge-to-retreat-road'],
    before_proximity: PROXIMITY_STATES.ENGAGED,
    after_proximity: PROXIMITY_STATES.NEARBY,
    potential_reactors: [findParticipant(state, RUSK_PARTICIPANT_IDS.RUSK)],
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: input.idempotency_key ?? input.idempotencyKey ?? 'canonical-player-retreat',
  });
  const stateAfter = result.state ?? state;
  let reactionResult = null;
  if (result.next_decision?.next_decision_kind === TURN_NEXT_DECISION_KINDS.REACTION_REQUIRED || result.player_result_bundle?.known_reaction_trigger) {
    const trigger = createOpportunityAttackTriggerFromMovement({
      state: stateAfter,
      mover_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
      parent_sub_resolution_id: result.sub_resolution_id,
      before_proximity: PROXIMITY_STATES.ENGAGED,
      after_proximity: PROXIMITY_STATES.NEARBY,
      destination_zone_id: RUSK_ZONE_IDS.RETREAT_ROAD,
      potential_reactors: [findParticipant(stateAfter, RUSK_PARTICIPANT_IDS.RUSK)],
    });
    if (trigger.status !== 'no_trigger') {
      reactionResult = processReactionTrigger({
        state: trigger.state,
        trigger: trigger.trigger,
        roll_overrides: input.reaction_roll_overrides ?? input.reactionRollOverrides ?? { attack: 3, damage: [1] },
        generation_origin: input.generation_origin ?? input.generationOrigin ?? ROLL_GENERATION_ORIGINS.DETERMINISTIC_TEST_OVERRIDE,
      });
    }
  }
  const finalState = reactionResult?.state ?? stateAfter;
  finalState.player_retreat_declared = true;
  return {
    ...result,
    reaction_result: reactionResult,
    completion: evaluateCanonicalRuskCompletion({ state: finalState }),
    state: finalState,
    player_projection: projectCanonicalRuskForPlayer({ state: finalState }),
  };
}

export function executeCanonicalRuskAutomaticStep(input = {}) {
  let state = ensureCombatPersistenceState(input.state ?? input);
  state = ensureRuskTurn(state).state;
  const selection = selectDeterministicOperation({ state });
  const operation = input.operation ?? selection.operation;
  const result = executeAutomaticOperation({
    state,
    operation,
    generation_origin: input.generation_origin ?? input.generationOrigin ?? ROLL_GENERATION_ORIGINS.DETERMINISTIC_TEST_OVERRIDE,
    roll_overrides: input.roll_overrides ?? input.rollOverrides ?? { attack: 18, damage: [4] },
    reaction_roll_overrides: input.reaction_roll_overrides ?? input.reactionRollOverrides,
    potential_reactors: input.potential_reactors ?? input.potentialReactors,
  });
  const stateAfter = result.state ?? state;
  if (
    operation.operation_category === TACTICAL_OPERATION_CATEGORIES.MOVEMENT &&
    operation.target_id === RUSK_PARTICIPANT_IDS.PLAYER
  ) {
    setRelationship(stateAfter, PROXIMITY_STATES.ENGAGED);
  }
  return {
    ...result,
    selection,
    completion: evaluateCanonicalRuskCompletion({ state: stateAfter }),
    player_projection: projectCanonicalRuskForPlayer({ state: stateAfter }),
  };
}

export function evaluateRuskSurrenderEligibility(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const rusk = findParticipant(state, RUSK_PARTICIPANT_IDS.RUSK);
  const context = buildTacticalContext({
    state: {
      ...state,
      combat: {
        ...state.combat,
        current_participant_id: RUSK_PARTICIPANT_IDS.RUSK,
      },
      current_participant_id: RUSK_PARTICIPANT_IDS.RUSK,
      parent_turn: {
        ...(state.parent_turn ?? {}),
        actor_participant_id: RUSK_PARTICIPANT_IDS.RUSK,
        status: PLAYER_TURN_STATUSES.OPEN,
        action_spent: false,
        current_state_version: state.parent_turn?.current_state_version ?? state.current_state_version ?? 'combat-v0',
        base_movement: rusk?.speed ?? 30,
        movement_spent: 0,
      },
    },
    actor: rusk,
  });
  const profile = buildCanonicalRuskTacticalProfile();
  return evaluateSurrenderDecision({ context, profile });
}

function completionCandidate(state = {}) {
  const player = findParticipant(state, RUSK_PARTICIPANT_IDS.PLAYER);
  const rusk = findParticipant(state, RUSK_PARTICIPANT_IDS.RUSK);
  if (rusk && (rusk.defeated === true || participantHp(rusk) <= 0)) {
    if (state.last_player_nonlethal_declared === true) {
      return {
        outcome_id: RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL,
        reason: 'rusk_defeated_nonlethal',
      };
    }
    return {
      outcome_id: RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL,
      reason: 'rusk_defeated_lethal',
    };
  }
  if (state.automatic_surrender_intent?.actor_participant_id === RUSK_PARTICIPANT_IDS.RUSK) {
    const eligibility = evaluateRuskSurrenderEligibility({ state });
    if (eligibility.status === 'surrender_intent_selected') {
      return {
        outcome_id: RUSK_OUTCOME_IDS.RUSK_SURRENDER,
        reason: 'rusk_surrender_intent_valid',
      };
    }
  }
  const playerSpatial = asArray(state.spatial?.participants).find((entry) => participantId(entry) === RUSK_PARTICIPANT_IDS.PLAYER);
  if (state.player_retreat_declared === true || playerSpatial?.current_zone_id === RUSK_ZONE_IDS.RETREAT_ROAD) {
    return {
      outcome_id: RUSK_OUTCOME_IDS.PLAYER_RETREAT,
      reason: 'player_reached_retreat_route',
    };
  }
  if (player && (player.defeated === true || participantHp(player) <= 0)) {
    return {
      outcome_id: RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD,
      reason: 'player_zero_hp_fail_forward',
    };
  }
  return null;
}

export function evaluateCanonicalRuskCompletion(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  if (state.canonical_rusk_handoff?.status === 'completion_handoff_ready') {
    return {
      status: 'already_completed',
      outcome_id: state.canonical_rusk_handoff.outcome_id,
      handoff: state.canonical_rusk_handoff,
    };
  }
  const candidate = input.outcome_id
    ? { outcome_id: input.outcome_id, reason: input.reason ?? 'explicit_outcome' }
    : completionCandidate(state);
  if (!candidate) {
    return {
      status: 'active',
      outcome_id: null,
      player_safe_message: 'The fight is still underway.',
    };
  }
  return createCanonicalRuskCompletionHandoff({
    state,
    outcome_id: candidate.outcome_id,
    reason: candidate.reason,
    idempotency_key: input.idempotency_key ?? input.idempotencyKey ?? stableId(['rusk-completion', candidate.outcome_id]),
  });
}

function playerSafeOutcomeSummary(outcomeId) {
  switch (outcomeId) {
    case RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL:
      return 'Rusk is down. The fight is ready to hand off to the Shrine Ruins aftermath.';
    case RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL:
      return 'Rusk is down but alive. The fight is ready to hand off to the Shrine Ruins aftermath.';
    case RUSK_OUTCOME_IDS.RUSK_SURRENDER:
      return 'Rusk is ready to surrender. The fight is ready to hand off to the Shrine Ruins aftermath.';
    case RUSK_OUTCOME_IDS.PLAYER_RETREAT:
      return 'You break away from the shrine fight. The retreat is ready to hand off to the Shrine Ruins aftermath.';
    case RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD:
      return 'You fall, but the story will continue through a safe fail-forward aftermath.';
    default:
      return 'The fight has reached a supported handoff point.';
  }
}

export function createCanonicalRuskCompletionHandoff(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const outcomeId = cleanText(input.outcome_id ?? input.outcomeId);
  if (!Object.values(RUSK_OUTCOME_IDS).includes(outcomeId)) {
    return {
      status: 'unavailable',
      committed: false,
      player_safe_message: 'That combat outcome is not supported yet.',
      gm_dev_trace: { reason: 'unsupported_rusk_outcome', outcome_id: outcomeId },
    };
  }
  const duplicate = state.canonical_rusk_handoff;
  if (duplicate?.status === 'completion_handoff_ready') {
    return {
      status: 'already_completed',
      outcome_id: duplicate.outcome_id,
      handoff: duplicate,
    };
  }
  const result = runDurableCombatOperation({
    state,
    operation_type: COMBAT_OPERATION_TYPES.ENCOUNTER_COMPLETION_HANDOFF,
    combat_id: state.combat?.combat_id ?? RUSK_ENCOUNTER_IDS.COMBAT,
    encounter_id: RUSK_ENCOUNTER_IDS.ENCOUNTER,
    completion_handoff_id: stableId(['rusk-handoff', outcomeId]),
    idempotency_key: input.idempotency_key ?? input.idempotencyKey ?? stableId(['rusk-handoff', outcomeId]),
    execute: ({ state: durableState, recordCheckpoint }) => {
      const handoff = {
        status: 'completion_handoff_ready',
        outcome_id: outcomeId,
        outcome_reason: input.reason ?? null,
        combat_id: durableState.combat.combat_id,
        encounter_id: RUSK_ENCOUNTER_IDS.ENCOUNTER,
        shared_aftermath_state_id: RUSK_ENCOUNTER_IDS.AFTERMATH_STATE,
        aftermath_variant_id: outcomeId,
        post_combat_hook_identity: RUSK_ENCOUNTER_IDS.HOOK,
        aftermath_applied: false,
        rewards_applied: false,
        objective_outputs_applied: false,
        knowledge_outputs_applied: false,
        history_outputs_applied: false,
        latest_development_applied: false,
        player_safe_summary: playerSafeOutcomeSummary(outcomeId),
      };
      durableState.canonical_rusk_handoff = handoff;
      durableState.combat.status = 'resolution_pending';
      if (durableState.parent_turn) {
        durableState.parent_turn.status = PLAYER_TURN_STATUSES.CLOSED;
        durableState.parent_turn.turn_close_reason = 'encounter_completion_handoff';
      }
      recordCheckpoint({
        checkpoint_kind: COMBAT_CHECKPOINT_KINDS.COMPLETION_HANDOFF_PERSISTED,
        data: handoff,
      });
      return {
        status: 'canonical_rusk_handoff_ready',
        handoff,
        player_result: {
          status: 'completion_ready',
          result: handoff.player_safe_summary,
          outcome_id: handoff.outcome_id,
          review_only: true,
        },
        player_safe_summary: handoff.player_safe_summary,
        gm_dev_trace: buildCanonicalRuskGmDevTrace({ state: durableState, phase: 'completion_handoff', outcome_id: outcomeId }),
      };
    },
  });
  return {
    status: result.status === COMBAT_OPERATION_STATUSES.RESOLVED ? 'completion_handoff_ready' : result.status,
    outcome_id: state.canonical_rusk_handoff?.outcome_id ?? outcomeId,
    handoff: state.canonical_rusk_handoff ?? result.result?.handoff,
    durable_result: result,
  };
}

export function answerCanonicalRuskCombatFocus(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const focus = resolveStructuredCombatFocusQuestion({
    state,
    template_id: input.template_id ?? input.templateId ?? 'enemy.can_reach_me',
    parameters: input.parameters ?? { enemy_participant_id: RUSK_PARTICIPANT_IDS.RUSK },
  });
  if (focus.status === COMBAT_FOCUS_ANSWER_STATUSES.ANSWERED) {
    assertNoCombatFocusPlayerHiddenData(focus.player_answer);
  }
  return focus;
}

function visibleParticipant(participant = {}, viewerId = RUSK_PARTICIPANT_IDS.PLAYER) {
  const id = participantId(participant);
  const isPlayer = id === viewerId;
  return {
    participant_id: id,
    display_name: participant.display_name ?? id,
    faction: participant.faction,
    is_actor: isPlayer,
    hit_points: isPlayer ? {
      current: participantHp(participant),
      maximum: participantMaxHp(participant),
      temporary: toNumber(participant.temporary_hit_points, 0),
    } : null,
    health_band: isPlayer ? null : healthBand(participant),
    defeated: participant.defeated === true || participantHp(participant) <= 0,
  };
}

export function projectCanonicalRuskForPlayer(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const playerSpatial = asArray(state.spatial?.participants).find((entry) => participantId(entry) === RUSK_PARTICIPANT_IDS.PLAYER);
  const projection = {
    encounter_title: state.combat?.encounter_title ?? 'Rusk at the Shrine',
    combat_status: state.combat?.status ?? 'active',
    round: state.combat?.round_number ?? 1,
    current_actor_id: state.combat?.current_participant_id ?? null,
    player_position: playerSpatial?.current_zone_id ?? null,
    participants: asArray(state.participants).map((participant) => visibleParticipant(participant)),
    latest_result: state.latest_result?.player_result_bundle ?? null,
    latest_events: asArray(state.automatic_events).map((event) => ({
      event_type: event.event_type,
      actor: event.actor,
      summary: event.summary,
      target: event.target,
      destination_zone_id: event.destination_zone_id,
    })),
    focus_available: true,
    outcome: state.canonical_rusk_handoff ? {
      status: 'completion_ready',
      outcome_id: state.canonical_rusk_handoff.outcome_id,
      summary: state.canonical_rusk_handoff.player_safe_summary,
      review_only: true,
      aftermath_applied: false,
    } : null,
    next_step: state.canonical_rusk_handoff
      ? 'Review the result and wait for the Shrine Ruins aftermath handoff.'
      : 'Continue the fight, use Combat Focus, retreat, or end your turn when ready.',
  };
  assertNoCanonicalRuskPlayerHiddenData(projection);
  return projection;
}

export function buildCanonicalRuskGmDevTrace(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  return {
    trace_kind: 'canonical_rusk_encounter',
    phase: input.phase ?? null,
    outcome_id: input.outcome_id ?? state.canonical_rusk_handoff?.outcome_id ?? null,
    combat: cloneSerializable(state.combat),
    participants: cloneSerializable(state.participants),
    parent_turn: cloneSerializable(state.parent_turn),
    tactical_profile_ids: asArray(state.tactical_profiles).map((profile) => profile.profile_id),
    reaction_definition_ids: asArray(state.reaction_definitions).map((definition) => definition.reaction_id),
    completion_handoff: cloneSerializable(state.canonical_rusk_handoff ?? null),
    persistence: {
      operation_order: cloneSerializable(state.combat_persistence?.operation_order ?? []),
      latest_event: cloneSerializable(state.latest_combat_event ?? null),
    },
  };
}

export function assertNoCanonicalRuskPlayerHiddenData(payload = {}) {
  const serialized = JSON.stringify(payload);
  for (const forbidden of PLAYER_PROHIBITED_STRINGS) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Canonical Rusk player payload contains prohibited data: ${forbidden}`);
    }
  }
  assertNoCombatPersistencePlayerHiddenData(payload);
  return true;
}
