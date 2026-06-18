import { query, withTransaction } from '../config/db.js';
import { syncAdventureProgressionState } from '../services/adventureProgressionService.js';
import { actThroughPlayState, getPlayState } from '../services/adventureRuntimeService.js';
import { createHttpError } from '../utils/httpError.js';
import { DEFAULT_SMS_CAMPAIGN_ASSIGNMENT } from './smsCampaignConfig.js';
import {
  affordanceFromRuntimeAction,
  filterRuntimeActionsForSms,
  markAffordanceActionUsed,
} from './smsExplorationAffordanceService.js';
import { updateSmsSimulatorSession } from './smsMessageStore.js';

const INITIAL_KNOWLEDGE = Object.freeze([
  {
    knowledge_key: 'knows_grey_road_exists',
    title: 'The Grey Road',
    summary: 'The Grey Road connects villages and trade stops in the Greyvale Lowlands.',
  },
  {
    knowledge_key: 'knows_dunmere_nearby',
    title: 'Dunmere Nearby',
    summary: 'Dunmere is a nearby village along the road.',
  },
  {
    knowledge_key: 'knows_road_is_normal_trade_route',
    title: 'A Trade Road',
    summary: 'The road is normally used by travelers and trade.',
  },
  {
    knowledge_key: 'knows_character_is_traveling_region',
    title: 'Traveling the Lowlands',
    summary: 'You are traveling through the Greyvale Lowlands for your own reasons.',
  },
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function conciseOptionLabel(action) {
  const key = action?.key ?? action?.source?.key ?? '';
  const label = String(action?.label ?? 'Choose this').trim();

  if (key.includes('inspect-broken-caravan')) {
    return 'Inspect the caravan';
  }

  if (key.includes('check-for-survivors')) {
    return 'Search for survivors';
  }

  if (key.includes('examine-roadside-tracks')) {
    return 'Examine the tracks';
  }

  if (key.includes('leave-broken-caravan-for-inn')) {
    return 'Continue to the inn';
  }

  return label.replace(/^Head to the /i, 'Go to the ').slice(0, 48);
}

function actionPriority(action) {
  if (action.action_type === 'scene_interaction') {
    const key = action.key ?? '';
    if (key.includes('inspect-broken-caravan')) {
      return 1;
    }
    if (key.includes('check-for-survivors')) {
      return 2;
    }
    if (key.includes('examine-roadside-tracks')) {
      return 3;
    }
    return 4;
  }

  if (action.action_type === 'move_scene') {
    return 8;
  }

  if (action.action_type === 'talk_to_npc') {
    return 6;
  }

  return 10;
}

function resultTextFromActionResult(result) {
  const payload = result?.result ?? result;
  return (
    payload?.result?.result_summary ??
    payload?.result?.summary ??
    payload?.result?.outcome_summary ??
    payload?.result_summary ??
    payload?.summary ??
    payload?.outcome_summary ??
    payload?.narrative_text ??
    payload?.scene?.entry_text ??
    payload?.current_scene?.entry_text ??
    payload?.message ??
    null
  );
}

function statusTextFromSession(session) {
  const name = session.active_sms_character_name ?? 'Your character';
  const context = session.state?.current_context ?? 'your adventure is ready';
  const objective = session.state?.current_objective
    ? ` Current focus: ${session.state.current_objective}.`
    : '';

  return `${name} is ${context.charAt(0).toLowerCase()}${context.slice(1)}.${objective}`;
}

async function resolveStarterReferences(config, executor = { query }) {
  const result = await executor.query(
    `
      SELECT
        world.id AS world_id,
        world.slug AS world_slug,
        world.name AS world_name,
        region.id AS region_id,
        region.key AS region_key,
        location.id AS location_id,
        location.key AS location_key,
        location.name AS location_name,
        scene.id AS scene_id,
        scene.key AS scene_key,
        scene.name AS scene_name,
        scene.summary AS scene_summary,
        scene.entry_text AS scene_entry_text,
        campaign_package.id AS campaign_package_id,
        campaign_package.slug AS campaign_package_slug,
        campaign_package.name AS campaign_package_name,
        quest.id AS quest_id,
        quest.key AS quest_key,
        objective.id AS objective_id,
        objective.key AS objective_key,
        objective.title AS objective_title
      FROM dnd5e_world world
      JOIN dnd5e_region region
        ON region.world_id = world.id
       AND region.key = $3
      JOIN dnd5e_location location
        ON location.world_id = world.id
       AND location.key = $4
      JOIN dnd5e_scene scene
        ON scene.world_id = world.id
       AND scene.key = $5
      JOIN dnd5e_campaign campaign_package
        ON campaign_package.world_id = world.id
       AND campaign_package.slug = $2
      JOIN dnd5e_quest quest
        ON quest.key = $6
      JOIN dnd5e_quest_objective objective
        ON objective.quest_id = quest.id
       AND objective.key = $7
      WHERE world.slug = $1
      LIMIT 1
    `,
    [
      config.world_id,
      config.campaign_package_id,
      config.start_region_slug,
      config.start_location_slug,
      config.start_scene_slug,
      config.quest_slug,
      config.start_objective_slug,
    ]
  );

  return result.rows[0] ?? null;
}

async function loadCharacter(accountId, characterId, executor = { query }) {
  const result = await executor.query(
    `
      SELECT id, account_id, name, status, is_active, world_id
      FROM dnd5e_character
      WHERE id = $1
        AND account_id = $2
      FOR UPDATE
    `,
    [characterId, accountId]
  );

  return result.rows[0] ?? null;
}

async function loadActiveMembership(characterId, executor = { query }) {
  const result = await executor.query(
    `
      SELECT
        membership.id AS membership_id,
        membership.campaign_id,
        membership.character_id,
        membership.current_scene_id,
        campaign.world_id,
        campaign.slug AS campaign_slug,
        campaign.name AS campaign_name,
        campaign.status AS campaign_status,
        scene.key AS scene_key,
        scene.name AS scene_name,
        location.id AS location_id,
        location.key AS location_key,
        location.name AS location_name
      FROM dnd5e_campaign_character membership
      JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      LEFT JOIN dnd5e_scene scene ON scene.id = membership.current_scene_id
      LEFT JOIN dnd5e_location location ON location.id = scene.location_id
      WHERE membership.character_id = $1
        AND membership.is_active = TRUE
        AND membership.membership_status = 'active'
        AND membership.is_active_context = TRUE
        AND campaign.is_active = TRUE
      ORDER BY membership.updated_at DESC, membership.id DESC
      LIMIT 1
      FOR UPDATE OF membership
    `,
    [characterId]
  );

  return result.rows[0] ?? null;
}

async function createCampaignInstance({
  account,
  character,
  refs,
  config,
  executor,
}) {
  const slug = slugify(`sms-${character.id}-${config.campaign_package_id}`);
  const result = await executor.query(
    `
      INSERT INTO dnd5e_campaign (
        world_id,
        slug,
        name,
        campaign_type,
        status,
        description,
        created_by_account_id,
        is_active
      )
      VALUES ($1, $2, $3, 'questline', 'active', $4, $5, TRUE)
      ON CONFLICT (world_id, slug) DO UPDATE
      SET
        status = 'active',
        is_active = TRUE,
        updated_at = NOW()
      RETURNING id, slug, name
    `,
    [
      refs.world_id,
      slug,
      `${refs.campaign_package_name}: ${character.name}`,
      `SMS starter instance for ${character.name}. Strategy: ${config.instance_strategy}.`,
      account.id,
    ]
  );

  return result.rows[0];
}

async function initializeCampaignOverlays(campaignId, executor) {
  await executor.query(
    `
      INSERT INTO dnd5e_campaign_location_state (
        campaign_id,
        location_id,
        is_discovered,
        is_available,
        notes
      )
      SELECT campaign.id, location.id, TRUE, TRUE, 'SMS starter campaign location overlay.'
      FROM dnd5e_campaign campaign
      JOIN dnd5e_location location ON location.world_id = campaign.world_id
      WHERE campaign.id = $1
      ON CONFLICT (campaign_id, location_id) DO NOTHING
    `,
    [campaignId]
  );
  await executor.query(
    `
      INSERT INTO dnd5e_campaign_scene_state (
        campaign_id,
        scene_id,
        is_discovered,
        is_available,
        notes
      )
      SELECT campaign.id, scene.id, TRUE, TRUE, 'SMS starter campaign scene overlay.'
      FROM dnd5e_campaign campaign
      JOIN dnd5e_scene scene ON scene.world_id = campaign.world_id
      WHERE campaign.id = $1
      ON CONFLICT (campaign_id, scene_id) DO NOTHING
    `,
    [campaignId]
  );
}

async function upsertMembership({
  accountId,
  characterId,
  campaignId,
  sceneId,
  executor,
}) {
  await executor.query(
    `
      UPDATE dnd5e_campaign_character
      SET is_active_context = FALSE,
          updated_at = NOW()
      WHERE character_id = $1
        AND is_active_context = TRUE
    `,
    [characterId]
  );
  const result = await executor.query(
    `
      INSERT INTO dnd5e_campaign_character (
        campaign_id,
        character_id,
        joined_by_account_id,
        is_active,
        membership_status,
        is_active_context,
        is_default_solo_campaign,
        joined_at,
        current_scene_id,
        current_scene_entered_at
      )
      VALUES ($1, $2, $3, TRUE, 'active', TRUE, FALSE, NOW(), $4, NOW())
      ON CONFLICT (campaign_id, character_id) DO UPDATE
      SET is_active = TRUE,
          membership_status = 'active',
          is_active_context = TRUE,
          is_default_solo_campaign = FALSE,
          current_scene_id = COALESCE(dnd5e_campaign_character.current_scene_id, EXCLUDED.current_scene_id),
          current_scene_entered_at = COALESCE(dnd5e_campaign_character.current_scene_entered_at, EXCLUDED.current_scene_entered_at),
          updated_at = NOW()
      RETURNING id, current_scene_id
    `,
    [campaignId, characterId, accountId, sceneId]
  );

  return result.rows[0];
}

async function initializeKnowledge(campaignId, characterId, executor) {
  for (const fact of INITIAL_KNOWLEDGE) {
    await executor.query(
      `
        INSERT INTO dnd5e_character_knowledge (
          campaign_id,
          character_id,
          knowledge_type,
          knowledge_key,
          title,
          summary,
          metadata_json,
          source_type
        )
        VALUES ($1, $2, 'lore', $3, $4, $5, $6::jsonb, 'sms_campaign_intro')
        ON CONFLICT (campaign_id, character_id, knowledge_type, knowledge_key)
        DO UPDATE SET
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          metadata_json = EXCLUDED.metadata_json,
          source_type = EXCLUDED.source_type,
          updated_at = NOW()
      `,
      [
        campaignId,
        characterId,
        fact.knowledge_key,
        fact.title,
        fact.summary,
        JSON.stringify({
          initial_sms_context: true,
          hidden_truth: false,
        }),
      ]
    );
  }
}

async function logSystem(campaignId, characterId, accountId, message, data, executor) {
  await executor.query(
    `
      INSERT INTO dnd5e_campaign_log (
        campaign_id,
        character_id,
        actor_account_id,
        log_type,
        message,
        data_json
      )
      VALUES ($1, $2, $3, 'system', $4, $5::jsonb)
    `,
    [campaignId, characterId, accountId, message, JSON.stringify(data ?? {})]
  );
}

async function updateAccountForAssignment(account, assignment, executor) {
  const metadata = normalizeObject(account.sms_onboarding_metadata);
  const smsCampaign = normalizeObject(metadata.sms_campaign_assignment);
  await executor.query(
    `
      UPDATE account
      SET onboarding_state = 'active_play',
          onboarding_substate = NULL,
          active_character_id = $2,
          sms_onboarding_metadata = $3::jsonb,
          last_active_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [
      account.id,
      assignment.character_id,
      JSON.stringify({
        ...metadata,
        sms_campaign_assignment: {
          ...smsCampaign,
          assignment_result_type: assignment.result_type,
          campaign_instance_id: assignment.campaign_id,
          campaign_package_id: assignment.campaign_package_id,
          world_id: assignment.world_id,
          active_scene_id: assignment.active_scene_id,
          active_location_id: assignment.active_location_id,
          active_objective_id: assignment.active_objective_id,
          intro_started_at: smsCampaign.intro_started_at ?? nowIso(),
          intro_completed_at: smsCampaign.intro_completed_at ?? nowIso(),
          intro_fast_path_active: assignment.intro_fast_path_active,
          intro_fast_path_completed: false,
          normal_sms_pacing_active: false,
        },
        resume_pending: false,
      }),
    ]
  );
}

async function loadCurrentObjective(campaignId, characterId, executor) {
  const result = await executor.query(
    `
      SELECT
        objective.id,
        objective.key,
        objective.title,
        objective_state.status
      FROM dnd5e_character_objective objective_state
      JOIN dnd5e_quest_objective objective ON objective.id = objective_state.objective_id
      JOIN dnd5e_character_quest quest_state ON quest_state.id = objective_state.character_quest_id
      WHERE quest_state.campaign_id = $1
        AND quest_state.character_id = $2
        AND objective_state.status = 'active'
      ORDER BY objective.sort_order ASC, objective.id ASC
      LIMIT 1
    `,
    [campaignId, characterId]
  );

  return result.rows[0] ?? null;
}

async function buildPromptFromContent(refs, executor) {
  const interactionResult = await executor.query(
    `
      SELECT
        id,
        interaction_key,
        label,
        description,
        sort_order
      FROM dnd5e_scene_interaction
      WHERE scene_id = $1
        AND is_active = TRUE
      ORDER BY sort_order ASC, id ASC
    `,
    [refs.scene_id]
  );
  const transitionResult = await executor.query(
    `
      SELECT
        transition.id,
        transition.transition_key,
        transition.label,
        transition.description,
        transition.sort_order,
        to_scene.id AS to_scene_id,
        to_scene.key AS to_scene_key
      FROM dnd5e_scene_transition transition
      JOIN dnd5e_scene to_scene ON to_scene.id = transition.to_scene_id
      WHERE transition.from_scene_id = $1
        AND transition.is_active = TRUE
      ORDER BY transition.sort_order ASC, transition.id ASC
    `,
    [refs.scene_id]
  );
  const actions = [
    ...interactionResult.rows.map((row) => ({
      key: `scene_interaction:${row.interaction_key}`,
      action_type: 'scene_interaction',
      label: row.label,
      payload: {
        interaction_id: Number(row.id),
        interaction_key: row.interaction_key,
      },
    })),
    ...transitionResult.rows.map((row) => ({
      key: `move_scene:${row.transition_key}`,
      action_type: 'move_scene',
      label: row.label,
      payload: {
        transition_id: Number(row.id),
        transition_key: row.transition_key,
        scene_id: Number(row.to_scene_id),
        scene_key: row.to_scene_key,
      },
    })),
  ]
    .sort((left, right) => actionPriority(left) - actionPriority(right))
    .slice(0, 4)
    .map((action) => ({
      ...action,
      label: conciseOptionLabel(action),
    }));

  return {
    scene_description:
      'Ahead, a caravan leans broken in the mud. No voices. No horses.',
    options: actions,
  };
}

export async function validateDefaultSmsCampaignAssignment(config = DEFAULT_SMS_CAMPAIGN_ASSIGNMENT) {
  const refs = await resolveStarterReferences(config);
  return {
    ok: Boolean(refs),
    config,
    refs,
    errors: refs ? [] : ['Default SMS campaign assignment references could not be resolved.'],
  };
}

export async function assignSmsCampaignForAccount({
  account,
  characterId = account?.active_character_id,
  config = DEFAULT_SMS_CAMPAIGN_ASSIGNMENT,
  executor = { query },
} = {}) {
  if (!account?.id || !characterId) {
    return {
      result_type: 'assignment_failed',
      reason: 'missing_account_or_character',
    };
  }

  const character = await loadCharacter(account.id, characterId, executor);

  if (!character) {
    return {
      result_type: 'assignment_failed',
      reason: 'missing_character',
      character_id: characterId,
    };
  }

  if (character.status === 'dead') {
    return {
      result_type: 'character_dead',
      character_id: Number(character.id),
      character_name: character.name,
    };
  }

  if (character.status !== 'active' || character.is_active !== true) {
    return {
      result_type: 'assignment_failed',
      reason: 'character_not_finalized',
      character_id: Number(character.id),
      character_name: character.name,
    };
  }

  const existing = await loadActiveMembership(character.id, executor);

  if (existing) {
    const objective = await loadCurrentObjective(existing.campaign_id, character.id, executor);
    const prompt = existing.current_scene_id
      ? await buildPromptFromContent({ scene_id: existing.current_scene_id }, executor)
      : null;
    const assignment = {
      result_type: 'resumed_existing_campaign',
      character_id: Number(character.id),
      character_name: character.name,
      campaign_id: Number(existing.campaign_id),
      campaign_package_id: config.campaign_package_id,
      world_id: Number(existing.world_id),
      active_scene_id: existing.current_scene_id !== null ? Number(existing.current_scene_id) : null,
      active_scene_name: existing.scene_name,
      active_location_id: existing.location_id !== null ? Number(existing.location_id) : null,
      active_location_name: existing.location_name,
      active_objective_id: objective?.id !== undefined ? Number(objective.id) : null,
      active_objective_title: objective?.title ?? null,
      intro_fast_path_active: false,
      normal_sms_pacing_active: true,
      already_existed: true,
      prompt,
    };
    await updateAccountForAssignment(account, assignment, executor);
    return assignment;
  }

  const refs = await resolveStarterReferences(config, executor);

  if (!refs) {
    return {
      result_type: 'assignment_failed',
      reason: 'missing_default_campaign_references',
      character_id: Number(character.id),
      character_name: character.name,
    };
  }

  if (Number(character.world_id) !== Number(refs.world_id)) {
    await executor.query(
      `
        UPDATE dnd5e_character
        SET world_id = $1,
            updated_at = NOW()
        WHERE id = $2
          AND account_id = $3
      `,
      [refs.world_id, character.id, account.id]
    );
  }

  const campaign = await createCampaignInstance({
    account,
    character,
    refs,
    config,
    executor,
  });
  await initializeCampaignOverlays(campaign.id, executor);
  const membership = await upsertMembership({
    accountId: account.id,
    characterId: character.id,
    campaignId: campaign.id,
    sceneId: refs.scene_id,
    executor,
  });
  await initializeKnowledge(campaign.id, character.id, executor);
  await syncAdventureProgressionState(
    campaign.id,
    character.id,
    {
      actorAccountId: account.id,
      sourceType: 'sms_campaign_assignment',
    },
    executor
  );
  const objective = await loadCurrentObjective(campaign.id, character.id, executor);
  await logSystem(
    campaign.id,
    character.id,
    account.id,
    'SMS starter campaign assigned.',
    {
      strategy: config.instance_strategy,
      world_slug: refs.world_slug,
      campaign_package_slug: refs.campaign_package_slug,
      start_scene_slug: refs.scene_key,
    },
    executor
  );

  const assignment = {
    result_type: 'assigned_new_campaign',
    character_id: Number(character.id),
    character_name: character.name,
    campaign_id: Number(campaign.id),
    campaign_package_id: Number(refs.campaign_package_id),
    world_id: Number(refs.world_id),
    world_name: refs.world_name,
    campaign_name: campaign.name,
    active_scene_id: Number(refs.scene_id),
    active_scene_name: refs.scene_name,
    active_location_id: Number(refs.location_id),
    active_location_name: refs.location_name,
    active_objective_id: objective?.id !== undefined ? Number(objective.id) : Number(refs.objective_id),
    active_objective_title: objective?.title ?? refs.objective_title,
    membership_id: Number(membership.id),
    intro_fast_path_active: config.intro_fast_path === true,
    normal_sms_pacing_active: false,
    prompt: await buildPromptFromContent(refs, executor),
  };
  await updateAccountForAssignment(account, assignment, executor);

  return assignment;
}

export async function assignSmsCampaignTransactional(input = {}) {
  return withTransaction((client) =>
    assignSmsCampaignForAccount({
      ...input,
      executor: client,
    })
  );
}

export async function buildSmsPromptFromRuntime(playState, context = {}) {
  const rawActions = normalizeArray(playState?.available_actions)
    .filter((action) =>
      ['scene_interaction', 'move_scene', 'talk_to_npc', 'start_combat', 'choose_event_option'].includes(
        action.action_type
      )
    )
    .sort((left, right) => actionPriority(left) - actionPriority(right))
    .slice(0, 4)
    .map((action) => ({
      ...action,
      label: conciseOptionLabel(action),
    }));
  const filtered = await filterRuntimeActionsForSms({
    campaignId: context.campaignId ?? playState?.identity?.campaign_id,
    characterId: context.characterId ?? playState?.identity?.character_id,
    sceneId:
      context.sceneId ??
      playState?.play_state?.current_scene_id ??
      playState?.current_scene?.id ??
      playState?.context?.scene?.id,
    actions: rawActions,
  });
  const sceneText =
    playState?.context?.scene?.text?.sms ??
    playState?.context?.scene?.entry_text ??
    playState?.context_summary?.summary ??
    playState?.current_scene?.summary ??
    'The adventure waits for your next move.';

  return {
    scene_description: sceneText,
    options: filtered.actions,
    affordances: filtered.affordances,
    prompt_mode: 'narrative_first',
    guidance_level: 'minimal',
    include_action_hints: false,
    include_numbered_options: false,
    allow_freeform_actions: true,
  };
}

export async function buildRuntimeSmsPrompt(campaignId, characterId) {
  const playState = await getPlayState(campaignId, characterId, 'player');
  return {
    playState,
    prompt: await buildSmsPromptFromRuntime(playState, { campaignId, characterId }),
  };
}

export function syncCampaignSessionState(session, assignment, prompt = assignment?.prompt) {
  if (!session?.session_id || !assignment || !assignment.campaign_id) {
    return session;
  }

  const promptOptions = normalizeArray(prompt?.options);
  const promptAffordances = normalizeArray(prompt?.affordances).length > 0
    ? normalizeArray(prompt.affordances)
    : promptOptions.map((action) => affordanceFromRuntimeAction(action));
  return updateSmsSimulatorSession(session.session_id, {
    campaign_id: String(assignment.campaign_id),
    active_sms_character_id: String(assignment.character_id),
    active_sms_character_name: assignment.character_name ?? session.active_sms_character_name,
    character_status: 'active',
    state: {
      onboarding_state: 'active_play',
      onboarding_substate: null,
      campaign_instance_id: assignment.campaign_id,
      world_id: assignment.world_id,
      active_scene_id: assignment.active_scene_id,
      active_location_id: assignment.active_location_id,
      active_objective_id: assignment.active_objective_id,
      current_scene: assignment.active_scene_name ?? session.state.current_scene,
      current_context:
        prompt?.scene_description ??
        `at ${assignment.active_scene_name ?? 'the start of the adventure'}`,
      current_objective: assignment.active_objective_title ?? session.state.current_objective,
      current_options: promptOptions,
      active_affordances: promptAffordances,
      prompt_mode: assignment.intro_fast_path_active ? 'numbered_options' : prompt?.prompt_mode ?? 'narrative_first',
      guidance_level: assignment.intro_fast_path_active ? 'tutorial' : prompt?.guidance_level ?? 'minimal',
      include_action_hints: assignment.intro_fast_path_active,
      include_numbered_options: assignment.intro_fast_path_active,
      active_thread: assignment.intro_fast_path_active ? 'intro_fast_path' : 'exploration',
      action_window: null,
      allow_free_text: true,
      intro_fast_path_active: assignment.intro_fast_path_active === true,
      intro_fast_path_completed: false,
      normal_sms_pacing_active: assignment.normal_sms_pacing_active === true,
      assignment_result_type: assignment.result_type,
    },
  });
}

export async function executeSmsRuntimeAction(session, selectedOption, stateOverrides = {}) {
  const campaignId = normalizeId(session?.campaign_id);
  const characterId = normalizeId(session?.active_sms_character_id);

  if (!campaignId || !characterId || !selectedOption?.key) {
    throw createHttpError('SMS runtime action is missing campaign, character, or option context', 400);
  }

  const result = await actThroughPlayState(
    campaignId,
    characterId,
    {
      ...(selectedOption.payload ?? {}),
      action_key: selectedOption.key,
      actor_account_id: normalizeId(session.account_id ?? session.state?.account_id),
    },
    'player'
  );
  await markAffordanceActionUsed({
    campaignId,
    characterId,
    sceneId: session.state?.active_scene_id ?? result.play_state?.play_state?.current_scene_id,
    action: selectedOption,
  });
  const prompt = await buildSmsPromptFromRuntime(result.play_state, { campaignId, characterId });
  const tutorialInteractionsCompleted = Number(session.state?.tutorial_interactions_completed ?? 0) + 1;
  const nextGuidanceLevel = stateOverrides.guidance_level ?? prompt.guidance_level;
  const accountId = normalizeId(session.account_id ?? session.state?.account_id);

  if (accountId) {
    await query(
      `
        UPDATE account
        SET sms_onboarding_metadata = sms_onboarding_metadata || $2::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        accountId,
        JSON.stringify({
          sms_guidance: {
            campaign_instance_id: campaignId,
            character_id: characterId,
            guidance_level: nextGuidanceLevel,
            tutorial_interactions_completed: tutorialInteractionsCompleted,
            last_guidance_at: nowIso(),
          },
        }),
      ]
    );
  }

  const updated = updateSmsSimulatorSession(session.session_id, {
    state: {
      current_context: prompt.scene_description,
      current_scene: result.play_state?.context?.scene?.name ?? session.state.current_scene,
      current_objective:
        result.play_state?.current_objective?.title ??
        result.play_state?.play_state?.current_objective?.title ??
        session.state.current_objective,
      active_scene_id:
        result.play_state?.play_state?.current_scene_id ?? session.state.active_scene_id,
      active_objective_id:
        result.play_state?.play_state?.current_objective_id ?? session.state.active_objective_id,
      current_options: prompt.options,
      active_affordances: normalizeArray(prompt.affordances),
      prompt_mode: prompt.prompt_mode,
      guidance_level: nextGuidanceLevel,
      include_action_hints: prompt.include_action_hints,
      include_numbered_options: prompt.include_numbered_options,
      tutorial_interactions_completed: tutorialInteractionsCompleted,
      active_thread: 'exploration',
      action_window: null,
      selected_opportunity_id: selectedOption.key,
      ...stateOverrides,
    },
  });

  return {
    result,
    result_text: resultTextFromActionResult(result),
    prompt,
    session: updated,
  };
}

export async function executeIntroFastPathAction(session, selectedOption) {
  return executeSmsRuntimeAction(session, selectedOption, {
    intro_fast_path_active: false,
    intro_fast_path_completed: true,
    normal_sms_pacing_active: true,
  });
}

export function buildCampaignStatusText(session) {
  return statusTextFromSession(session);
}
