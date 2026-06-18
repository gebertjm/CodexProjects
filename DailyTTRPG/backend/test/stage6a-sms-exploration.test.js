import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { listActionVerbs, resolveActionVerb } from '../src/sms/smsActionVerbRegistry.js';
import {
  affordanceFromRuntimeAction,
  buildActiveAffordancesFromActions,
  ensureSmsExplorationSchema,
  markAffordanceActionUsed,
  validateAffordanceDefinition,
} from '../src/sms/smsExplorationAffordanceService.js';
import { resolveSmsExplorationIntent } from '../src/sms/smsIntentResolver.js';
import { resetSmsMessageStoreForTests } from '../src/sms/smsMessageStore.js';

let server;
let baseUrl;
let phoneCounter = 9100;

test.before(async () => {
  await ensureSmsExplorationSchema();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test.beforeEach(() => {
  resetSmsMessageStoreForTests();
});

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function nextPhone() {
  phoneCounter += 1;
  return `+1555091${String(phoneCounter).slice(-4)}`;
}

async function createFreshSession() {
  const created = await request('/api/dev/sms-simulator/create-fresh-session', {
    method: 'POST',
    body: JSON.stringify({
      phone_number: nextPhone(),
      user_id: `sms_explore_${phoneCounter}`,
    }),
  });

  assert.equal(created.response.status, 200);
  return created.body.session;
}

async function inbound(sessionId, message) {
  const result = await request('/api/dev/sms-simulator/inbound', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, message }),
  });

  assert.equal(result.response.status, 200);
  return result.body;
}

async function messages(sessionId) {
  const result = await request(`/api/dev/sms-simulator/messages/${sessionId}`);
  assert.equal(result.response.status, 200);
  return result.body.messages ?? [];
}

async function persistence(sessionId) {
  const result = await request(`/api/dev/sms-simulator/persistence/${sessionId}`);
  assert.equal(result.response.status, 200);
  return result.body;
}

async function debug(sessionId) {
  const result = await request(`/api/dev/sms-simulator/debug/${sessionId}`);
  assert.equal(result.response.status, 200);
  return result.body;
}

async function completeQuickStart(sessionId) {
  await inbound(sessionId, 'hello');
  await inbound(sessionId, 'START');
  await inbound(sessionId, 'continue');
  await inbound(sessionId, '1');
  await inbound(sessionId, 'Aric');
  await inbound(sessionId, 'Human');
  await inbound(sessionId, 'Fighter');
  await inbound(sessionId, '1');
}

function outbound(thread) {
  return thread.filter((message) => message.direction === 'outbound');
}

test('Stage 6A.5b action verb registry resolves universal aliases without scene-specific logic', () => {
  const verbs = listActionVerbs();
  const verbIds = new Set(verbs.map((verb) => verb.id));

  for (const id of ['observe', 'investigate', 'search', 'track', 'talk', 'move', 'use', 'help', 'wait']) {
    assert.ok(verbIds.has(id));
  }

  assert.equal(resolveActionVerb('look around')?.id, 'observe');
  assert.equal(resolveActionVerb('inspect')?.id, 'investigate');
  assert.equal(resolveActionVerb('examine')?.id, 'investigate');
  assert.equal(resolveActionVerb('follow')?.id, 'track');
  assert.equal(resolveActionVerb('ask')?.id, 'talk');
  assert.equal(resolveActionVerb('go')?.id, 'move');
  assert.equal(resolveActionVerb('florbulate'), null);
});

