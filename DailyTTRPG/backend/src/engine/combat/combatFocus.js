import {
  COMBAT_ACTION_TIMING_CATEGORIES,
  COMBAT_RESOURCE_CATEGORIES,
  COMBAT_TARGET_POLICIES,
  createCombatActionDefinition,
} from './actionEffectResourceFramework.js';
import {
  CONDITION_CONTEXT_KINDS,
  evaluateConditionEffects,
} from './conditionStateLifecycle.js';
import {
  ACTION_RANGE_KINDS,
  PROXIMITY_STATES,
  calculateTransitionCost,
  detectOpportunityAttackCandidates,
  determineEngagement,
  evaluateExplicitRoute,
  evaluateRetreatRoute,
  resolveCover,
  resolveReach,
} from './spatialMovement.js';
import {
  DND5E_2014_RULESET,
} from './rulesResolution.js';
import {
  buildCurrentTurnReadModel,
  listCurrentLegalDecisionCategories,
} from './playerTurnRuntime.js';
import {
  REACTION_WINDOW_STATUSES,
} from './reactionInterruptRuntime.js';
import {
  buildPlayerVisibleTargetCandidates,
  buildTargetPreview,
} from './targetingParticipantDynamics.js';
import {
  createCombatRulesetIdentity,
} from '../../services/interactionCore/combatAdapterContract.js';

export const COMBAT_FOCUS_CATEGORIES = Object.freeze({
  ENEMY_SPECIFIC: 'enemy_specific',
  MOVEMENT_AND_POSITIONING: 'movement_and_positioning',
  ACTION_FEASIBILITY: 'action_feasibility',
  TERRAIN_AND_OBJECTS: 'terrain_and_objects',
  RETREAT: 'retreat',
  SELF_STATE: 'self_state',
});

export const COMBAT_FOCUS_VALIDITY_SCOPES = Object.freeze({
  CURRENT_TURN: 'current_turn',
  CURRENT_SELECTION: 'current_selection',
  CURRENT_REACTION_WINDOW: 'current_reaction_window',
  RECOVERY_STATE: 'recovery_state',
});

export const COMBAT_FOCUS_MATCH_STATUSES = Object.freeze({
  MATCHED: 'matched',
  DISAMBIGUATION_REQUIRED: 'disambiguation_required',
  PARAMETER_CHOICES_REQUIRED: 'parameter_choices_required',
  UNSUPPORTED: 'unsupported',
});

export const COMBAT_FOCUS_ANSWER_STATUSES = Object.freeze({
  ANSWERED: 'answered',
  REUSED: 'reused',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
  DECLINED: 'declined',
});

const CATEGORY_DEFINITIONS = Object.freeze([
  {
    category_id: COMBAT_FOCUS_CATEGORIES.ENEMY_SPECIFIC,
    player_label: 'Enemy Questions',
    description: 'Understand a visible enemy, range, engagement, cover, and target legality.',
    priority: 10,
    progressive_group: 'current_target',
  },
  {
    category_id: COMBAT_FOCUS_CATEGORIES.ACTION_FEASIBILITY,
    player_label: 'Action Questions',
    description: 'Check whether a selected action is currently usable and what it affects.',
    priority: 20,
    progressive_group: 'selected_action',
  },
  {
    category_id: COMBAT_FOCUS_CATEGORIES.MOVEMENT_AND_POSITIONING,
    player_label: 'Movement Questions',
    description: 'Check routes, movement cost, danger, cover changes, and engagement changes.',
    priority: 30,
    progressive_group: 'movement',
  },
  {
    category_id: COMBAT_FOCUS_CATEGORIES.SELF_STATE,
    player_label: 'My Turn State',
    description: 'Review your movement, resources, conditions, concentration, and reaction state.',
    priority: 40,
    progressive_group: 'self',
  },
  {
    category_id: COMBAT_FOCUS_CATEGORIES.RETREAT,
    player_label: 'Retreat Questions',
    description: 'Review visible escape routes and known retreat risks.',
    priority: 50,
    progressive_group: 'retreat',
  },
  {
    category_id: COMBAT_FOCUS_CATEGORIES.TERRAIN_AND_OBJECTS,
    player_label: 'Terrain And Objects',
    description: 'Review visible cover, authored objects, and reachable zones.',
    priority: 60,
    progressive_group: 'terrain',
  },
]);

function template(input) {
  return Object.freeze({
    ruleset: DND5E_2014_RULESET,
    required_context: ['active_combat_state'],
    applicable_decision_states: ['player_turn', 'player_reaction', 'automatic_pause'],
    visibility_policy: 'player_visible_and_rules_knowable_only',
    default_validity_scope: COMBAT_FOCUS_VALIDITY_SCOPES.CURRENT_TURN,
    related_template_ids: [],
    optional_parameters: [],
    synonyms: [],
    ...input,
  });
}

export const COMBAT_FOCUS_TEMPLATES = Object.freeze([
  template({
    template_id: 'enemy.can_i_reach',
    category: COMBAT_FOCUS_CATEGORIES.ENEMY_SPECIFIC,
    canonical_question: 'Can I reach this enemy?',
    required_parameters: ['enemy_participant_id'],
    answer_resolver_id: 'enemy_can_i_reach',
    answer_shape: 'boolean_with_route_summary',
    dependency_declarations: ['actor_position', 'target_position', 'movement_remaining', 'visible_routes', 'movement_conditions'],
    free_text_phrases: ['can i reach', 'reach this enemy', 'get to enemy', 'move to enemy'],
    synonyms: ['reach', 'get to', 'move to'],
    related_template_ids: ['movement.can_move_to_zone', 'enemy.am_i_engaged'],
  }),
  template({
    template_id: 'enemy.can_reach_me',
    category: COMBAT_FOCUS_CATEGORIES.ENEMY_SPECIFIC,
    canonical_question: 'Can this enemy reach me?',
    required_parameters: ['enemy_participant_id'],
    answer_resolver_id: 'enemy_can_reach_me',
    answer_shape: 'visible_risk_summary',
    dependency_declarations: ['target_position', 'actor_position', 'visible_routes', 'visible_reach', 'visible_conditions'],
    free_text_phrases: ['can this enemy reach me', 'can enemy reach me', 'can they get to me'],
    synonyms: ['reach me', 'get to me'],
  }),
  template({
    template_id: 'enemy.am_i_engaged',
    category: COMBAT_FOCUS_CATEGORIES.ENEMY_SPECIFIC,
    canonical_question: 'Am I engaged with this enemy?',
    required_parameters: ['enemy_participant_id'],
    answer_resolver_id: 'enemy_am_i_engaged',
    answer_shape: 'engagement_state',
    dependency_declarations: ['proximity', 'engagement'],
    free_text_phrases: ['am i engaged', 'engaged with', 'in melee with'],
    synonyms: ['engaged', 'melee'],
  }),
  template({
    template_id: 'enemy.opportunity_attack_if_move_away',
    category: COMBAT_FOCUS_CATEGORIES.ENEMY_SPECIFIC,
    canonical_question: 'Will moving away provoke an opportunity attack?',
    required_parameters: ['enemy_participant_id'],
    optional_parameters: ['selected_route_id'],
    answer_resolver_id: 'enemy_opportunity_attack_if_move_away',
    answer_shape: 'conservative_opportunity_risk',
    dependency_declarations: ['proximity', 'reaction_state', 'movement_kind', 'visible_reach', 'turn_effects'],
    free_text_phrases: ['opportunity attack', 'moving away provoke', 'will they hit me if i move', 'leave reach'],
    synonyms: ['opportunity', 'provoke', 'move away'],
  }),
  template({
    template_id: 'enemy.within_selected_action_range',
    category: COMBAT_FOCUS_CATEGORIES.ENEMY_SPECIFIC,
    canonical_question: 'Is this enemy within range of a selected action?',
    required_parameters: ['enemy_participant_id', 'action_id'],
    answer_resolver_id: 'enemy_within_selected_action_range',
    answer_shape: 'range_legality',
    dependency_declarations: ['actor_position', 'target_position', 'selected_action', 'cover', 'visibility'],
    free_text_phrases: ['within range', 'in range', 'can my action reach', 'range of action'],
    synonyms: ['range', 'reach with action'],
  }),
  template({
    template_id: 'enemy.cover',
    category: COMBAT_FOCUS_CATEGORIES.ENEMY_SPECIFIC,
    canonical_question: 'Does this enemy have cover?',
    required_parameters: ['enemy_participant_id'],
    optional_parameters: ['action_id'],
    answer_resolver_id: 'enemy_cover',
    answer_shape: 'observable_cover',
    dependency_declarations: ['target_position', 'cover', 'selected_action'],
    free_text_phrases: ['does this enemy have cover', 'enemy cover', 'is there cover'],
    synonyms: ['cover'],
  }),
  template({
    template_id: 'enemy.visible_conditions',
    category: COMBAT_FOCUS_CATEGORIES.ENEMY_SPECIFIC,
    canonical_question: 'Which visible conditions affect this enemy?',
    required_parameters: ['enemy_participant_id'],
    answer_resolver_id: 'enemy_visible_conditions',
    answer_shape: 'visible_conditions',
    dependency_declarations: ['visible_conditions'],
    free_text_phrases: ['conditions affect this enemy', 'enemy conditions', 'what conditions on enemy'],
    synonyms: ['conditions', 'status'],
  }),
  template({
    template_id: 'enemy.legal_target_for_selected_action',
    category: COMBAT_FOCUS_CATEGORIES.ENEMY_SPECIFIC,
    canonical_question: 'Is this enemy a legal target for the selected action?',
    required_parameters: ['enemy_participant_id', 'action_id'],
    answer_resolver_id: 'enemy_legal_target_for_selected_action',
    answer_shape: 'target_legality',
    dependency_declarations: ['target_policy', 'visible_target_candidates', 'selected_action', 'faction', 'visibility', 'range'],
    free_text_phrases: ['legal target', 'can i target', 'valid target', 'can i choose this enemy'],
    synonyms: ['legal target', 'valid target', 'target'],
  }),
  template({
    template_id: 'movement.can_move_to_zone',
    category: COMBAT_FOCUS_CATEGORIES.MOVEMENT_AND_POSITIONING,
    canonical_question: 'Can I move to this zone or proximity state?',
    required_parameters: ['zone_id'],
    answer_resolver_id: 'movement_can_move_to_zone',
    answer_shape: 'movement_legality',
    dependency_declarations: ['current_zone', 'movement_remaining', 'visible_routes', 'movement_conditions'],
    free_text_phrases: ['can i move to', 'can i go to', 'move to zone', 'reach zone'],
    synonyms: ['move to', 'go to'],
  }),
  template({
    template_id: 'movement.cost',
    category: COMBAT_FOCUS_CATEGORIES.MOVEMENT_AND_POSITIONING,
    canonical_question: 'How much movement would that cost?',
    required_parameters: ['zone_id'],
    answer_resolver_id: 'movement_cost',
    answer_shape: 'movement_cost',
    dependency_declarations: ['visible_routes', 'movement_remaining', 'difficult_terrain'],
    free_text_phrases: ['how much movement', 'movement cost', 'cost to move', 'how far'],
    synonyms: ['cost', 'movement'],
  }),
  template({
    template_id: 'movement.route_risk',
    category: COMBAT_FOCUS_CATEGORIES.MOVEMENT_AND_POSITIONING,
    canonical_question: 'Is the route difficult, blocked, or dangerous?',
    required_parameters: ['zone_id'],
    answer_resolver_id: 'movement_route_risk',
    answer_shape: 'route_risk',
    dependency_declarations: ['visible_routes', 'visible_hazards', 'blocked_routes'],
    free_text_phrases: ['route dangerous', 'is route blocked', 'difficult terrain', 'dangerous route'],
    synonyms: ['danger', 'blocked', 'difficult'],
  }),
  template({
    template_id: 'movement.and_action_possible',
    category: COMBAT_FOCUS_CATEGORIES.MOVEMENT_AND_POSITIONING,
    canonical_question: 'Can I move there and still use the selected action?',
    required_parameters: ['zone_id', 'action_id'],
    answer_resolver_id: 'movement_and_action_possible',
    answer_shape: 'movement_action_feasibility',
    dependency_declarations: ['movement_remaining', 'visible_routes', 'selected_action', 'target_legality_after_movement', 'action_economy'],
    free_text_phrases: ['move there and still use', 'move and attack', 'move and use action'],
    synonyms: ['move and act', 'move and attack'],
  }),
  template({
    template_id: 'movement.cover_change',
    category: COMBAT_FOCUS_CATEGORIES.MOVEMENT_AND_POSITIONING,
    canonical_question: 'Would this movement remove or grant cover?',
    required_parameters: ['zone_id'],
    answer_resolver_id: 'movement_cover_change',
    answer_shape: 'cover_change',
    dependency_declarations: ['current_cover', 'destination_cover', 'visible_routes'],
    free_text_phrases: ['movement grant cover', 'lose cover', 'gain cover', 'cover if i move'],
    synonyms: ['gain cover', 'lose cover'],
  }),
  template({
    template_id: 'movement.engagement_change',
    category: COMBAT_FOCUS_CATEGORIES.MOVEMENT_AND_POSITIONING,
    canonical_question: 'Would this movement break or create engagement?',
    required_parameters: ['zone_id'],
    answer_resolver_id: 'movement_engagement_change',
    answer_shape: 'engagement_change',
    dependency_declarations: ['current_engagement', 'destination_engagement', 'visible_enemies'],
    free_text_phrases: ['break engagement', 'create engagement', 'engaged if i move'],
    synonyms: ['break engagement', 'create engagement'],
  }),
  template({
    template_id: 'action.can_use_now',
    category: COMBAT_FOCUS_CATEGORIES.ACTION_FEASIBILITY,
    canonical_question: 'Can I use this action now?',
    required_parameters: ['action_id'],
    answer_resolver_id: 'action_can_use_now',
    answer_shape: 'action_legality',
    dependency_declarations: ['action_economy', 'conditions', 'resources', 'selected_action'],
    free_text_phrases: ['can i use this action', 'can i use', 'can i do this', 'is action available'],
    synonyms: ['use action', 'available'],
  }),
  template({
    template_id: 'action.economy_cost',
    category: COMBAT_FOCUS_CATEGORIES.ACTION_FEASIBILITY,
    canonical_question: 'What action-economy resource would it consume?',
    required_parameters: ['action_id'],
    answer_resolver_id: 'action_economy_cost',
    answer_shape: 'timing_cost',
    dependency_declarations: ['selected_action', 'action_timing'],
    free_text_phrases: ['what does it cost', 'action economy', 'consume action', 'bonus action cost'],
    synonyms: ['cost', 'action economy'],
  }),
  template({
    template_id: 'action.visible_legal_targets',
    category: COMBAT_FOCUS_CATEGORIES.ACTION_FEASIBILITY,
    canonical_question: 'Which visible targets are legal?',
    required_parameters: ['action_id'],
    answer_resolver_id: 'action_visible_legal_targets',
    answer_shape: 'visible_targets',
    dependency_declarations: ['visible_target_candidates', 'target_policy', 'factions', 'visibility'],
    free_text_phrases: ['which targets are legal', 'who can i target', 'visible targets', 'legal targets'],
    synonyms: ['legal targets', 'who target'],
  }),
  template({
    template_id: 'action.affects_allies',
    category: COMBAT_FOCUS_CATEGORIES.ACTION_FEASIBILITY,
    canonical_question: 'Would the action affect allies?',
    required_parameters: ['action_id'],
    answer_resolver_id: 'action_affects_allies',
    answer_shape: 'ally_confirmation_summary',
    dependency_declarations: ['visible_target_candidates', 'target_policy', 'selected_targets', 'faction'],
    free_text_phrases: ['affect allies', 'hit allies', 'friendly fire', 'hurt allies'],
    synonyms: ['allies', 'friendly fire'],
  }),
  template({
    template_id: 'action.break_concentration',
    category: COMBAT_FOCUS_CATEGORIES.ACTION_FEASIBILITY,
    canonical_question: 'Would the action break concentration?',
    required_parameters: ['action_id'],
    answer_resolver_id: 'action_break_concentration',
    answer_shape: 'concentration_warning',
    dependency_declarations: ['selected_action', 'current_concentration'],
    free_text_phrases: ['break concentration', 'lose concentration', 'replace concentration'],
    synonyms: ['concentration'],
  }),
  template({
    template_id: 'action.resource_available',
    category: COMBAT_FOCUS_CATEGORIES.ACTION_FEASIBILITY,
    canonical_question: 'Is the required resource or use available?',
    required_parameters: ['action_id'],
    answer_resolver_id: 'action_resource_available',
    answer_shape: 'resource_availability',
    dependency_declarations: ['resources', 'selected_action'],
    free_text_phrases: ['resource available', 'uses left', 'can spend', 'charges left'],
    synonyms: ['resource', 'uses', 'charges'],
  }),
  template({
    template_id: 'terrain.cover_available',
    category: COMBAT_FOCUS_CATEGORIES.TERRAIN_AND_OBJECTS,
    canonical_question: 'What visible cover is available?',
    required_parameters: [],
    answer_resolver_id: 'terrain_cover_available',
    answer_shape: 'visible_cover_list',
    dependency_declarations: ['visible_zones', 'visible_cover'],
    free_text_phrases: ['visible cover', 'what cover', 'where is cover'],
    synonyms: ['cover'],
  }),
  template({
    template_id: 'terrain.objects_interact',
    category: COMBAT_FOCUS_CATEGORIES.TERRAIN_AND_OBJECTS,
    canonical_question: 'Which authored objects can I interact with?',
    required_parameters: [],
    answer_resolver_id: 'terrain_objects_interact',
    answer_shape: 'visible_object_list',
    dependency_declarations: ['visible_objects', 'object_interaction_resource'],
    free_text_phrases: ['objects can i interact', 'interact with object', 'visible objects'],
    synonyms: ['object', 'interact'],
  }),
  template({
    template_id: 'terrain.object_cost',
    category: COMBAT_FOCUS_CATEGORIES.TERRAIN_AND_OBJECTS,
    canonical_question: 'What would using this visible object cost?',
    required_parameters: ['object_id'],
    answer_resolver_id: 'terrain_object_cost',
    answer_shape: 'object_cost',
    dependency_declarations: ['visible_objects', 'object_interaction_resource'],
    free_text_phrases: ['object cost', 'using object cost', 'what does object use'],
    synonyms: ['object cost', 'use object'],
  }),
  template({
    template_id: 'terrain.reachable_zones',
    category: COMBAT_FOCUS_CATEGORIES.TERRAIN_AND_OBJECTS,
    canonical_question: 'Which named zones are currently reachable?',
    required_parameters: [],
    answer_resolver_id: 'terrain_reachable_zones',
    answer_shape: 'reachable_zone_list',
    dependency_declarations: ['movement_remaining', 'visible_routes', 'blocked_routes'],
    free_text_phrases: ['reachable zones', 'where can i move', 'which zones reachable'],
    synonyms: ['reachable', 'zones'],
  }),
  template({
    template_id: 'retreat.possible',
    category: COMBAT_FOCUS_CATEGORIES.RETREAT,
    canonical_question: 'Is retreat currently possible?',
    required_parameters: [],
    answer_resolver_id: 'retreat_possible',
    answer_shape: 'retreat_possibility',
    dependency_declarations: ['visible_retreat_routes', 'movement_remaining', 'conditions'],
    free_text_phrases: ['is retreat possible', 'can i retreat', 'can i escape'],
    synonyms: ['retreat', 'escape'],
  }),
  template({
    template_id: 'retreat.escape_routes',
    category: COMBAT_FOCUS_CATEGORIES.RETREAT,
    canonical_question: 'Which escape routes are visible?',
    required_parameters: [],
    answer_resolver_id: 'retreat_escape_routes',
    answer_shape: 'visible_escape_routes',
    dependency_declarations: ['visible_retreat_routes'],
    free_text_phrases: ['escape routes', 'visible escape', 'retreat routes'],
    synonyms: ['escape route', 'retreat route'],
  }),
  template({
    template_id: 'retreat.requirements',
    category: COMBAT_FOCUS_CATEGORIES.RETREAT,
    canonical_question: 'What must I do to reach or use an escape route?',
    required_parameters: [],
    answer_resolver_id: 'retreat_requirements',
    answer_shape: 'retreat_requirements',
    dependency_declarations: ['visible_retreat_routes', 'movement_remaining', 'visible_objects'],
    free_text_phrases: ['what must i do to retreat', 'requirements to escape', 'need to retreat'],
    synonyms: ['requirements', 'retreat'],
  }),
  template({
    template_id: 'retreat.opportunity_risk',
    category: COMBAT_FOCUS_CATEGORIES.RETREAT,
    canonical_question: 'Would retreat provoke an opportunity attack?',
    required_parameters: [],
    answer_resolver_id: 'retreat_opportunity_risk',
    answer_shape: 'retreat_opportunity_risk',
    dependency_declarations: ['visible_retreat_routes', 'reaction_state', 'engagement'],
    free_text_phrases: ['retreat provoke', 'escape opportunity attack', 'retreat opportunity attack'],
    synonyms: ['retreat provoke', 'opportunity'],
  }),
  template({
    template_id: 'self.condition_restrictions',
    category: COMBAT_FOCUS_CATEGORIES.SELF_STATE,
    canonical_question: 'Which conditions currently restrict me?',
    required_parameters: [],
    answer_resolver_id: 'self_condition_restrictions',
    answer_shape: 'condition_restrictions',
    dependency_declarations: ['actor_conditions'],
    free_text_phrases: ['conditions restrict me', 'what conditions on me', 'am i restricted'],
    synonyms: ['conditions', 'restricted'],
  }),
  template({
    template_id: 'self.movement_remaining',
    category: COMBAT_FOCUS_CATEGORIES.SELF_STATE,
    canonical_question: 'How much movement remains?',
    required_parameters: [],
    answer_resolver_id: 'self_movement_remaining',
    answer_shape: 'movement_remaining',
    dependency_declarations: ['movement_remaining', 'movement_spent', 'dash_added_movement'],
    free_text_phrases: ['movement remains', 'movement left', 'how much can i move'],
    synonyms: ['movement left'],
  }),
  template({
    template_id: 'self.turn_resources_remaining',
    category: COMBAT_FOCUS_CATEGORIES.SELF_STATE,
    canonical_question: 'Which turn resources remain?',
    required_parameters: [],
    answer_resolver_id: 'self_turn_resources_remaining',
    answer_shape: 'turn_resource_state',
    dependency_declarations: ['action_economy', 'movement_remaining', 'object_interaction', 'reaction_state'],
    free_text_phrases: ['turn resources remain', 'what do i have left', 'action left', 'bonus action left'],
    synonyms: ['resources left', 'action left'],
  }),
  template({
    template_id: 'self.concentration',
    category: COMBAT_FOCUS_CATEGORIES.SELF_STATE,
    canonical_question: 'Am I concentrating, and on what?',
    required_parameters: [],
    answer_resolver_id: 'self_concentration',
    answer_shape: 'concentration_state',
    dependency_declarations: ['current_concentration'],
    free_text_phrases: ['am i concentrating', 'what am i concentrating on', 'concentration status'],
    synonyms: ['concentration'],
  }),
  template({
    template_id: 'self.reactions_remaining',
    category: COMBAT_FOCUS_CATEGORIES.SELF_STATE,
    canonical_question: 'Which reactions remain available?',
    required_parameters: [],
    answer_resolver_id: 'self_reactions_remaining',
    answer_shape: 'reaction_state',
    dependency_declarations: ['reaction_resources', 'reaction_window'],
    free_text_phrases: ['reactions remain', 'reaction available', 'can i react'],
    synonyms: ['reaction'],
    default_validity_scope: COMBAT_FOCUS_VALIDITY_SCOPES.CURRENT_REACTION_WINDOW,
  }),
]);

const PLAYER_PROHIBITED_KEYS = Object.freeze([
  'armor_class',
  'target_armor_class',
  'difficulty_class',
  'hidden',
  'hidden_participant',
  'hidden_target',
  'raw_roll',
  'roll_record',
  'roll_override',
  'roll_overrides',
  'mutation_plan',
  'mutation_instructions',
  'idempotency_key',
  'source_state_version',
  'current_state_version',
  'action_window_id',
  'dependency_fingerprint',
  'dependency_snapshot',
  'matcher_score',
  'match_score',
  'resolver_id',
  'answer_resolver_id',
  'gm_dev',
  'trace',
  'control_mode',
  'test_override',
  'secret',
  'exact_hit_points',
]);

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizedKey(value) {
  return cleanText(String(value ?? '')).toLowerCase();
}

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function toInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function participantId(input = {}) {
  if (!input || typeof input !== 'object') {
    return cleanText(input);
  }
  return cleanText(input.participant_id ?? input.participantId ?? input.id);
}

function actionId(input = {}) {
  if (!input || typeof input !== 'object') {
    return cleanText(input);
  }
  return cleanText(input.action_id ?? input.actionId ?? input.id);
}