test('Stage 6A.5b affordance schema validation and repeat-state filtering are generic', async () => {
  assert.equal(
    validateAffordanceDefinition({
      id: 'caravan_wreck',
      label: 'broken caravan',
      aliases: ['wagon'],
      available_actions: [
        { verb: 'investigate', action_key: 'scene_interaction:inspect-broken-caravan', repeat_policy: 'once' },
      ],
      adds_affordances: ['strange_tracks'],
      removes_affordances: [],
    }).ok,
    true
  );
  assert.equal(validateAffordanceDefinition({ label: 'bad', available_actions: [] }).ok, false);
  assert.equal(
    validateAffordanceDefinition({
      id: 'bad',
      label: 'bad',
      available_actions: [{ verb: 'dance', action_key: 'x', repeat_policy: 'once' }],
    }).ok,
    false
  );
  assert.equal(
    validateAffordanceDefinition({
      id: 'secret',
      label: 'Whispering Presence clue',
      available_actions: [{ verb: 'observe', action_key: 'x', repeat_policy: 'once' }],
    }).ok,
    false
  );

  const world = await query("SELECT id FROM dnd5e_world WHERE slug IN ('greyvale', 'daily-rpg-prime') ORDER BY slug = 'greyvale' DESC LIMIT 1");
  assert.ok(world.rows[0]?.id);
  const campaignSlug = `stage-6a5b-affordance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const campaign = await query(
    `
      INSERT INTO dnd5e_campaign (world_id, name, slug, campaign_type, status, is_active)
      VALUES ($1, $2, $3, 'solo', 'active', TRUE)
      RETURNING id
    `,
    [world.rows[0].id, 'Stage 6A.5b Affordance Test', campaignSlug]
  );
  const character = await query('SELECT id FROM dnd5e_character WHERE status = $1 LIMIT 1', ['active']);
  const scene = await query("SELECT id FROM dnd5e_scene WHERE key = 'broken-caravan-site' LIMIT 1");
  assert.ok(campaign.rows[0]?.id);
  assert.ok(character.rows[0]?.id);
  assert.ok(scene.rows[0]?.id);

  const uniqueKey = `test-once-affordance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const action = {
    key: `scene_interaction:${uniqueKey}`,
    action_type: 'scene_interaction',
    label: 'Inspect test wreckage',
    payload: { interaction_key: uniqueKey },
    source: { type: 'scene_interaction', key: uniqueKey },
  };
  const before = await buildActiveAffordancesFromActions({
    campaignId: campaign.rows[0].id,
    characterId: character.rows[0].id,
    sceneId: scene.rows[0].id,
    actions: [action],
  });
  assert.equal(before.length, 1);
  assert.equal(before[0].available_actions[0].verb, 'investigate');

  await markAffordanceActionUsed({
    campaignId: campaign.rows[0].id,
    characterId: character.rows[0].id,
    sceneId: scene.rows[0].id,
    action,
  });
  const after = await buildActiveAffordancesFromActions({
    campaignId: campaign.rows[0].id,
    characterId: character.rows[0].id,
    sceneId: scene.rows[0].id,
    actions: [action],
  });
  assert.equal(after.length, 0);
});

test('Stage 6A.5b deterministic intent resolver maps freeform text to active affordances and clarifies ambiguity', async () => {
  const actions = [
    {
      key: 'scene_interaction:inspect-broken-caravan',
      action_type: 'scene_interaction',
      label: 'Inspect the broken caravan',
      payload: { interaction_key: 'inspect-broken-caravan' },
      source: { type: 'scene_interaction', key: 'inspect-broken-caravan' },
    },
    {
      key: 'scene_interaction:examine-roadside-tracks',
      action_type: 'scene_interaction',
      label: 'Examine the roadside tracks',
      payload: { interaction_key: 'examine-roadside-tracks' },
      source: { type: 'scene_interaction', key: 'examine-roadside-tracks' },
    },
    {
      key: 'talk_to_npc:tomas-rell',
      action_type: 'talk_to_npc',
      label: 'Talk to Tomas Rell',
      payload: { npc_key: 'tomas-rell' },
      source: { type: 'npc', key: 'tomas-rell', name: 'Tomas Rell' },
    },
    {
      key: 'talk_to_npc:elin-harrow',
      action_type: 'talk_to_npc',
      label: 'Talk to Elin Harrow',
      payload: { npc_key: 'elin-harrow' },
      source: { type: 'npc', key: 'elin-harrow', name: 'Elin Harrow' },
    },
  ];
  const affordances = actions.map(affordanceFromRuntimeAction);

  assert.equal(
    (await resolveSmsExplorationIntent({ userText: 'inspect the wagon', affordances, log: false }))
      .chosen_candidate.action_key,
    'scene_interaction:inspect-broken-caravan'
  );
  assert.equal(
    (await resolveSmsExplorationIntent({ userText: 'check the caravan', affordances, log: false }))
      .chosen_candidate.verb,
    'investigate'
  );
  assert.equal(
    (await resolveSmsExplorationIntent({ userText: 'follow the tracks', affordances, log: false }))
      .chosen_candidate.action_key,
    'scene_interaction:examine-roadside-tracks'
  );
  assert.equal(
    (await resolveSmsExplorationIntent({ userText: 'talk to tomas', affordances, log: false }))
      .chosen_candidate.action_key,
    'talk_to_npc:tomas-rell'
  );
  const ambiguous = await resolveSmsExplorationIntent({ userText: 'talk', affordances, log: false });
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.clarification.options.length, 2);
  assert.equal(
    (await resolveSmsExplorationIntent({
      userText: 'inspect hidden wagon',
      affordances: affordances.map((affordance) =>
        affordance.affordance_key.includes('inspect-broken') ? { ...affordance, state: 'hidden' } : affordance
      ),
      log: false,
    })).status,
    'invalid'
  );
});

test('Stage 6A.5b simulator accepts freeform exploration, renders narrative-first output, and hides exhausted actions', async () => {
  const session = await createFreshSession();
  await completeQuickStart(session.session_id);

  const submitted = await inbound(session.session_id, 'inspect the wagon');
  assert.equal(submitted.outbound_message, null);
  assert.equal(submitted.suppressed, true);

  let state = await debug(session.session_id);
  assert.equal(state.last_intent_resolver_status, 'resolved');
  assert.equal(state.resolved_verb, 'investigate');
  assert.match(state.resolved_target_affordance, /inspect-broken-caravan/);

  const advanced = await request('/api/dev/sms-simulator/advance-next-beat', {
    method: 'POST',
    body: JSON.stringify({ session_id: session.session_id }),
  });
  assert.equal(advanced.response.status, 200);
  assert.equal(advanced.body.success, true);
  assert.equal(advanced.body.created_next_prompt, true);

  const thread = await messages(session.session_id);
  const lastOutbound = outbound(thread).at(-1);
  assert.equal(lastOutbound.template_id, 'gameplay.exploration_narrative');
  assert.doesNotMatch(lastOutbound.rendered_text, /\n1\)/);
  assert.match(lastOutbound.rendered_text, /caravan|wreckage|struggle|looting|attacked/i);

  state = await debug(session.session_id);
  assert.equal(state.prompt_mode, 'narrative_first');
  assert.equal(state.guidance_level, 'minimal');
  assert.ok(!state.active_affordances.some((affordance) =>
    String(affordance.affordance_key).includes('inspect-broken-caravan')
  ));

  const persisted = await persistence(session.session_id);
  assert.equal(persisted.affordance_state.resolved_count >= 1, true);
  assert.equal(persisted.intent_resolution.external_ai_used, false);

  const repeated = await inbound(session.session_id, 'inspect the caravan');
  assert.equal(repeated.outbound_message.template_id, 'input.no_match');
});

test('Stage 6A.5b freeform tracking still resolves through runtime and logs intent context', async () => {
  const session = await createFreshSession();
  await completeQuickStart(session.session_id);
  await inbound(session.session_id, 'inspect the caravan');
  await request('/api/dev/sms-simulator/advance-next-beat', {
    method: 'POST',
    body: JSON.stringify({ session_id: session.session_id }),
  });

  const track = await inbound(session.session_id, 'follow the tracks');
  assert.equal(track.outbound_message, null);
  assert.equal(track.suppressed, true);
  const state = await debug(session.session_id);
  assert.equal(state.last_intent_resolver_status, 'resolved');
  assert.equal(state.resolved_verb, 'track');
  assert.match(state.resolved_target_affordance, /examine-roadside-tracks/);

  const logs = await query(
    `
      SELECT resolver_status, candidates_json, external_ai_used
      FROM dnd5e_sms_intent_resolution_log
      WHERE session_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [session.session_id]
  );
  assert.equal(logs.rowCount, 1);
  assert.equal(logs.rows[0].resolver_status, 'resolved');
  assert.equal(logs.rows[0].external_ai_used, false);
  assert.ok(logs.rows[0].candidates_json.length >= 1);
});

test('Stage 6A.5b HELP carries natural-action guidance and compliance language', async () => {
  const session = await createFreshSession();
  const help = await inbound(session.session_id, 'HELP');

  assert.equal(help.outbound_message.template_id, 'sms.help');
  assert.match(help.outbound_message.rendered_text, /look around/i);
  assert.match(help.outbound_message.rendered_text, /talk to the innkeeper/i);
  assert.match(help.outbound_message.rendered_text, /STOP/i);
  assert.match(help.outbound_message.rendered_text, /Msg freq varies/i);
  assert.match(help.outbound_message.rendered_text, /Msg & data rates may apply/i);
});