function objectId(input = {}) {
  if (!input || typeof input !== 'object') {
    return cleanText(input);
  }
  return cleanText(input.object_id ?? input.objectId ?? input.id);
}

function zoneId(input = {}) {
  if (!input || typeof input !== 'object') {
    return cleanText(input);
  }
  return cleanText(input.zone_id ?? input.zoneId ?? input.id);
}

function stableId(parts = []) {
  return parts.map((part) => cleanText(part ?? 'none')).filter(Boolean).join(':');
}

function normalizeRuleset(input = DND5E_2014_RULESET) {
  const ruleset = createCombatRulesetIdentity(input);
  if (ruleset.system !== DND5E_2014_RULESET.system || ruleset.rules_version !== DND5E_2014_RULESET.rules_version) {
    const error = new Error(`Unsupported Combat Focus ruleset ${ruleset.system}/${ruleset.rules_version}.`);
    error.code = 'UNSUPPORTED_COMBAT_FOCUS_RULESET';
    throw error;
  }
  return ruleset;
}

function normalizeActionDefinitions(actions = []) {
  return asArray(actions).map((action) => {
    try {
      return createCombatActionDefinition(action);
    } catch {
      return cloneSerializable(action);
    }
  });
}

function normalizeState(input = {}) {
  const state = cloneSerializable(input);
  state.combat = state.combat ?? {};
  state.combat.combat_id = cleanText(state.combat.combat_id ?? state.combat.id ?? state.combat_id ?? state.combatId) || 'combat:focus';
  state.combat.ruleset = normalizeRuleset(state.combat.ruleset ?? state.ruleset ?? DND5E_2014_RULESET);
  state.participants = asArray(state.participants);
  state.actions = normalizeActionDefinitions(state.actions ?? state.action_definitions ?? state.actionDefinitions);
  state.resources = asArray(state.resources);
  state.conditions = asArray(state.conditions);
  state.spatial = state.spatial ?? {};
  state.spatial.participants = asArray(state.spatial.participants);
  state.spatial.transitions = asArray(state.spatial.transitions);
  state.spatial.zones = asArray(state.spatial.zones);
  state.spatial.objects = asArray(state.spatial.objects ?? state.objects);
  state.reaction_resources = state.reaction_resources ?? {};
  state.reaction_windows = asArray(state.reaction_windows);
  state.combat_focus_answers = asArray(state.combat_focus_answers);
  return state;
}

function findParticipant(state, id) {
  return asArray(state.participants).find((entry) => participantId(entry) === cleanText(id)) ?? null;
}

function actorFor(state, actorId = null) {
  return findParticipant(state, actorId ?? state.parent_turn?.actor_participant_id ?? state.current_participant_id ?? state.actor_participant_id);
}

function findAction(state, id) {
  return asArray(state.actions).find((entry) => actionId(entry) === cleanText(id)) ?? null;
}

function findObject(state, id) {
  return asArray(state.spatial.objects).find((entry) => objectId(entry) === cleanText(id)) ?? null;
}

function findZone(state, id) {
  return asArray(state.spatial.zones).find((entry) => zoneId(entry) === cleanText(id)) ?? null;
}

function relationFor(state = {}, actor = {}, target = {}) {
  const actorFaction = cleanText(actor.faction);
  const targetFaction = cleanText(target.faction);
  if (!actorFaction || !targetFaction) {
    return 'neutral';
  }
  if (actorFaction === targetFaction) {
    return 'ally';
  }
  const direct = asArray(state.faction_relationships).find((entry) =>
    cleanText(entry.faction_a ?? entry.factionA) === actorFaction &&
    cleanText(entry.faction_b ?? entry.factionB) === targetFaction
  );
  const reverse = asArray(state.faction_relationships).find((entry) =>
    cleanText(entry.faction_a ?? entry.factionA) === targetFaction &&
    cleanText(entry.faction_b ?? entry.factionB) === actorFaction
  );
  const value = normalizedKey(direct?.relationship ?? reverse?.relationship ?? direct?.status ?? reverse?.status);
  if (['hostile', 'enemy', 'enemies'].includes(value)) {
    return 'hostile';
  }
  if (['ally', 'allied', 'friendly'].includes(value)) {
    return 'ally';
  }
  return 'neutral';
}

function isVisibleToActor(state = {}, actor = {}, participant = {}) {
  if (participantId(actor) === participantId(participant)) {
    return true;
  }
  if (participant.hidden === true || participant.can_be_perceived === false || participant.visible === false) {
    return false;
  }
  const visibleTo = asArray(participant.visible_to_actor_ids ?? participant.visibleToActorIds ?? participant.visible_to);
  if (visibleTo.length > 0 && !visibleTo.map(cleanText).includes(participantId(actor))) {
    return false;
  }
  const spatial = spatialForParticipant(state, participant);
  if (spatial.visibility?.hidden === true || spatial.visibility?.can_be_perceived === false) {
    return false;
  }
  return true;
}

function spatialForParticipant(state = {}, participant = {}) {
  const id = participantId(participant);
  return asArray(state.spatial?.participants).find((entry) => participantId(entry) === id) ?? participant;
}

function participantZone(state = {}, participant = {}) {
  const spatial = spatialForParticipant(state, participant);
  return cleanText(spatial.current_zone_id ?? spatial.zone_id ?? participant.current_zone_id ?? participant.zone_id);
}

function proximityBetween(state = {}, leftId, rightId) {
  const left = findParticipant(state, leftId) ?? {};
  const right = findParticipant(state, rightId) ?? {};
  const relationships = [
    ...asArray(left.relationships),
    ...asArray(right.relationships),
    ...asArray(state.spatial?.relationships),
  ];
  const found = relationships.find((entry) => {
    const a = cleanText(entry.participant_a_id ?? entry.participantAId ?? entry.a);
    const b = cleanText(entry.participant_b_id ?? entry.participantBId ?? entry.b);
    return (a === cleanText(leftId) && b === cleanText(rightId)) || (a === cleanText(rightId) && b === cleanText(leftId));
  });
  if (found) {
    return cleanText(found.proximity) || PROXIMITY_STATES.NEARBY;
  }
  return participantZone(state, left) && participantZone(state, left) === participantZone(state, right)
    ? PROXIMITY_STATES.ENGAGED
    : PROXIMITY_STATES.NEARBY;
}

function healthBand(participant = {}) {
  if (participant.defeated === true || toInteger(participant.current_hit_points ?? participant.currentHp ?? participant.current_hp, 0) <= 0) {
    return 'defeated';
  }
  const current = toInteger(participant.current_hit_points ?? participant.currentHitPoints ?? participant.current_hp, 0);
  const max = Math.max(toInteger(participant.max_hit_points ?? participant.maxHitPoints ?? participant.max_hp, current), 1);
  const ratio = current / max;
  if (ratio <= 0.25) {
    return 'bloodied';
  }
  if (ratio <= 0.5) {
    return 'wounded';
  }
  return 'standing';
}

function visibleParticipantRef(state, actor, participant) {
  return {
    participant_id: participantId(participant),
    display_name: participant.display_name ?? participant.name ?? participantId(participant),
    faction: participant.faction ?? null,
    relation: relationFor(state, actor, participant),
    health_band: participantId(actor) === participantId(participant) ? null : healthBand(participant),
    current_zone_id: participantZone(state, participant) || null,
    proximity: participantId(actor) === participantId(participant) ? null : proximityBetween(state, participantId(actor), participantId(participant)),
  };
}

function activeConditionsFor(state, participant) {
  const id = participantId(participant);
  const participantConditions = asArray(participant.conditions).map((entry) => typeof entry === 'string' ? { condition_type: entry, visible: true, active: true } : entry);
  return [...asArray(state.conditions), ...participantConditions]
    .filter((condition) => {
      const targetId = cleanText(condition.target_participant_id ?? condition.targetParticipantId ?? condition.participant_id ?? condition.participantId ?? id);
      return targetId === id && condition.active !== false && condition.expired !== true;
    });
}

function visibleConditionsFor(state, participant) {
  return activeConditionsFor(state, participant)
    .filter((condition) => condition.hidden !== true && condition.visible !== false)
    .map((condition) => ({
      condition_id: cleanText(condition.condition_type ?? condition.condition_id ?? condition.id),
      label: cleanText(condition.player_label ?? condition.label ?? condition.condition_type ?? condition.condition_id ?? condition.id),
      known_duration: condition.hidden_duration ? null : cleanText(condition.duration_label ?? condition.expires_at ?? condition.duration) || null,
    }))
    .filter((entry) => entry.condition_id);
}

function currentMovement(contextOrState) {
  const state = contextOrState.state ? contextOrState.state : contextOrState;
  const turn = state.parent_turn ?? {};
  const base = toInteger(turn.base_movement ?? actorFor(state)?.speed ?? actorFor(state)?.speed_walk, 30);
  const dash = toInteger(turn.dash_added_movement);
  const spent = toInteger(turn.movement_spent);
  return {
    base_movement: base,
    dash_added_movement: dash,
    movement_spent: spent,
    movement_remaining: Math.max(base + dash - spent, 0),
  };
}

function actorCapabilities(state, actor) {
  const conditions = activeConditionsFor(state, actor);
  const capability = evaluateConditionEffects({
    participant: actor,
    conditions,
    context_kind: CONDITION_CONTEXT_KINDS.CAPABILITY,
  });
  const action = evaluateConditionEffects({
    participant: actor,
    conditions,
    context_kind: CONDITION_CONTEXT_KINDS.ACTION_LEGALITY,
  });
  const movement = evaluateConditionEffects({
    participant: actor,
    conditions,
    context_kind: CONDITION_CONTEXT_KINDS.MOVEMENT,
  });
  return {
    can_act: Boolean(capability.action_allowed && action.action_allowed),
    can_bonus_action: Boolean(capability.action_allowed && action.bonus_action_allowed),
    can_react: Boolean(action.reaction_allowed),
    can_move: movement.speed_zero !== true && movement.movement_allowed !== false,
    details: { capability, action, movement },
  };
}

function visibleParticipantsFor(state, actor) {
  return asArray(state.participants)
    .filter((participant) => participantId(participant) !== participantId(actor))
    .filter((participant) => participant.active !== false && participant.exited !== true && participant.removed !== true)
    .filter((participant) => isVisibleToActor(state, actor, participant))
    .map((participant) => ({
      ...visibleParticipantRef(state, actor, participant),
      visible_conditions: visibleConditionsFor(state, participant),
    }));
}

function visibleEnemiesFor(context) {
  return context.visible_participants.filter((participant) => participant.relation === 'hostile');
}

function currentZone(context) {
  return participantZone(context.state, context.actor);
}

function visibleTransitionsFrom(context, zone = currentZone(context)) {
  return asArray(context.state.spatial.transitions)
    .filter((transition) => cleanText(transition.source_zone_id ?? transition.sourceZoneId) === cleanText(zone))
    .filter((transition) => transition.visible !== false && transition.hidden !== true)
    .sort((left, right) => cleanText(left.transition_id ?? left.id).localeCompare(cleanText(right.transition_id ?? right.id)));
}

function transitionToZone(context, zone) {
  return visibleTransitionsFrom(context)
    .find((transition) => cleanText(transition.destination_zone_id ?? transition.destinationZoneId) === cleanText(zone)) ?? null;
}

function visibleObjects(context) {
  return asArray(context.state.spatial.objects)
    .filter((object) => object.visible !== false && object.hidden !== true)
    .filter((object) => {
      const zone = cleanText(object.zone_id ?? object.zoneId ?? object.current_zone_id);
      return !zone || zone === currentZone(context);
    })
    .map((object) => ({
      object_id: objectId(object),
      label: cleanText(object.player_label ?? object.label ?? object.name ?? objectId(object)),
      interaction_cost: cleanText(object.interaction_cost ?? object.interactionCost) || 'object_interaction',
      prerequisite: cleanText(object.player_prerequisite ?? object.prerequisite) || null,
    }));
}

function visibleRetreatRoutes(context) {
  return visibleTransitionsFrom(context)
    .filter((transition) =>
      transition.retreat_route === true ||
      cleanText(transition.retreat_route_id ?? transition.retreatRouteId) ||
      cleanText(transition.destination_zone_id) === cleanText(context.state.retreat_zone_id)
    )
    .map((transition) => ({
      transition,
      transition_id: cleanText(transition.transition_id ?? transition.id),
      destination_zone_id: cleanText(transition.destination_zone_id ?? transition.destinationZoneId),
      movement_cost: calculateTransitionCost({ transition }).total_cost,
      known_risks: asArray(transition.known_risks),
      prerequisite: cleanText(transition.player_prerequisite ?? transition.prerequisite) || null,
    }));
}

function actionTimingStatus(context, action) {
  const turn = context.state.parent_turn ?? {};
  if (!action) {
    return { available: false, reason: 'action_missing' };
  }
  if (action.timing_category === COMBAT_ACTION_TIMING_CATEGORIES.ACTION) {
    return { available: turn.action_spent !== true && context.actor_capabilities.can_act, resource: 'action' };
  }
  if (action.timing_category === COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION) {
    return { available: turn.bonus_action_spent !== true && context.actor_capabilities.can_bonus_action, resource: 'bonus_action' };
  }
  if ([COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION, COMBAT_ACTION_TIMING_CATEGORIES.OBJECT_INTERACTION].includes(action.timing_category)) {
    return { available: turn.object_interaction_spent !== true && context.actor_capabilities.can_act, resource: 'object_interaction' };
  }
  if (action.timing_category === COMBAT_ACTION_TIMING_CATEGORIES.REACTION) {
    return { available: context.reaction_state.available === true, resource: 'reaction' };
  }
  return { available: false, reason: 'unsupported_timing' };
}

function resourceAvailability(context, action) {
  const costs = asArray(action?.action_level_costs);
  if (costs.length === 0) {
    return { available: true, costs: [], player_summary: 'No limited use is required.' };
  }
  const costsOut = costs.map((cost) => {
    const resource = asArray(context.state.resources).find((entry) => cleanText(entry.resource_id) === cleanText(cost.resource_id));
    const current = toInteger(resource?.current, 0);
    const amount = Math.max(toInteger(cost.amount, 1), 0);
    const available = current >= amount;
    const category = cleanText(resource?.category ?? cost.category);
    const hiddenExact = [
      COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE,
      COMBAT_RESOURCE_CATEGORIES.SHORT_REST_USE,
      COMBAT_RESOURCE_CATEGORIES.LONG_REST_USE,
      COMBAT_RESOURCE_CATEGORIES.CHARGE,
      COMBAT_RESOURCE_CATEGORIES.COOLDOWN,
      COMBAT_RESOURCE_CATEGORIES.RECHARGE,
    ].includes(category);
    return {
      resource_id: cost.resource_id,
      label: cleanText(cost.visible_label ?? resource?.label ?? cost.resource_id),
      available,
      amount,
      status: available ? (hiddenExact ? 'appears_available' : 'available') : 'unavailable',
    };
  });
  return {
    available: costsOut.every((entry) => entry.available),
    costs: costsOut,
    player_summary: costsOut.every((entry) => entry.available) ? 'The visible required use is available.' : 'A required use is not currently available.',
  };
}

function routeEvaluation(context, zoneId) {
  const transition = transitionToZone(context, zoneId);
  if (!transition) {
    const current = cleanText(zoneId) === currentZone(context);
    return current
      ? { status: 'current_zone', movement_cost: 0, route: null }
      : { status: 'unavailable', reason: 'no_visible_route', movement_cost: null, route: null };
  }
  const route = evaluateExplicitRoute({
    source_zone_id: currentZone(context),
    destination_zone_id: transition.destination_zone_id,
    selected_transition_ids: [transition.transition_id],
    transitions: context.state.spatial.transitions,
  });
  if (route.status !== 'valid') {
    return { status: 'unavailable', reason: route.reason ?? route.status, movement_cost: null, route };
  }
  const cost = route.total_cost ?? calculateTransitionCost({ transition }).total_cost;
  if (cost > context.movement.movement_remaining) {
    return { status: 'unavailable', reason: 'insufficient_movement', movement_cost: cost, route };
  }
  return { status: 'available', movement_cost: cost, route, transition };
}

function coverFor(context, target) {
  const spatial = spatialForParticipant(context.state, target);
  const coverRelationships = asArray(spatial.cover_relationships ?? target.cover_relationships);
  const explicit = coverRelationships.find((entry) =>
    !entry.attacker_participant_id ||
    cleanText(entry.attacker_participant_id) === context.actor_id ||
    cleanText(entry.source_participant_id) === context.actor_id
  );
  if (explicit) {
    return {
      cover_category: cleanText(explicit.cover_category ?? explicit.cover ?? explicit.category) || 'cover',
      direct_targeting_blocked: explicit.direct_targeting_blocked === true,
      player_summary: cleanText(explicit.player_summary) || 'The target has visible cover.',
    };
  }
  return resolveCover({
    cover_sources: spatial.cover_sources ?? target.cover_sources ?? [],
    target_id: participantId(target),
  });
}

function engagementWith(context, target) {
  return determineEngagement({
    actor: context.actor,
    target,
    proximity: proximityBetween(context.state, context.actor_id, participantId(target)),
  });
}

function selectedAction(context, parameters = {}) {
  return findAction(context.state, parameters.action_id ?? context.selected_action_id);
}

function selectedEnemy(context, parameters = {}) {
  const id = parameters.enemy_participant_id ?? parameters.target_participant_id ?? context.selected_target_id;
  const participant = findParticipant(context.state, id);
  if (!participant || !isVisibleToActor(context.state, context.actor, participant) || relationFor(context.state, context.actor, participant) !== 'hostile') {
    return null;
  }
  return participant;
}

function createAnswer(input = {}) {
  const template = templateById(input.template_id);
  const dependencySnapshot = input.dependency_snapshot ?? {};
  const answer = {
    contract_version: '6D.11',
    answer_id: input.answer_id ?? stableId(['focus-answer', input.template_id, JSON.stringify(input.parameters ?? {})]),
    template_id: input.template_id,
    category: template?.category ?? input.category,
    canonical_question: template?.canonical_question ?? input.canonical_question,
    status: input.status ?? COMBAT_FOCUS_ANSWER_STATUSES.ANSWERED,
    concise_answer: input.concise_answer,
    certainty: input.certainty ?? 'rules_knowable',
    structured_values: cloneSerializable(input.structured_values ?? {}),
    supporting_detail: asArray(input.supporting_detail),
    related_template_ids: asArray(input.related_template_ids ?? template?.related_template_ids),
    validity: createAnswerValidityRecord({
      template_id: input.template_id,
      parameters: input.parameters,
      validity_scope: input.validity_scope ?? template?.default_validity_scope,
      dependency_snapshot: dependencySnapshot,
      turn_id: input.turn_id,
    }),
    player_safe: true,
  };
  assertNoCombatFocusPlayerHiddenData(projectCombatFocusAnswerForPlayer(answer));
  return answer;
}

function actorRestrictionSummary(context) {
  const effects = context.actor_capabilities.details;
  const restrictions = [];
  if (!context.actor_capabilities.can_act) {
    restrictions.push('Actions are restricted.');
  }
  if (!context.actor_capabilities.can_bonus_action) {
    restrictions.push('Bonus actions are restricted.');
  }
  if (!context.actor_capabilities.can_move) {
    restrictions.push('Movement is restricted.');
  }
  if (effects.action?.reaction_allowed === false) {
    restrictions.push('Reactions are restricted.');
  }
  return restrictions;
}

const ANSWER_RESOLVERS = Object.freeze({
  enemy_can_i_reach(context, parameters) {
    const target = selectedEnemy(context, parameters);
    if (!target) return unavailableAnswer('enemy.can_i_reach', context, parameters, 'Choose a visible enemy first.');
    const sameZone = participantZone(context.state, target) === currentZone(context);
    const route = sameZone ? { status: 'available', movement_cost: 0 } : routeEvaluation(context, participantZone(context.state, target));
    const canReach = route.status === 'available';
    return createAnswer({
      template_id: 'enemy.can_i_reach',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: canReach
        ? sameZone ? `${target.display_name ?? 'That enemy'} is already in your current zone.`
          : `Yes. You can reach ${target.display_name ?? 'that enemy'} with ${route.movement_cost} movement.`
        : `Not by a visible legal route right now.`,
      structured_values: { can_reach: canReach, movement_cost: route.movement_cost, target: visibleParticipantRef(context.state, context.actor, target) },
      supporting_detail: route.reason ? [`Route issue: ${route.reason}.`] : [],
      dependency_snapshot: pickDependencies(context, ['movement', 'positions', 'conditions']),
    });
  },
  enemy_can_reach_me(context, parameters) {
    const target = selectedEnemy(context, parameters);
    if (!target) return unavailableAnswer('enemy.can_reach_me', context, parameters, 'Choose a visible enemy first.');
    const proximity = proximityBetween(context.state, context.actor_id, participantId(target));
    const reachable = proximity === PROXIMITY_STATES.ENGAGED || participantZone(context.state, target) === currentZone(context);
    return createAnswer({
      template_id: 'enemy.can_reach_me',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: reachable
        ? `${target.display_name ?? 'That enemy'} is close enough to threaten you with currently visible movement or reach.`
        : `${target.display_name ?? 'That enemy'} does not appear able to reach you from visible positioning alone.`,
      certainty: 'visible_state_limited',
      structured_values: { can_reach_actor: reachable, proximity },
      supporting_detail: ['This uses only currently visible movement and abilities.'],
      dependency_snapshot: pickDependencies(context, ['positions', 'visibility']),
    });
  },
  enemy_am_i_engaged(context, parameters) {
    const target = selectedEnemy(context, parameters);
    if (!target) return unavailableAnswer('enemy.am_i_engaged', context, parameters, 'Choose a visible enemy first.');
    const engagement = engagementWith(context, target);
    return createAnswer({
      template_id: 'enemy.am_i_engaged',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: engagement.engaged ? `Yes. You are engaged with ${target.display_name ?? 'that enemy'}.` : `No. You are not currently engaged with ${target.display_name ?? 'that enemy'}.`,
      structured_values: { engaged: engagement.engaged, proximity: proximityBetween(context.state, context.actor_id, participantId(target)) },
      dependency_snapshot: pickDependencies(context, ['positions']),
    });
  },
  enemy_opportunity_attack_if_move_away(context, parameters) {
    const target = selectedEnemy(context, parameters);
    if (!target) return unavailableAnswer('enemy.opportunity_attack_if_move_away', context, parameters, 'Choose a visible enemy first.');
    const disengaged = asArray(context.state.turn_effects).some((effect) => cleanText(effect.effect_id ?? effect.id) === 'disengage');
    const reaction = context.reaction_state.by_participant[participantId(target)];
    const candidates = detectOpportunityAttackCandidates({
      mover: context.actor,
      before_proximity: proximityBetween(context.state, context.actor_id, participantId(target)),
      after_proximity: PROXIMITY_STATES.NEARBY,
      potential_reactors: [target],
      disengage_protected: disengaged,
    });
    const risk = candidates.length > 0 && reaction?.available !== false;
    return createAnswer({
      template_id: 'enemy.opportunity_attack_if_move_away',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: disengaged
        ? 'Known ordinary opportunity attacks are suppressed by Disengage.'
        : risk
          ? `Yes, moving away from ${target.display_name ?? 'that enemy'} is a known opportunity-attack risk.`
          : `No known visible opportunity-attack risk from ${target.display_name ?? 'that enemy'} is currently shown.`,
      certainty: 'visible_state_limited',
      structured_values: { known_opportunity_risk: risk, disengage_protected: disengaged },
      supporting_detail: ['Combat Focus uses only currently visible reactions and abilities.'],
      dependency_snapshot: pickDependencies(context, ['positions', 'reactions', 'turn_effects']),
    });
  },
  enemy_within_selected_action_range(context, parameters) {
    const target = selectedEnemy(context, parameters);
    const action = selectedAction(context, parameters);
    if (!target || !action) return unavailableAnswer('enemy.within_selected_action_range', context, parameters, 'Choose a visible enemy and action first.');
    const range = action.range ?? action.authored_metadata?.range ?? { range_kind: ACTION_RANGE_KINDS.SAME_ZONE };
    const inRange = range.range_kind === ACTION_RANGE_KINDS.SELF
      ? participantId(target) === context.actor_id
      : range.range_kind === ACTION_RANGE_KINDS.SIGHT
        ? true
        : participantZone(context.state, target) === currentZone(context) || proximityBetween(context.state, context.actor_id, participantId(target)) === PROXIMITY_STATES.ENGAGED;
    return createAnswer({
      template_id: 'enemy.within_selected_action_range',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: inRange ? `${target.display_name ?? 'That enemy'} is within the visible range for ${action.player_label ?? action.action_id}.` : `${target.display_name ?? 'That enemy'} is not within the visible range for ${action.player_label ?? action.action_id}.`,
      structured_values: { in_range: inRange, action_id: action.action_id, target: visibleParticipantRef(context.state, context.actor, target) },
      dependency_snapshot: pickDependencies(context, ['positions', 'selected_action', 'visibility']),
    });
  },
  enemy_cover(context, parameters) {
    const target = selectedEnemy(context, parameters);
    if (!target) return unavailableAnswer('enemy.cover', context, parameters, 'Choose a visible enemy first.');
    const cover = coverFor(context, target);
    const category = cleanText(cover.cover_category ?? cover.highest_cover ?? cover.cover) || 'none';
    const hasCover = !['none', ''].includes(category);
    return createAnswer({
      template_id: 'enemy.cover',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: hasCover ? `${target.display_name ?? 'That enemy'} has visible ${category}.` : `${target.display_name ?? 'That enemy'} has no visible cover from your current view.`,
      structured_values: { has_cover: hasCover, cover_category: hasCover ? category : 'none' },
      supporting_detail: cover.direct_targeting_blocked ? ['Total cover may block direct targeting.'] : [],
      dependency_snapshot: pickDependencies(context, ['positions', 'cover']),
    });
  },
  enemy_visible_conditions(context, parameters) {
    const target = selectedEnemy(context, parameters);
    if (!target) return unavailableAnswer('enemy.visible_conditions', context, parameters, 'Choose a visible enemy first.');
    const conditions = visibleConditionsFor(context.state, target);
    return createAnswer({
      template_id: 'enemy.visible_conditions',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: conditions.length > 0
        ? `${target.display_name ?? 'That enemy'} visibly has: ${conditions.map((entry) => entry.label).join(', ')}.`
        : `${target.display_name ?? 'That enemy'} has no visible conditions.`,
      structured_values: { visible_conditions: conditions },
      dependency_snapshot: pickDependencies(context, ['conditions', 'visibility']),
    });
  },
  enemy_legal_target_for_selected_action(context, parameters) {
    const target = selectedEnemy(context, parameters);
    const action = selectedAction(context, parameters);
    if (!target || !action) return unavailableAnswer('enemy.legal_target_for_selected_action', context, parameters, 'Choose a visible enemy and action first.');
    let preview;
    try {
      preview = buildTargetPreview({ state: context.state, actor: context.actor, action, selected_target_ids: [participantId(target)] });
    } catch {
      preview = null;
    }
    const legal = preview?.current_legality === 'available';
    return createAnswer({
      template_id: 'enemy.legal_target_for_selected_action',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: legal ? `Yes. ${target.display_name ?? 'That enemy'} is a legal visible target for ${action.player_label ?? action.action_id}.` : `No. ${target.display_name ?? 'That enemy'} is not a legal target for that action right now.`,
      structured_values: { legal_target: legal, target_id: participantId(target), action_id: action.action_id },
      supporting_detail: preview?.safe_unavailable_reason ? [preview.safe_unavailable_reason] : [],
      dependency_snapshot: pickDependencies(context, ['targeting', 'selected_action', 'factions', 'visibility']),
    });
  },
  movement_can_move_to_zone(context, parameters) {
    const route = routeEvaluation(context, parameters.zone_id ?? context.selected_zone_id);
    const destination = cleanText(parameters.zone_id ?? context.selected_zone_id);
    return createAnswer({
      template_id: 'movement.can_move_to_zone',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: route.status === 'available' || route.status === 'current_zone'
        ? route.status === 'current_zone' ? `You are already in ${destination}.` : `Yes. You can move to ${destination}.`
        : `No visible legal route to ${destination} is currently available.`,
      structured_values: { can_move: route.status === 'available' || route.status === 'current_zone', destination_zone_id: destination, movement_cost: route.movement_cost, reason: route.reason ?? null },
      dependency_snapshot: pickDependencies(context, ['movement', 'routes', 'conditions']),
    });
  },
  movement_cost(context, parameters) {
    const route = routeEvaluation(context, parameters.zone_id ?? context.selected_zone_id);
    return createAnswer({
      template_id: 'movement.cost',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: route.movement_cost === null ? 'No visible route cost is available for that destination.' : `That movement costs ${route.movement_cost} movement.`,
      structured_values: { movement_cost: route.movement_cost, movement_remaining: context.movement.movement_remaining },
      dependency_snapshot: pickDependencies(context, ['movement', 'routes']),
    });
  },
  movement_route_risk(context, parameters) {
    const route = routeEvaluation(context, parameters.zone_id ?? context.selected_zone_id);
    const risks = asArray(route.transition?.known_risks);
    const blocked = route.status === 'unavailable' && route.reason !== 'insufficient_movement';
    return createAnswer({
      template_id: 'movement.route_risk',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: blocked ? 'That visible route is blocked or unavailable.' : risks.length > 0 ? `Known visible route risks: ${risks.join(', ')}.` : 'No visible route danger is currently shown.',
      certainty: 'visible_state_limited',
      structured_values: { route_status: route.status, known_risks: risks, blocked },
      supporting_detail: ['Unrevealed hazards are not disclosed by Combat Focus.'],
      dependency_snapshot: pickDependencies(context, ['routes', 'visibility']),
    });
  },
  movement_and_action_possible(context, parameters) {
    const action = selectedAction(context, parameters);
    const route = routeEvaluation(context, parameters.zone_id ?? context.selected_zone_id);
    const timing = actionTimingStatus(context, action);
    const possible = (route.status === 'available' || route.status === 'current_zone') && timing.available;
    return createAnswer({
      template_id: 'movement.and_action_possible',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: possible ? `Yes. You can make that movement and still have the ${timing.resource} for ${action.player_label ?? action.action_id}.` : 'Not with the currently visible route and selected action state.',
      structured_values: { possible, route_status: route.status, action_available: timing.available },
      dependency_snapshot: pickDependencies(context, ['movement', 'routes', 'selected_action', 'action_economy']),
    });
  },
  movement_cover_change(context, parameters) {
    const zone = cleanText(parameters.zone_id ?? context.selected_zone_id);
    const zoneDef = findZone(context.state, zone) ?? {};
    const grants = asArray(zoneDef.visible_cover ?? zoneDef.cover_options).map((entry) => typeof entry === 'string' ? entry : cleanText(entry.label ?? entry.cover_category));
    return createAnswer({
      template_id: 'movement.cover_change',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: grants.length > 0 ? `Moving there can grant visible cover: ${grants.join(', ')}.` : 'No visible cover change is shown for that movement.',
      structured_values: { destination_zone_id: zone, grants_cover: grants },
      dependency_snapshot: pickDependencies(context, ['routes', 'cover']),
    });
  },
  movement_engagement_change(context, parameters) {
    const zone = cleanText(parameters.zone_id ?? context.selected_zone_id);
    const currentEngaged = visibleEnemiesFor(context).filter((enemy) => enemy.proximity === PROXIMITY_STATES.ENGAGED);
    const enemiesInZone = visibleEnemiesFor(context).filter((enemy) => enemy.current_zone_id === zone);
    return createAnswer({
      template_id: 'movement.engagement_change',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: enemiesInZone.length > 0
        ? `Moving there would create or keep engagement with ${enemiesInZone.map((entry) => entry.display_name).join(', ')}.`
        : currentEngaged.length > 0 ? 'Moving there appears to break current visible engagement.' : 'No visible engagement change is shown.',
      structured_values: { current_engaged_enemy_ids: currentEngaged.map((entry) => entry.participant_id), destination_engaged_enemy_ids: enemiesInZone.map((entry) => entry.participant_id) },
      dependency_snapshot: pickDependencies(context, ['positions', 'routes']),
    });
  },
  action_can_use_now(context, parameters) {
    const action = selectedAction(context, parameters);
    if (!action) return unavailableAnswer('action.can_use_now', context, parameters, 'Choose an action first.');
    const timing = actionTimingStatus(context, action);
    const resources = resourceAvailability(context, action);
    const usable = timing.available && resources.available;
    return createAnswer({
      template_id: 'action.can_use_now',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: usable ? `Yes. ${action.player_label ?? action.action_id} is currently usable.` : `${action.player_label ?? action.action_id} is not currently usable.`,
      structured_values: { usable, timing_resource: timing.resource, timing_available: timing.available, resources_available: resources.available },
      supporting_detail: resources.costs.map((cost) => `${cost.label}: ${cost.status}`),
      dependency_snapshot: pickDependencies(context, ['selected_action', 'action_economy', 'resources', 'conditions']),
    });
  },
  action_economy_cost(context, parameters) {
    const action = selectedAction(context, parameters);
    if (!action) return unavailableAnswer('action.economy_cost', context, parameters, 'Choose an action first.');
    return createAnswer({
      template_id: 'action.economy_cost',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: `${action.player_label ?? action.action_id} uses your ${actionTimingStatus(context, action).resource ?? action.timing_category}.`,
      structured_values: { timing_category: action.timing_category, resource: actionTimingStatus(context, action).resource },
      dependency_snapshot: pickDependencies(context, ['selected_action']),
    });
  },
  action_visible_legal_targets(context, parameters) {
    const action = selectedAction(context, parameters);
    if (!action) return unavailableAnswer('action.visible_legal_targets', context, parameters, 'Choose an action first.');
    let visible = [];
    try {
      visible = buildPlayerVisibleTargetCandidates({ state: context.state, actor: context.actor, action }).visible_candidates;
    } catch {
      visible = [];
    }
    return createAnswer({
      template_id: 'action.visible_legal_targets',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: visible.length > 0 ? `Visible legal targets: ${visible.map((entry) => entry.display_name).join(', ')}.` : 'No visible legal targets are currently available.',
      structured_values: { visible_targets: visible },
      dependency_snapshot: pickDependencies(context, ['targeting', 'selected_action', 'visibility', 'factions']),
    });
  },
  action_affects_allies(context, parameters) {
    const action = selectedAction(context, parameters);
    if (!action) return unavailableAnswer('action.affects_allies', context, parameters, 'Choose an action first.');
    let preview = null;
    try {
      preview = buildTargetPreview({ state: context.state, actor: context.actor, action });
    } catch {
      preview = null;
    }
    const included = asArray(preview?.visible_ally_confirmation?.included);
    return createAnswer({
      template_id: 'action.affects_allies',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: included.length > 0 ? `Yes. It visibly includes ${included.map((entry) => entry.display_name).join(', ')}.` : 'No visible ally or non-hostile inclusion is currently shown.',
      certainty: 'visible_state_limited',
      structured_values: { visible_ally_or_non_hostile_included: included },
      supporting_detail: ['Unrevealed participants are not disclosed by this answer.'],
      dependency_snapshot: pickDependencies(context, ['targeting', 'selected_action', 'factions', 'visibility']),
    });
  },
  action_break_concentration(context, parameters) {
    const action = selectedAction(context, parameters);
    if (!action) return unavailableAnswer('action.break_concentration', context, parameters, 'Choose an action first.');
    const concentrating = activeConcentration(context);
    const wouldReplace = Boolean(concentrating && action.concentration);
    return createAnswer({
      template_id: 'action.break_concentration',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: wouldReplace ? 'Yes. Starting this concentration effect would replace your current concentration.' : 'No concentration replacement is currently shown for that action.',
      structured_values: { currently_concentrating: Boolean(concentrating), would_replace_concentration: wouldReplace, concentration_label: concentrating?.label ?? concentrating?.source_action_id ?? null },
      dependency_snapshot: pickDependencies(context, ['selected_action', 'concentration']),
    });
  },
  action_resource_available(context, parameters) {
    const action = selectedAction(context, parameters);
    if (!action) return unavailableAnswer('action.resource_available', context, parameters, 'Choose an action first.');
    const resources = resourceAvailability(context, action);
    return createAnswer({
      template_id: 'action.resource_available',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: resources.player_summary,
      structured_values: { available: resources.available, resources: resources.costs },
      dependency_snapshot: pickDependencies(context, ['selected_action', 'resources']),
    });
  },
  terrain_cover_available(context, parameters) {
    const cover = asArray(context.state.spatial.zones).filter((zone) => zone.hidden !== true && zone.visible !== false).flatMap((zone) =>
      asArray(zone.visible_cover ?? zone.cover_options).map((entry) => ({
        zone_id: zoneId(zone),
        label: typeof entry === 'string' ? entry : cleanText(entry.label ?? entry.cover_category),
      }))
    );
    return createAnswer({
      template_id: 'terrain.cover_available',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: cover.length > 0 ? `Visible cover: ${cover.map((entry) => `${entry.label} in ${entry.zone_id}`).join(', ')}.` : 'No visible cover is currently listed.',
      structured_values: { visible_cover: cover },
      dependency_snapshot: pickDependencies(context, ['cover', 'visibility']),
    });
  },
  terrain_objects_interact(context, parameters) {
    const objects = visibleObjects(context);
    return createAnswer({
      template_id: 'terrain.objects_interact',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: objects.length > 0 ? `Visible objects: ${objects.map((entry) => entry.label).join(', ')}.` : 'No visible authored object interaction is currently available.',
      structured_values: { visible_objects: objects },
      dependency_snapshot: pickDependencies(context, ['objects', 'visibility']),
    });
  },
  terrain_object_cost(context, parameters) {
    const object = findObject(context.state, parameters.object_id ?? context.selected_object_id);
    const visible = object && object.hidden !== true && object.visible !== false;
    return createAnswer({
      template_id: 'terrain.object_cost',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: visible ? `Using ${object.player_label ?? object.label ?? objectId(object)} costs ${object.interaction_cost ?? 'an object interaction'}.` : 'Choose a visible object first.',
      status: visible ? COMBAT_FOCUS_ANSWER_STATUSES.ANSWERED : COMBAT_FOCUS_ANSWER_STATUSES.UNAVAILABLE,
      structured_values: visible ? { object_id: objectId(object), interaction_cost: object.interaction_cost ?? 'object_interaction' } : {},
      dependency_snapshot: pickDependencies(context, ['objects']),
    });
  },
  terrain_reachable_zones(context, parameters) {
    const routes = visibleTransitionsFrom(context).map((transition) => {
      const cost = calculateTransitionCost({ transition }).total_cost;
      return {
        zone_id: cleanText(transition.destination_zone_id ?? transition.destinationZoneId),
        movement_cost: cost,
        reachable: cost <= context.movement.movement_remaining && transition.blocked !== true,
      };
    });
    return createAnswer({
      template_id: 'terrain.reachable_zones',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: routes.filter((entry) => entry.reachable).length > 0 ? `Reachable zones: ${routes.filter((entry) => entry.reachable).map((entry) => entry.zone_id).join(', ')}.` : 'No named zone is reachable with current movement.',
      structured_values: { reachable_zones: routes },
      dependency_snapshot: pickDependencies(context, ['movement', 'routes']),
    });
  },
  retreat_possible(context, parameters) {
    const routes = visibleRetreatRoutes(context);
    const possible = routes.some((route) => {
      const evaluation = evaluateRetreatRoute({
        current_zone_id: currentZone(context),
        retreat_zone_id: route.destination_zone_id,
        required_movement: route.movement_cost,
        base_movement_budget: context.movement.movement_remaining,
        movement_spent: 0,
        route: { status: 'valid', total_cost: route.movement_cost },
      });
      return evaluation.status === 'valid';
    });
    return createAnswer({
      template_id: 'retreat.possible',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: possible ? 'A visible retreat route is currently possible.' : 'No visible retreat route is currently usable.',
      structured_values: { retreat_possible: possible, visible_route_count: routes.length },
      dependency_snapshot: pickDependencies(context, ['retreat', 'movement', 'conditions']),
    });
  },
  retreat_escape_routes(context, parameters) {
    const routes = visibleRetreatRoutes(context);
    return createAnswer({
      template_id: 'retreat.escape_routes',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: routes.length > 0 ? `Visible escape routes: ${routes.map((entry) => entry.destination_zone_id).join(', ')}.` : 'No visible escape route is currently shown.',
      structured_values: { visible_escape_routes: routes.map(({ transition, ...safe }) => safe) },
      dependency_snapshot: pickDependencies(context, ['retreat', 'routes']),
    });
  },
  retreat_requirements(context, parameters) {
    const routes = visibleRetreatRoutes(context);
    const requirements = routes.map((route) => ({
      destination_zone_id: route.destination_zone_id,
      movement_cost: route.movement_cost,
      movement_available: route.movement_cost <= context.movement.movement_remaining,
      prerequisite: route.prerequisite,
    }));
    return createAnswer({
      template_id: 'retreat.requirements',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: requirements.length > 0 ? 'Use a visible escape route and meet its movement or object requirement.' : 'No retreat requirement is visible because no escape route is visible.',
      structured_values: { requirements },
      dependency_snapshot: pickDependencies(context, ['retreat', 'movement', 'objects']),
    });
  },
  retreat_opportunity_risk(context, parameters) {
    const routes = visibleRetreatRoutes(context);
    const risk = routes.some((route) => route.known_risks.includes('opportunity_attack'));
    const engaged = visibleEnemiesFor(context).some((enemy) => enemy.proximity === PROXIMITY_STATES.ENGAGED);
    return createAnswer({
      template_id: 'retreat.opportunity_risk',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: risk || engaged ? 'Retreat has a known visible opportunity-attack risk unless a rule such as Disengage protects you.' : 'No visible opportunity-attack risk is currently shown for retreat.',
      certainty: 'visible_state_limited',
      structured_values: { known_opportunity_risk: risk || engaged },
      supporting_detail: ['This uses only currently visible reactions and hazards.'],
      dependency_snapshot: pickDependencies(context, ['retreat', 'reactions', 'positions']),
    });
  },
  self_condition_restrictions(context, parameters) {
    const conditions = visibleConditionsFor(context.state, context.actor);
    const restrictions = actorRestrictionSummary(context);
    return createAnswer({
      template_id: 'self.condition_restrictions',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: restrictions.length > 0 ? restrictions.join(' ') : 'No visible condition is currently restricting your turn options.',
      structured_values: { visible_conditions: conditions, restrictions },
      dependency_snapshot: pickDependencies(context, ['conditions']),
    });
  },
  self_movement_remaining(context, parameters) {
    return createAnswer({
      template_id: 'self.movement_remaining',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: `You have ${context.movement.movement_remaining} movement remaining.`,
      structured_values: context.movement,
      dependency_snapshot: pickDependencies(context, ['movement']),
    });
  },
  self_turn_resources_remaining(context, parameters) {
    const turn = context.state.parent_turn ?? {};
    const resources = {
      action: turn.action_spent === true ? 'spent' : context.actor_capabilities.can_act ? 'available' : 'unavailable',
      bonus_action: turn.bonus_action_spent === true ? 'spent' : context.actor_capabilities.can_bonus_action ? 'available' : 'unavailable',
      object_interaction: turn.object_interaction_spent === true ? 'spent' : context.actor_capabilities.can_act ? 'available' : 'unavailable',
      movement_remaining: context.movement.movement_remaining,
      reaction: context.reaction_state.available ? 'available' : 'spent_or_unavailable',
    };
    return createAnswer({
      template_id: 'self.turn_resources_remaining',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: `Turn resources: action ${resources.action}, bonus action ${resources.bonus_action}, object interaction ${resources.object_interaction}, reaction ${resources.reaction}, movement ${resources.movement_remaining}.`,
      structured_values: resources,
      dependency_snapshot: pickDependencies(context, ['action_economy', 'movement', 'reactions']),
    });
  },
  self_concentration(context, parameters) {
    const concentration = activeConcentration(context);
    return createAnswer({
      template_id: 'self.concentration',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: concentration ? `You are concentrating on ${concentration.label ?? concentration.source_action_id ?? 'an active effect'}.` : 'You are not currently concentrating.',
      structured_values: concentration ? { active: true, label: concentration.label ?? concentration.source_action_id ?? null, known_duration: concentration.hidden_duration ? null : concentration.duration_label ?? null } : { active: false },
      dependency_snapshot: pickDependencies(context, ['concentration']),
    });
  },
  self_reactions_remaining(context, parameters) {
    return createAnswer({
      template_id: 'self.reactions_remaining',
      parameters,
      turn_id: context.parent_turn_id,
      concise_answer: context.reaction_state.active_window
        ? 'A reaction decision is currently available.'
        : context.reaction_state.available ? 'Your reaction is currently available.' : 'Your reaction is spent or unavailable.',
      structured_values: {
        reaction_available: context.reaction_state.available,
        active_reaction_window: Boolean(context.reaction_state.active_window),
        supported_reaction_types: context.reaction_state.supported_reaction_types,
      },
      dependency_snapshot: pickDependencies(context, ['reactions']),
    });
  },
});

function unavailableAnswer(templateId, context, parameters, message) {
  return createAnswer({
    template_id: templateId,
    parameters,
    turn_id: context.parent_turn_id,
    status: COMBAT_FOCUS_ANSWER_STATUSES.UNAVAILABLE,
    concise_answer: message,
    certainty: 'unavailable',
    structured_values: {},
    dependency_snapshot: pickDependencies(context, ['state']),
  });
}

function activeConcentration(context) {
  const actorId = context.actor_id;
  if (context.state.concentration && (context.state.concentration.participant_id === actorId || context.state.concentration.source_participant_id === actorId)) {
    return context.state.concentration.active === false ? null : context.state.concentration;
  }
  return asArray(context.state.concentrations).find((entry) =>
    entry.active !== false && (entry.participant_id === actorId || entry.source_participant_id === actorId)
  ) ?? null;
}

function reactionStateFor(state, actor) {
  const actorId = participantId(actor);
  const raw = state.reaction_resources?.[actorId] ?? asArray(state.reaction_resources).find?.((entry) => participantId(entry) === actorId);
  const activeWindow = asArray(state.reaction_windows).find((window) =>
    participantId(window.reactor_participant_id ?? window.participant_id) === actorId &&
    [REACTION_WINDOW_STATUSES.OPEN, 'open'].includes(window.status)
  ) ?? null;
  const byParticipant = {};
  for (const participant of asArray(state.participants)) {
    const id = participantId(participant);
    const entry = state.reaction_resources?.[id] ?? asArray(state.reaction_resources).find?.((resource) => participantId(resource) === id);
    byParticipant[id] = {
      available: entry?.reaction_available !== false && entry?.spent !== true,
      supported_reaction_types: asArray(entry?.supported_reaction_types),
    };
  }
  return {
    available: raw?.reaction_available !== false && raw?.spent !== true,
    supported_reaction_types: asArray(raw?.supported_reaction_types),
    active_window: activeWindow ? {
      reaction_window_id: activeWindow.reaction_window_id,
      status: activeWindow.status,
      options: asArray(activeWindow.options).map((option) => ({ reaction_id: option.reaction_id, label: option.player_label ?? option.reaction_id })),
    } : null,
    by_participant: byParticipant,
  };
}

export function buildCombatFocusContext(input = {}) {
  const state = normalizeState(input.state ?? input);
  const actor = input.actor ?? actorFor(state, input.actor_id ?? input.actorId);
  if (!actor) {
    throw new Error('Combat Focus requires a current actor.');
  }
  const movement = currentMovement(state);
  const reactionState = reactionStateFor(state, actor);
  let currentTurnReadModel = null;
  let decisionCategories = [];
  try {
    currentTurnReadModel = buildCurrentTurnReadModel(state);
    decisionCategories = listCurrentLegalDecisionCategories(state);
  } catch {
    currentTurnReadModel = null;
    decisionCategories = [];
  }
  const context = {
    contract_version: '6D.11',
    state,
    combat_id: state.combat.combat_id,
    encounter_id: cleanText(state.combat.encounter_id ?? state.encounter_id) || null,
    ruleset: state.combat.ruleset,
    actor,
    actor_id: participantId(actor),
    parent_turn_id: cleanText(state.parent_turn?.parent_turn_id),
    current_state_version: cleanText(state.parent_turn?.current_state_version ?? state.current_state_version ?? state.read_model_version),
    current_decision_state: cleanText(input.current_decision_state ?? state.current_decision_state ?? 'player_turn'),
    selected_action_id: cleanText(input.selected_action_id ?? input.selectedActionId ?? state.selected_action_id),
    selected_target_id: cleanText(input.selected_target_id ?? input.selectedTargetId ?? state.selected_target_id),
    selected_zone_id: cleanText(input.selected_zone_id ?? input.selectedZoneId ?? state.selected_zone_id),
    selected_route_id: cleanText(input.selected_route_id ?? input.selectedRouteId ?? state.selected_route_id),
    selected_object_id: cleanText(input.selected_object_id ?? input.selectedObjectId ?? state.selected_object_id),
    current_zone_id: participantZone(state, actor),
    movement,
    actor_capabilities: actorCapabilities(state, actor),
    reaction_state: reactionState,
    visible_participants: visibleParticipantsFor(state, actor),
    visible_initiative_order: asArray(state.participants)
      .filter((participant) => isVisibleToActor(state, actor, participant))
      .sort((left, right) => toInteger(left.initiative_position ?? left.turn_order, 999) - toInteger(right.initiative_position ?? right.turn_order, 999))
      .map((participant) => visibleParticipantRef(state, actor, participant)),
    visible_zones: asArray(state.spatial.zones).filter((zone) => zone.visible !== false && zone.hidden !== true).map((zone) => ({
      zone_id: zoneId(zone),
      label: cleanText(zone.player_label ?? zone.label ?? zoneId(zone)),
    })),
    visible_objects: visibleObjects({ state, actor, actor_id: participantId(actor), movement, reaction_state: reactionState }),
    decision_categories: decisionCategories,
    current_turn_read_model: currentTurnReadModel,
    recovery_state: Boolean(state.recovery_needed || state.parent_turn?.status === 'recovery_needed'),
  };
  return context;
}

function templateById(templateId) {
  return COMBAT_FOCUS_TEMPLATES.find((entry) => entry.template_id === cleanText(templateId)) ?? null;
}

function categoryById(categoryId) {
  return CATEGORY_DEFINITIONS.find((entry) => entry.category_id === cleanText(categoryId)) ?? null;
}

function tokens(text) {
  return normalizedKey(text).split(/[^a-z0-9]+/).filter((token) => token.length > 1);
}

function normalizeCombatFocusText(text) {
  return normalizedKey(text)
    .replace(/[?!.,;:]/g, ' ')
    .replace(/\b(opportunity attacks)\b/g, 'opportunity attack')
    .replace(/\b(aoo)\b/g, 'opportunity attack')
    .replace(/\b(enemy|foe|target)\b/g, 'enemy')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCombatFocusFreeText(text = '') {
  return {
    original_text: cleanText(text),
    normalized_text: normalizeCombatFocusText(text),
    tokens: tokens(text),
  };
}

function scoreTemplate(template, normalized) {
  const phraseHits = asArray(template.free_text_phrases).filter((phrase) => normalized.normalized_text.includes(normalizeCombatFocusText(phrase))).length;
  const canonicalTokens = new Set(tokens(template.canonical_question));
  const synonymTokens = new Set(asArray(template.synonyms).flatMap(tokens));
  const tokenHits = normalized.tokens.filter((token) => canonicalTokens.has(token) || synonymTokens.has(token)).length;
  const categoryHit = normalized.normalized_text.includes(template.category.replace(/_/g, ' ')) ? 1 : 0;
  return phraseHits * 8 + tokenHits + categoryHit * 2;
}

function resolveEntityChoices(context, template, normalized, explicitParameters = {}) {
  const parameters = { ...explicitParameters };
  const choices = {};
  if (template.required_parameters.includes('enemy_participant_id') && !parameters.enemy_participant_id) {
    const enemies = visibleEnemiesFor(context);
    const named = enemies.filter((enemy) => normalized.normalized_text.includes(normalizeCombatFocusText(enemy.display_name ?? enemy.participant_id)) || normalized.normalized_text.includes(normalizedKey(enemy.participant_id)));
    if (named.length === 1) {
      parameters.enemy_participant_id = named[0].participant_id;
    } else if (context.selected_target_id && enemies.some((enemy) => enemy.participant_id === context.selected_target_id)) {
      parameters.enemy_participant_id = context.selected_target_id;
    } else if (enemies.length === 1) {
      parameters.enemy_participant_id = enemies[0].participant_id;
    } else {
      choices.enemy_participant_id = enemies.map((enemy) => ({ value: enemy.participant_id, label: enemy.display_name }));
    }
  }
  if (template.required_parameters.includes('action_id') && !parameters.action_id) {
    const actions = asArray(context.state.actions);
    const named = actions.filter((action) => normalized.normalized_text.includes(normalizeCombatFocusText(action.player_label ?? action.action_id)) || normalized.normalized_text.includes(normalizedKey(action.action_id)));
    if (named.length === 1) {
      parameters.action_id = named[0].action_id;
    } else if (context.selected_action_id) {
      parameters.action_id = context.selected_action_id;
    } else {
      choices.action_id = actions.map((action) => ({ value: action.action_id, label: action.player_label ?? action.action_id })).slice(0, 5);
    }
  }
  if (template.required_parameters.includes('zone_id') && !parameters.zone_id) {
    const zones = context.visible_zones;
    const named = zones.filter((zone) => normalized.normalized_text.includes(normalizeCombatFocusText(zone.label)) || normalized.normalized_text.includes(normalizedKey(zone.zone_id)));
    if (named.length === 1) {
      parameters.zone_id = named[0].zone_id;
    } else if (context.selected_zone_id) {
      parameters.zone_id = context.selected_zone_id;
    } else {
      choices.zone_id = zones.map((zone) => ({ value: zone.zone_id, label: zone.label })).slice(0, 5);
    }
  }
  if (template.required_parameters.includes('object_id') && !parameters.object_id) {
    const objects = context.visible_objects;
    const named = objects.filter((object) => normalized.normalized_text.includes(normalizeCombatFocusText(object.label)) || normalized.normalized_text.includes(normalizedKey(object.object_id)));
    if (named.length === 1) {
      parameters.object_id = named[0].object_id;
    } else if (context.selected_object_id) {
      parameters.object_id = context.selected_object_id;
    } else {
      choices.object_id = objects.map((object) => ({ value: object.object_id, label: object.label })).slice(0, 5);
    }
  }
  return { parameters, choices };
}

export function matchCombatFocusFreeText(input = {}) {
  const context = input.context ?? buildCombatFocusContext(input);
  const normalized = normalizeCombatFocusFreeText(input.question ?? input.text ?? '');
  const explicitParameters = input.parameters ?? {};
  const scored = COMBAT_FOCUS_TEMPLATES
    .map((template) => ({ template, score: scoreTemplate(template, normalized) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.template.template_id.localeCompare(right.template.template_id));
  const nearestCategories = CATEGORY_DEFINITIONS.slice(0, 4).map((category) => ({
    category_id: category.category_id,
    player_label: category.player_label,
  }));
  if (scored.length === 0 || scored[0].score < 4) {
    return {
      status: COMBAT_FOCUS_MATCH_STATUSES.UNSUPPORTED,
      confidence: 0,
      safe_message: 'Combat Focus does not support that question yet.',
      nearest_categories: nearestCategories,
      gm_dev_trace: { normalized, scored_templates: scored.map((entry) => ({ template_id: entry.template.template_id, score: entry.score })) },
    };
  }
  const top = scored[0];
  const second = scored[1];
  const confidence = Math.min(0.99, top.score / 20);
  if (second && second.score >= top.score - 2) {
    return {
      status: COMBAT_FOCUS_MATCH_STATUSES.DISAMBIGUATION_REQUIRED,
      confidence,
      alternatives: scored.slice(0, 4).map((entry) => ({
        template_id: entry.template.template_id,
        canonical_question: entry.template.canonical_question,
        category: entry.template.category,
      })),
      gm_dev_trace: { normalized, selected_template_id: null, scored_templates: scored.map((entry) => ({ template_id: entry.template.template_id, score: entry.score })) },
    };
  }
  const entities = resolveEntityChoices(context, top.template, normalized, explicitParameters);
  const missingChoices = Object.entries(entities.choices).filter(([, values]) => values.length > 1);
  if (missingChoices.length > 0) {
    return {
      status: COMBAT_FOCUS_MATCH_STATUSES.PARAMETER_CHOICES_REQUIRED,
      confidence,
      template_id: top.template.template_id,
      canonical_question: top.template.canonical_question,
      parameter_choices: Object.fromEntries(missingChoices),
      gm_dev_trace: { normalized, selected_template_id: top.template.template_id, confidence, parameter_choices: entities.choices },
    };
  }
  return {
    status: COMBAT_FOCUS_MATCH_STATUSES.MATCHED,
    confidence,
    template_id: top.template.template_id,
    canonical_question: top.template.canonical_question,
    parameters: entities.parameters,
    gm_dev_trace: { normalized, selected_template_id: top.template.template_id, confidence, scored_templates: scored.map((entry) => ({ template_id: entry.template.template_id, score: entry.score })) },
  };
}

function pickDependencies(context, keys = []) {
  const snapshot = {};
  for (const key of keys) {
    if (key === 'state') snapshot.state = context.current_state_version;
    if (key === 'movement') snapshot.movement = context.movement;
    if (key === 'positions') snapshot.positions = context.visible_participants.map((entry) => ({ id: entry.participant_id, zone: entry.current_zone_id, proximity: entry.proximity }));
    if (key === 'routes') snapshot.routes = visibleTransitionsFrom(context).map((entry) => ({ id: entry.transition_id, blocked: entry.blocked === true, cost: entry.base_cost ?? entry.cost }));
    if (key === 'conditions') snapshot.conditions = [...visibleConditionsFor(context.state, context.actor), ...context.visible_participants.flatMap((entry) => entry.visible_conditions.map((condition) => ({ participant_id: entry.participant_id, condition_id: condition.condition_id })))];
    if (key === 'cover') snapshot.cover = context.visible_participants.map((entry) => ({ id: entry.participant_id, zone: entry.current_zone_id }));
    if (key === 'visibility') snapshot.visibility = context.visible_participants.map((entry) => entry.participant_id);
    if (key === 'selected_action') snapshot.selected_action_id = context.selected_action_id;
    if (key === 'selected_target') snapshot.selected_target_id = context.selected_target_id;
    if (key === 'selected_zone') snapshot.selected_zone_id = context.selected_zone_id;
    if (key === 'selected_object') snapshot.selected_object_id = context.selected_object_id;
    if (key === 'action_economy') snapshot.action_economy = context.state.parent_turn ? {
      action_spent: context.state.parent_turn.action_spent === true,
      bonus_action_spent: context.state.parent_turn.bonus_action_spent === true,
      object_interaction_spent: context.state.parent_turn.object_interaction_spent === true,
    } : {};
    if (key === 'resources') snapshot.resources = asArray(context.state.resources).map((resource) => ({ id: resource.resource_id, current: resource.current, tiers: resource.tiers }));
    if (key === 'targeting') snapshot.targeting = { participant_revision: context.state.participant_revision, faction_revision: context.state.faction_revision };
    if (key === 'factions') snapshot.factions = context.state.faction_revision ?? context.state.faction_relationships;
    if (key === 'reactions') snapshot.reactions = context.reaction_state;
    if (key === 'turn_effects') snapshot.turn_effects = asArray(context.state.turn_effects).map((entry) => entry.effect_id ?? entry.id);
    if (key === 'concentration') snapshot.concentration = activeConcentration(context);
    if (key === 'objects') snapshot.objects = visibleObjects(context);
    if (key === 'retreat') snapshot.retreat = visibleRetreatRoutes(context).map((entry) => ({ id: entry.transition_id, cost: entry.movement_cost, risks: entry.known_risks }));
  }
  snapshot.selected = {
    action_id: context.selected_action_id,
    target_id: context.selected_target_id,
    zone_id: context.selected_zone_id,
    route_id: context.selected_route_id,
    object_id: context.selected_object_id,
  };
  return snapshot;
}

function dependencyFingerprint(snapshot = {}) {
  return JSON.stringify(snapshot);
}

export function createAnswerValidityRecord(input = {}) {
  const snapshot = cloneSerializable(input.dependency_snapshot ?? input.dependencySnapshot ?? {});
  return {
    validity_scope: input.validity_scope ?? input.validityScope ?? COMBAT_FOCUS_VALIDITY_SCOPES.CURRENT_TURN,
    template_id: cleanText(input.template_id ?? input.templateId),
    parameters: cloneSerializable(input.parameters ?? {}),
    turn_id: cleanText(input.turn_id ?? input.turnId) || null,
    dependency_snapshot: snapshot,
    dependency_fingerprint: dependencyFingerprint(snapshot),
    valid: true,
  };
}

export function resolveStructuredCombatFocusQuestion(input = {}) {
  const context = input.context ?? buildCombatFocusContext(input);
  if (context.recovery_state) {
    return {
      status: COMBAT_FOCUS_ANSWER_STATUSES.UNAVAILABLE,
      player_safe_message: 'Combat needs review before tactical focus answers are available.',
      recovery: true,
      gm_dev_trace: { reason: 'recovery_needed_suppresses_tactical_focus' },
    };
  }
  const templateId = cleanText(input.template_id ?? input.templateId);
  const template = templateById(templateId);
  if (!template) {
    return {
      status: COMBAT_FOCUS_ANSWER_STATUSES.DECLINED,
      player_safe_message: 'Combat Focus does not support that question yet.',
      nearest_categories: CATEGORY_DEFINITIONS.slice(0, 4).map((entry) => ({ category_id: entry.category_id, player_label: entry.player_label })),
    };
  }
  const resolver = ANSWER_RESOLVERS[template.answer_resolver_id];
  if (!resolver) {
    return {
      status: COMBAT_FOCUS_ANSWER_STATUSES.DECLINED,
      player_safe_message: template.player_safe_unavailable_wording ?? 'That question is not available right now.',
    };
  }
  const answer = resolver(context, input.parameters ?? {});
  return {
    status: answer.status,
    answer,
    player_answer: projectCombatFocusAnswerForPlayer(answer),
    gm_dev_trace: buildCombatFocusGmDevTrace({
      context,
      template,
      answer,
      matching: input.matching,
    }),
  };
}

export function resolveCombatFocusQuestion(input = {}) {
  const context = input.context ?? buildCombatFocusContext(input);
  if (input.template_id || input.templateId) {
    return resolveStructuredCombatFocusQuestion({ ...input, context });
  }
  const match = matchCombatFocusFreeText({ ...input, context });
  if (match.status !== COMBAT_FOCUS_MATCH_STATUSES.MATCHED) {
    return {
      status: match.status,
      disambiguation: match.alternatives ?? null,
      parameter_choices: match.parameter_choices ?? null,
      player_safe_message: match.safe_message ?? 'Choose a structured Combat Focus question.',
      nearest_categories: match.nearest_categories ?? null,
      gm_dev_trace: match.gm_dev_trace,
    };
  }
  return resolveStructuredCombatFocusQuestion({
    context,
    template_id: match.template_id,
    parameters: match.parameters,
    matching: match,
  });
}

export function isCombatFocusAnswerValid(input = {}) {
  const answer = input.answer ?? input;
  const context = input.context ?? buildCombatFocusContext(input);
  const validity = answer.validity ?? {};
  if (!validity.valid) {
    return { valid: false, reason: 'answer_marked_invalid' };
  }
  if (validity.validity_scope === COMBAT_FOCUS_VALIDITY_SCOPES.CURRENT_TURN && validity.turn_id && validity.turn_id !== context.parent_turn_id) {
    return { valid: false, reason: 'turn_changed' };
  }
  if (context.state.parent_turn?.status === 'closed' || context.state.parent_turn?.turn_close_reason === 'end_turn') {
    return { valid: false, reason: 'turn_closed' };
  }
  const dependencyKeys = Object.keys(validity.dependency_snapshot ?? {}).filter((key) => key !== 'selected');
  const currentDependencySnapshot = pickDependencies(context, dependencyKeys);
  const currentDependencyFingerprint = dependencyFingerprint(currentDependencySnapshot);
  if (currentDependencyFingerprint !== validity.dependency_fingerprint) {
    return { valid: false, reason: 'dependency_changed' };
  }
  return { valid: true, reason: 'dependencies_valid' };
}

export function reuseCombatFocusAnswer(input = {}) {
  const context = input.context ?? buildCombatFocusContext(input);
  const templateId = cleanText(input.template_id ?? input.templateId);
  const parameters = JSON.stringify(input.parameters ?? {});
  const existing = asArray(input.answers ?? context.state.combat_focus_answers).find((answer) =>
    answer.template_id === templateId && JSON.stringify(answer.validity?.parameters ?? {}) === parameters
  );
  if (!existing) {
    return { reused: false, reason: 'no_matching_answer' };
  }
  const validity = isCombatFocusAnswerValid({ answer: existing, context });
  if (!validity.valid) {
    return { reused: false, reason: validity.reason, stale_answer: existing };
  }
  return {
    reused: true,
    answer: {
      ...cloneSerializable(existing),
      status: COMBAT_FOCUS_ANSWER_STATUSES.REUSED,
      reused_from_answer_id: existing.answer_id,
    },
    gm_dev_trace: { reused_answer_id: existing.answer_id, reason: validity.reason },
  };
}

export function invalidateStaleCombatFocusAnswers(input = {}) {
  const context = input.context ?? buildCombatFocusContext(input);
  return asArray(input.answers ?? context.state.combat_focus_answers).map((answer) => {
    const validity = isCombatFocusAnswerValid({ answer, context });
    return validity.valid ? answer : {
      ...cloneSerializable(answer),
      status: COMBAT_FOCUS_ANSWER_STATUSES.STALE,
      validity: { ...answer.validity, valid: false, invalidation_reason: validity.reason },
    };
  });
}

export function listCurrentTurnCombatFocusAnswers(input = {}) {
  const context = input.context ?? buildCombatFocusContext(input);
  return invalidateStaleCombatFocusAnswers({ context, answers: input.answers ?? context.state.combat_focus_answers })
    .filter((answer) => answer.validity?.turn_id === context.parent_turn_id && answer.status !== COMBAT_FOCUS_ANSWER_STATUSES.STALE)
    .map(projectCombatFocusAnswerForPlayer);
}

export function collapseCombatFocusAnswersAtEndTurn(input = {}) {
  const turnId = cleanText(input.turn_id ?? input.turnId ?? input.state?.parent_turn?.parent_turn_id);
  return asArray(input.answers ?? input.state?.combat_focus_answers).map((answer) =>
    answer.validity?.turn_id === turnId && answer.validity?.validity_scope !== 'persistent_audit'
      ? {
          ...cloneSerializable(answer),
          collapsed: true,
          status: COMBAT_FOCUS_ANSWER_STATUSES.STALE,
          validity: { ...answer.validity, valid: false, invalidation_reason: 'end_turn_collapsed' },
        }
      : answer
  );
}

function baseSuggestion(template, priority) {
  return {
    template_id: template.template_id,
    category: template.category,
    question: template.canonical_question,
    priority,
    related_template_ids: template.related_template_ids,
  };
}

export function buildPrioritizedCombatFocusSuggestions(input = {}) {
  const context = input.context ?? buildCombatFocusContext(input);
  if (context.recovery_state) {
    return {
      suggestions: [{
        template_id: 'recovery.review_state',
        category: 'recovery',
        question: 'Review the current recovery state.',
        priority: 1,
      }],
      grouped_categories: listCombatFocusQuestionGroups({ context, expanded_category_id: null }).groups,
    };
  }
  const suggestions = [];
  if (context.selected_target_id) {
    for (const id of ['enemy.legal_target_for_selected_action', 'enemy.opportunity_attack_if_move_away', 'enemy.cover']) {
      suggestions.push(baseSuggestion(templateById(id), suggestions.length + 1));
    }
  }
  if (context.selected_action_id) {
    for (const id of ['action.can_use_now', 'action.visible_legal_targets', 'action.affects_allies', 'action.break_concentration']) {
      suggestions.push(baseSuggestion(templateById(id), suggestions.length + 1));
    }
  }
  if (context.selected_zone_id) {
    for (const id of ['movement.can_move_to_zone', 'movement.cost', 'movement.route_risk']) {
      suggestions.push(baseSuggestion(templateById(id), suggestions.length + 1));
    }
  }
  for (const id of ['self.turn_resources_remaining', 'self.movement_remaining', 'retreat.possible', 'terrain.reachable_zones']) {
    if (!suggestions.some((entry) => entry.template_id === id)) {
      suggestions.push(baseSuggestion(templateById(id), suggestions.length + 1));
    }
  }
  return {
    suggestions: suggestions.filter(Boolean).slice(0, toInteger(input.limit, 6)),
    grouped_categories: listCombatFocusQuestionGroups({ context, expanded_category_id: input.expanded_category_id ?? input.expandedCategoryId }).groups,
  };
}

export function listCombatFocusQuestionGroups(input = {}) {
  const expanded = cleanText(input.expanded_category_id ?? input.expandedCategoryId);
  const groups = [...CATEGORY_DEFINITIONS]
    .sort((left, right) => left.priority - right.priority)
    .map((category) => {
      const templates = COMBAT_FOCUS_TEMPLATES.filter((template) => template.category === category.category_id);
      return {
        category_id: category.category_id,
        player_label: category.player_label,
        description: category.description,
        priority: category.priority,
        expanded: expanded === category.category_id,
        suggested_questions: templates.slice(0, expanded === category.category_id ? 8 : 2).map((template) => ({
          template_id: template.template_id,
          question: template.canonical_question,
        })),
        additional_question_count: expanded === category.category_id ? 0 : Math.max(templates.length - 2, 0),
      };
    });
  return { groups };
}

export function buildCombatFocusReadModel(input = {}) {
  const context = input.context ?? buildCombatFocusContext(input);
  const suggestions = buildPrioritizedCombatFocusSuggestions({ context, limit: input.limit ?? 6, expanded_category_id: input.expanded_category_id ?? input.expandedCategoryId });
  const readModel = {
    contract_version: '6D.11',
    combat_id: context.combat_id,
    status: context.recovery_state ? 'recovery_limited' : 'available',
    suggestions: suggestions.suggestions,
    groups: suggestions.grouped_categories,
    current_turn_answers: listCurrentTurnCombatFocusAnswers({ context, answers: input.answers ?? context.state.combat_focus_answers }),
    current_answer: input.current_answer ? projectCombatFocusAnswerForPlayer(input.current_answer) : null,
    disambiguation: input.disambiguation ?? null,
    stale_state: Boolean(input.stale_state ?? input.staleState),
    player_safe_message: context.recovery_state ? 'Combat Focus is limited while the combat state needs review.' : null,
  };
  assertNoCombatFocusPlayerHiddenData(readModel);
  return readModel;
}

export function projectCombatFocusAnswerForPlayer(answer = {}) {
  const projected = {
    answer_id: answer.answer_id,
    template_id: answer.template_id,
    category: answer.category,
    canonical_question: answer.canonical_question,
    status: answer.status,
    concise_answer: answer.concise_answer,
    certainty: answer.certainty,
    structured_values: cloneSerializable(answer.structured_values),
    supporting_detail: cloneSerializable(answer.supporting_detail),
    related_template_ids: cloneSerializable(answer.related_template_ids),
    reused_from_answer_id: answer.reused_from_answer_id ?? null,
    collapsed: answer.collapsed === true,
  };
  assertNoCombatFocusPlayerHiddenData(projected);
  return projected;
}

export function projectCombatFocusForPlayer(payload = {}) {
  const projected = {
    contract_version: payload.contract_version ?? '6D.11',
    status: payload.status,
    read_model: payload.read_model ?? null,
    answer: payload.answer ? projectCombatFocusAnswerForPlayer(payload.answer) : payload.player_answer ?? null,
    disambiguation: payload.disambiguation ?? null,
    parameter_choices: payload.parameter_choices ?? null,
    nearest_categories: payload.nearest_categories ?? null,
    player_safe_message: payload.player_safe_message ?? null,
  };
  assertNoCombatFocusPlayerHiddenData(projected);
  return projected;
}

export function buildCombatFocusGmDevTrace(input = {}) {
  return {
    contract_version: '6D.11',
    trace_kind: 'combat_focus',
    combat_id: input.context?.combat_id,
    actor_participant_id: input.context?.actor_id,
    template_id: input.template?.template_id ?? input.answer?.template_id,
    selected_template_id: input.matching?.template_id ?? input.template?.template_id ?? null,
    mapping_confidence: input.matching?.confidence ?? null,
    selected_resolver_id: input.template?.answer_resolver_id ?? null,
    dependency_declarations: input.template?.dependency_declarations ?? [],
    dependency_fingerprint: input.answer?.validity?.dependency_fingerprint ?? null,
    answer_id: input.answer?.answer_id ?? null,
    answer_status: input.answer?.status ?? null,
    visibility_filtering_notes: [
      'player_answer_omits_matcher_scores_dependency_fingerprints_and_trace',
      'answers_use_visible_or_rules_knowable_combat_state_only',
      ...(input.visibility_filtering_notes ?? []),
    ],
    matcher_trace: input.matching?.gm_dev_trace ?? null,
  };
}

export function assertNoCombatFocusPlayerHiddenData(payload = {}) {
  const text = JSON.stringify(payload);
  const leaked = PLAYER_PROHIBITED_KEYS.find((key) => text.includes(key));
  if (leaked) {
    throw new Error(`Combat Focus player payload contains hidden/internal data: ${leaked}`);
  }
  return true;
}

export function getCombatFocusTemplateRegistry() {
  return {
    contract_version: '6D.11',
    categories: cloneSerializable(CATEGORY_DEFINITIONS),
    templates: COMBAT_FOCUS_TEMPLATES.map((template) => ({
      template_id: template.template_id,
      category: template.category,
      canonical_question: template.canonical_question,
      required_parameters: template.required_parameters,
      optional_parameters: template.optional_parameters,
      answer_shape: template.answer_shape,
      related_template_ids: template.related_template_ids,
    })),
  };
}
