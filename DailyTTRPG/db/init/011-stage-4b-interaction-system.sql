BEGIN;

ALTER TABLE dnd5e_campaign_log
  DROP CONSTRAINT IF EXISTS dnd5e_campaign_log_type_check;

ALTER TABLE dnd5e_campaign_log
  ADD CONSTRAINT dnd5e_campaign_log_type_check CHECK (
    log_type IN (
      'character_joined',
      'scene_entered',
      'scene_moved',
      'interaction_attempted',
      'flag_changed',
      'quest_updated',
      'objective_updated',
      'npc_state_changed',
      'dialogue_started',
      'dialogue_choice',
      'dialogue_ended',
      'system'
    )
  );

CREATE TABLE IF NOT EXISTS dnd5e_dialogue (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  npc_id BIGINT REFERENCES dnd5e_npc(id) ON DELETE SET NULL,
  dialogue_key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  summary TEXT,
  description TEXT,
  trigger_type VARCHAR(50) NOT NULL DEFAULT 'player',
  trigger_event VARCHAR(50) NOT NULL DEFAULT 'npc_talk',
  sort_order INTEGER NOT NULL DEFAULT 0,
  availability_conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_repeatable BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_dialogue_key_present_check CHECK (btrim(dialogue_key) <> ''),
  CONSTRAINT dnd5e_dialogue_name_present_check CHECK (btrim(name) <> ''),
  CONSTRAINT dnd5e_dialogue_trigger_type_check CHECK (
    trigger_type IN ('player', 'system')
  ),
  CONSTRAINT dnd5e_dialogue_trigger_event_check CHECK (
    trigger_event IN ('npc_talk', 'scene_enter', 'system')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_node (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dialogue_id BIGINT NOT NULL REFERENCES dnd5e_dialogue(id) ON DELETE CASCADE,
  speaker_npc_id BIGINT REFERENCES dnd5e_npc(id) ON DELETE SET NULL,
  node_key VARCHAR(100) NOT NULL,
  title VARCHAR(150),
  speaker_type VARCHAR(50) NOT NULL DEFAULT 'npc',
  text_content TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_entry_node BOOLEAN NOT NULL DEFAULT FALSE,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
  availability_conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  entry_effects_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dialogue_id, node_key),
  CONSTRAINT dnd5e_dialogue_node_key_present_check CHECK (btrim(node_key) <> ''),
  CONSTRAINT dnd5e_dialogue_node_text_present_check CHECK (btrim(text_content) <> ''),
  CONSTRAINT dnd5e_dialogue_node_speaker_type_check CHECK (
    speaker_type IN ('npc', 'narrator', 'system')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_option (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  node_id BIGINT NOT NULL REFERENCES dnd5e_dialogue_node(id) ON DELETE CASCADE,
  option_key VARCHAR(100) NOT NULL,
  label VARCHAR(150) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  availability_conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  check_mode VARCHAR(50) NOT NULL DEFAULT 'none',
  skill_id BIGINT REFERENCES dnd5e_skill(id) ON DELETE RESTRICT,
  difficulty_class INTEGER,
  check_visibility VARCHAR(50) NOT NULL DEFAULT 'visible',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (node_id, option_key),
  CONSTRAINT dnd5e_dialogue_option_key_present_check CHECK (btrim(option_key) <> ''),
  CONSTRAINT dnd5e_dialogue_option_label_present_check CHECK (btrim(label) <> ''),
  CONSTRAINT dnd5e_dialogue_option_check_mode_check CHECK (
    check_mode IN ('none', 'explicit', 'implicit')
  ),
  CONSTRAINT dnd5e_dialogue_option_check_visibility_check CHECK (
    check_visibility IN ('visible', 'hidden')
  ),
  CONSTRAINT dnd5e_dialogue_option_skill_requirement_check CHECK (
    (check_mode = 'none' AND skill_id IS NULL AND difficulty_class IS NULL)
    OR
    (check_mode IN ('explicit', 'implicit') AND skill_id IS NOT NULL AND difficulty_class IS NOT NULL AND difficulty_class >= 1)
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_outcome (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  option_id BIGINT NOT NULL REFERENCES dnd5e_dialogue_option(id) ON DELETE CASCADE,
  next_node_id BIGINT REFERENCES dnd5e_dialogue_node(id) ON DELETE SET NULL,
  outcome_key VARCHAR(100) NOT NULL,
  label VARCHAR(150),
  sort_order INTEGER NOT NULL DEFAULT 0,
  conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  effects_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_text TEXT,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (option_id, outcome_key),
  CONSTRAINT dnd5e_dialogue_outcome_key_present_check CHECK (btrim(outcome_key) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_session (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  dialogue_id BIGINT NOT NULL REFERENCES dnd5e_dialogue(id) ON DELETE CASCADE,
  npc_id BIGINT REFERENCES dnd5e_npc(id) ON DELETE SET NULL,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  started_by_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  ended_by_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_dialogue_session_status_check CHECK (
    status IN ('active', 'completed', 'canceled')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_session_state (
  dialogue_session_id BIGINT PRIMARY KEY REFERENCES dnd5e_dialogue_session(id) ON DELETE CASCADE,
  current_node_id BIGINT NOT NULL REFERENCES dnd5e_dialogue_node(id) ON DELETE RESTRICT,
  pending_option_id BIGINT REFERENCES dnd5e_dialogue_option(id) ON DELETE SET NULL,
  session_memory_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  visited_node_keys_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  choice_history_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_session_visit (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dialogue_session_id BIGINT NOT NULL REFERENCES dnd5e_dialogue_session(id) ON DELETE CASCADE,
  node_id BIGINT NOT NULL REFERENCES dnd5e_dialogue_node(id) ON DELETE RESTRICT,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_session_choice (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dialogue_session_id BIGINT NOT NULL REFERENCES dnd5e_dialogue_session(id) ON DELETE CASCADE,
  node_id BIGINT NOT NULL REFERENCES dnd5e_dialogue_node(id) ON DELETE RESTRICT,
  option_id BIGINT NOT NULL REFERENCES dnd5e_dialogue_option(id) ON DELETE RESTRICT,
  outcome_id BIGINT REFERENCES dnd5e_dialogue_outcome(id) ON DELETE SET NULL,
  actor_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  check_mode VARCHAR(50) NOT NULL DEFAULT 'none',
  skill_id BIGINT REFERENCES dnd5e_skill(id) ON DELETE RESTRICT,
  difficulty_class INTEGER,
  check_visibility VARCHAR(50),
  roll_value INTEGER,
  skill_modifier INTEGER,
  total_value INTEGER,
  margin_value INTEGER,
  was_success BOOLEAN,
  result_summary TEXT,
  applied_effects_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_dialogue_session_choice_check_mode_check CHECK (
    check_mode IN ('none', 'explicit', 'implicit')
  ),
  CONSTRAINT dnd5e_dialogue_session_choice_visibility_check CHECK (
    check_visibility IS NULL OR check_visibility IN ('visible', 'hidden')
  ),
  CONSTRAINT dnd5e_dialogue_session_choice_roll_value_check CHECK (
    roll_value IS NULL OR (roll_value >= 1 AND roll_value <= 20)
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_node_entry
  ON dnd5e_dialogue_node(dialogue_id, is_entry_node, sort_order, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_dialogue_session_active_character
  ON dnd5e_dialogue_session(campaign_id, character_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_scene_trigger
  ON dnd5e_dialogue(scene_id, trigger_type, trigger_event, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_node_dialogue_id
  ON dnd5e_dialogue_node(dialogue_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_option_node_id
  ON dnd5e_dialogue_option(node_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_outcome_option_id
  ON dnd5e_dialogue_outcome(option_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_session_character_created_at
  ON dnd5e_dialogue_session(character_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_session_visit_session_id
  ON dnd5e_dialogue_session_visit(dialogue_session_id, entered_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_session_choice_session_id
  ON dnd5e_dialogue_session_choice(dialogue_session_id, created_at ASC, id ASC);

INSERT INTO dnd5e_dialogue (
  scene_id,
  npc_id,
  dialogue_key,
  name,
  summary,
  description,
  trigger_type,
  trigger_event,
  sort_order,
  availability_conditions_json,
  is_repeatable
)
SELECT
  scene.id,
  npc.id,
  'elder_rowan_counsel',
  'Elder Rowan''s Counsel',
  'A cautious conversation that can become trust, suspicion, or practical guidance.',
  'Elder Rowan weighs whether this traveler is worth trusting with Willowmere''s troubles.',
  'player',
  'npc_talk',
  1,
  '{}'::jsonb,
  TRUE
FROM dnd5e_scene scene
JOIN dnd5e_npc npc ON npc.key = 'elder_rowan'
WHERE scene.key = 'willowmere_square'
ON CONFLICT (dialogue_key) DO NOTHING;

INSERT INTO dnd5e_dialogue (
  scene_id,
  npc_id,
  dialogue_key,
  name,
  summary,
  description,
  trigger_type,
  trigger_event,
  sort_order,
  availability_conditions_json,
  is_repeatable
)
SELECT
  scene.id,
  NULL,
  'waystone_echo',
  'Waystone Echo',
  'A system-triggered moment as the waystone hums to life around the character.',
  'The road itself seems to speak when a character reaches the old standing stones.',
  'system',
  'scene_enter',
  1,
  '{"required_campaign_flags":{"waystone_story_started":true}}'::jsonb,
  TRUE
FROM dnd5e_scene scene
WHERE scene.key = 'waystone_road'
ON CONFLICT (dialogue_key) DO NOTHING;

INSERT INTO dnd5e_dialogue_node (
  dialogue_id,
  speaker_npc_id,
  node_key,
  title,
  speaker_type,
  text_content,
  sort_order,
  is_entry_node,
  is_terminal,
  availability_conditions_json,
  entry_effects_json
)
SELECT
  dialogue.id,
  speaker.speaker_npc_id,
  node_data.node_key,
  node_data.title,
  node_data.speaker_type,
  node_data.text_content,
  node_data.sort_order,
  node_data.is_entry_node,
  node_data.is_terminal,
  node_data.availability_conditions_json,
  node_data.entry_effects_json
FROM dnd5e_dialogue dialogue
LEFT JOIN dnd5e_npc elder_rowan ON elder_rowan.key = 'elder_rowan'
JOIN (
  VALUES
    (
      'elder_rowan_counsel',
      'rowan_opening',
      'A guarded welcome',
      'npc',
      'Elder Rowan watches you over the broken waystone. "Willowmere has little patience for idle promises. Speak plainly."',
      1,
      TRUE,
      FALSE,
      '{"forbidden_character_flags":{"rowan_dialogue_trustful":true}}'::jsonb,
      '{}'::jsonb
    ),
    (
      'elder_rowan_counsel',
      'rowan_returning_ally',
      'An earned audience',
      'npc',
      'Rowan inclines his head as you approach. "You''ve already done more than most strangers. What do you need?"',
      2,
      TRUE,
      FALSE,
      '{"required_character_flags":{"rowan_dialogue_trustful":true}}'::jsonb,
      '{}'::jsonb
    ),
    (
      'elder_rowan_counsel',
      'rowan_concern',
      'The real concern',
      'npc',
      'Rowan glances toward the road. "The waystones are waking. If you mean to help, then listen first."',
      3,
      FALSE,
      FALSE,
      '{}'::jsonb,
      '{"session_flags":{"heard_waystone_warning":true}}'::jsonb
    ),
    (
      'elder_rowan_counsel',
      'rowan_accepts_help',
      'Trust, at last',
      'npc',
      'Rowan exhales and finally nods. "Then take the road and see what stirred the stones. Come back with truth, not bravado."',
      4,
      FALSE,
      FALSE,
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      'elder_rowan_counsel',
      'rowan_wary',
      'Still unconvinced',
      'npc',
      'Rowan folds his arms. "Fine words. I need proof before I stake Willowmere on them."',
      5,
      FALSE,
      FALSE,
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      'elder_rowan_counsel',
      'rowan_conversation_end',
      'The conversation closes',
      'npc',
      'Rowan gives a short nod and turns his attention back to the square.',
      6,
      FALSE,
      TRUE,
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      'waystone_echo',
      'waystone_echo_opening',
      'The stones remember',
      'narrator',
      'As you step onto Waystone Road, the standing stones hum around you. A pattern at the edge of your vision begs to be understood.',
      1,
      TRUE,
      FALSE,
      '{}'::jsonb,
      '{"session_flags":{"waystone_echo_started":true}}'::jsonb
    ),
    (
      'waystone_echo',
      'waystone_echo_success',
      'The glyphs resolve',
      'narrator',
      'The glyphs sharpen into a warning: the stones answer to will, not blood. The pattern fixes itself in your memory.',
      2,
      FALSE,
      TRUE,
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      'waystone_echo',
      'waystone_echo_failure',
      'The whisper slips away',
      'narrator',
      'The hum fades before you can grasp it. You are left with only a headache and the certainty that something almost answered you.',
      3,
      FALSE,
      TRUE,
      '{}'::jsonb,
      '{}'::jsonb
    )
) AS node_data (
  dialogue_key,
  node_key,
  title,
  speaker_type,
  text_content,
  sort_order,
  is_entry_node,
  is_terminal,
  availability_conditions_json,
  entry_effects_json
) ON node_data.dialogue_key = dialogue.dialogue_key
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN node_data.speaker_type = 'npc' THEN elder_rowan.id
      ELSE NULL
    END AS speaker_npc_id
) speaker
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_dialogue_node existing
  WHERE existing.dialogue_id = dialogue.id
    AND existing.node_key = node_data.node_key
);

INSERT INTO dnd5e_dialogue_option (
  node_id,
  option_key,
  label,
  description,
  sort_order,
  availability_conditions_json,
  check_mode,
  skill_id,
  difficulty_class,
  check_visibility
)
SELECT
  node.id,
  option_data.option_key,
  option_data.label,
  option_data.description,
  option_data.sort_order,
  option_data.availability_conditions_json,
  option_data.check_mode,
  skill.id,
  option_data.difficulty_class,
  option_data.check_visibility
FROM dnd5e_dialogue_node node
JOIN dnd5e_dialogue dialogue ON dialogue.id = node.dialogue_id
JOIN (
  VALUES
    (
      'elder_rowan_counsel',
      'rowan_opening',
      'ask_whats_wrong',
      'Ask what has Rowan so worried',
      'Let Rowan explain what has changed in Willowmere.',
      1,
      '{}'::jsonb,
      'none',
      NULL,
      NULL,
      'visible'
    ),
    (
      'elder_rowan_counsel',
      'rowan_opening',
      'offer_help_immediately',
      'Offer help immediately',
      'Promise Rowan that you can handle the trouble even before you know the details.',
      2,
      '{}'::jsonb,
      'explicit',
      'persuasion',
      14,
      'visible'
    ),
    (
      'elder_rowan_counsel',
      'rowan_opening',
      'leave_conversation',
      'Leave for now',
      'Step away from Rowan without pressing the issue.',
      3,
      '{}'::jsonb,
      'none',
      NULL,
      NULL,
      'visible'
    ),
    (
      'elder_rowan_counsel',
      'rowan_concern',
      'offer_help_after_listening',
      'Offer help after listening',
      'Use what Rowan just revealed to make a more grounded appeal.',
      1,
      '{"required_session_flags":{"heard_waystone_warning":true}}'::jsonb,
      'explicit',
      'persuasion',
      12,
      'visible'
    ),
    (
      'elder_rowan_counsel',
      'rowan_concern',
      'leave_conversation',
      'Say you need time',
      'End the conversation without making a promise yet.',
      2,
      '{}'::jsonb,
      'none',
      NULL,
      NULL,
      'visible'
    ),
    (
      'elder_rowan_counsel',
      'rowan_accepts_help',
      'thank_rowan',
      'Thank Rowan and leave',
      'Take the guidance and prepare to head for the road.',
      1,
      '{}'::jsonb,
      'none',
      NULL,
      NULL,
      'visible'
    ),
    (
      'elder_rowan_counsel',
      'rowan_wary',
      'ask_for_one_more_chance',
      'Ask for one more chance',
      'Appeal to Rowan once more, this time with the full weight of what you have heard.',
      1,
      '{"required_session_flags":{"heard_waystone_warning":true}}'::jsonb,
      'explicit',
      'persuasion',
      10,
      'visible'
    ),
    (
      'elder_rowan_counsel',
      'rowan_wary',
      'leave_conversation',
      'Back away',
      'Accept that Rowan is not persuaded yet.',
      2,
      '{}'::jsonb,
      'none',
      NULL,
      NULL,
      'visible'
    ),
    (
      'elder_rowan_counsel',
      'rowan_returning_ally',
      'ask_about_road',
      'Ask about the waystone road',
      'Let Rowan restate what he knows now that he trusts you.',
      1,
      '{}'::jsonb,
      'none',
      NULL,
      NULL,
      'visible'
    ),
    (
      'elder_rowan_counsel',
      'rowan_returning_ally',
      'leave_conversation',
      'Leave Rowan to the square',
      'End the conversation politely.',
      2,
      '{}'::jsonb,
      'none',
      NULL,
      NULL,
      'visible'
    ),
    (
      'waystone_echo',
      'waystone_echo_opening',
      'study_the_glyphs',
      'Study the humming glyphs',
      'Lean into the strange pattern and try to make sense of it.',
      1,
      '{}'::jsonb,
      'implicit',
      'investigation',
      11,
      'hidden'
    ),
    (
      'waystone_echo',
      'waystone_echo_opening',
      'step_back',
      'Step back from the stones',
      'Retreat before the strange humming can get under your skin.',
      2,
      '{}'::jsonb,
      'none',
      NULL,
      NULL,
      'visible'
    )
) AS option_data (
  dialogue_key,
  node_key,
  option_key,
  label,
  description,
  sort_order,
  availability_conditions_json,
  check_mode,
  skill_slug,
  difficulty_class,
  check_visibility
) ON option_data.dialogue_key = dialogue.dialogue_key
   AND option_data.node_key = node.node_key
LEFT JOIN dnd5e_skill skill ON skill.slug = option_data.skill_slug
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_dialogue_option existing
  WHERE existing.node_id = node.id
    AND existing.option_key = option_data.option_key
);

INSERT INTO dnd5e_dialogue_outcome (
  option_id,
  next_node_id,
  outcome_key,
  label,
  sort_order,
  conditions_json,
  effects_json,
  result_text,
  is_terminal
)
SELECT
  option_row.id,
  next_node.id,
  outcome_data.outcome_key,
  outcome_data.label,
  outcome_data.sort_order,
  outcome_data.conditions_json,
  outcome_data.effects_json,
  outcome_data.result_text,
  outcome_data.is_terminal
FROM dnd5e_dialogue_option option_row
JOIN dnd5e_dialogue_node node ON node.id = option_row.node_id
JOIN dnd5e_dialogue dialogue ON dialogue.id = node.dialogue_id
JOIN (
  VALUES
    (
      'elder_rowan_counsel',
      'rowan_opening',
      'ask_whats_wrong',
      'share_the_concern',
      'Rowan explains the trouble',
      1,
      '{}'::jsonb,
      '{"session_flags":{"heard_waystone_warning":true}}'::jsonb,
      'Rowan studies you, then glances toward the road. "The waystones have started humming again. That should not be possible."',
      FALSE,
      'rowan_concern'
    ),
    (
      'elder_rowan_counsel',
      'rowan_opening',
      'offer_help_immediately',
      'immediate_promise_succeeds',
      'A promise Rowan believes',
      1,
      '{"requires_success":true}'::jsonb,
      '{
        "campaign_flags":{"waystone_story_started":true},
        "character_flags":{"rowan_dialogue_trustful":true},
        "npc_states":[{"npc_key":"elder_rowan","disposition":"friendly","notes":"Rowan trusts the character after their dialogue."}],
        "quests":[{"quest_key":"waystone_whispers","status":"active"}],
        "objectives":[
          {"quest_key":"waystone_whispers","objective_key":"earn_rowan_trust","status":"completed","progress_count":1},
          {"quest_key":"waystone_whispers","objective_key":"investigate_waystone","status":"active","progress_count":0}
        ],
        "xp":20,
        "session_flags":{"rowan_trust_earned":true}
      }'::jsonb,
      'Something in your certainty lands. Rowan finally nods, deciding you may actually be worth the risk.',
      FALSE,
      'rowan_accepts_help'
    ),
    (
      'elder_rowan_counsel',
      'rowan_opening',
      'offer_help_immediately',
      'immediate_promise_fails',
      'Rowan is not convinced',
      2,
      '{"requires_success":false}'::jsonb,
      '{
        "campaign_flags":{"waystone_story_started":true},
        "character_flags":{"rowan_dialogue_rebuffed":true},
        "npc_states":[{"npc_key":"elder_rowan","disposition":"neutral","notes":"Rowan remains wary after an overeager promise."}],
        "quests":[{"quest_key":"waystone_whispers","status":"active"}],
        "objectives":[{"quest_key":"waystone_whispers","objective_key":"earn_rowan_trust","status":"active","progress_count":0}],
        "xp":5
      }'::jsonb,
      'Rowan does not flinch. "Anyone can promise help. Few can survive the road."',
      FALSE,
      'rowan_wary'
    ),
    (
      'elder_rowan_counsel',
      'rowan_opening',
      'leave_conversation',
      'leave_early',
      'You step away',
      1,
      '{}'::jsonb,
      '{}'::jsonb,
      'You leave Rowan to the square before the conversation can deepen.',
      TRUE,
      'rowan_conversation_end'
    ),
    (
      'elder_rowan_counsel',
      'rowan_concern',
      'offer_help_after_listening',
      'measured_help_succeeds',
      'Rowan accepts the offer',
      1,
      '{"requires_success":true}'::jsonb,
      '{
        "campaign_flags":{"waystone_story_started":true},
        "character_flags":{"rowan_dialogue_trustful":true},
        "npc_states":[{"npc_key":"elder_rowan","disposition":"friendly","notes":"Rowan trusts the character after hearing them out."}],
        "quests":[{"quest_key":"waystone_whispers","status":"active"}],
        "objectives":[
          {"quest_key":"waystone_whispers","objective_key":"earn_rowan_trust","status":"completed","progress_count":1},
          {"quest_key":"waystone_whispers","objective_key":"investigate_waystone","status":"active","progress_count":0}
        ],
        "xp":25,
        "session_flags":{"rowan_trust_earned":true}
      }'::jsonb,
      'Because you listened first, Rowan hears conviction instead of boasting. He trusts you with the road ahead.',
      FALSE,
      'rowan_accepts_help'
    ),
    (
      'elder_rowan_counsel',
      'rowan_concern',
      'offer_help_after_listening',
      'measured_help_fails',
      'Caution wins out',
      2,
      '{"requires_success":false}'::jsonb,
      '{
        "campaign_flags":{"waystone_story_started":true},
        "character_flags":{"rowan_dialogue_rebuffed":true},
        "npc_states":[{"npc_key":"elder_rowan","disposition":"neutral","notes":"Rowan hears the offer but is not persuaded."}],
        "quests":[{"quest_key":"waystone_whispers","status":"active"}],
        "objectives":[{"quest_key":"waystone_whispers","objective_key":"earn_rowan_trust","status":"active","progress_count":0}],
        "xp":5
      }'::jsonb,
      'Rowan''s expression softens, but not enough. "Maybe later. I still need proof."',
      FALSE,
      'rowan_wary'
    ),
    (
      'elder_rowan_counsel',
      'rowan_concern',
      'leave_conversation',
      'leave_after_hearing',
      'You withdraw politely',
      1,
      '{}'::jsonb,
      '{"session_flags":{"rowan_left_after_warning":true}}'::jsonb,
      'You leave with Rowan''s warning still ringing in your ears.',
      TRUE,
      'rowan_conversation_end'
    ),
    (
      'elder_rowan_counsel',
      'rowan_accepts_help',
      'thank_rowan',
      'accept_the_guidance',
      'You accept Rowan''s guidance',
      1,
      '{}'::jsonb,
      '{"session_flags":{"rowan_guidance_taken":true}}'::jsonb,
      'You thank Rowan and turn toward the old road.',
      TRUE,
      'rowan_conversation_end'
    ),
    (
      'elder_rowan_counsel',
      'rowan_wary',
      'ask_for_one_more_chance',
      'final_appeal_succeeds',
      'Rowan relents',
      1,
      '{"requires_success":true}'::jsonb,
      '{
        "campaign_flags":{"waystone_story_started":true},
        "character_flags":{"rowan_dialogue_trustful":true},
        "npc_states":[{"npc_key":"elder_rowan","disposition":"friendly","notes":"A final measured appeal earns Rowan''s trust."}],
        "quests":[{"quest_key":"waystone_whispers","status":"active"}],
        "objectives":[
          {"quest_key":"waystone_whispers","objective_key":"earn_rowan_trust","status":"completed","progress_count":1},
          {"quest_key":"waystone_whispers","objective_key":"investigate_waystone","status":"active","progress_count":0}
        ],
        "xp":15,
        "session_flags":{"rowan_trust_earned":true}
      }'::jsonb,
      'Your last appeal lands. Rowan gives you the chance he denied a moment ago.',
      FALSE,
      'rowan_accepts_help'
    ),
    (
      'elder_rowan_counsel',
      'rowan_wary',
      'ask_for_one_more_chance',
      'final_appeal_fails',
      'The window closes',
      2,
      '{"requires_success":false}'::jsonb,
      '{
        "character_flags":{"rowan_dialogue_rebuffed":true},
        "session_flags":{"rowan_refused_final_appeal":true}
      }'::jsonb,
      'Rowan''s patience runs out. The conversation is over for now.',
      TRUE,
      'rowan_conversation_end'
    ),
    (
      'elder_rowan_counsel',
      'rowan_wary',
      'leave_conversation',
      'leave_wary',
      'You leave Rowan unconvinced',
      1,
      '{}'::jsonb,
      '{}'::jsonb,
      'You step back and leave Rowan to his doubts.',
      TRUE,
      'rowan_conversation_end'
    ),
    (
      'elder_rowan_counsel',
      'rowan_returning_ally',
      'ask_about_road',
      'road_is_repeated',
      'Rowan repeats his warning',
      1,
      '{}'::jsonb,
      '{"session_flags":{"rowan_guidance_repeated":true}}'::jsonb,
      'Rowan repeats the essentials: trust the stone only when the hum settles, and return with proof.',
      TRUE,
      'rowan_conversation_end'
    ),
    (
      'elder_rowan_counsel',
      'rowan_returning_ally',
      'leave_conversation',
      'leave_ally',
      'You leave as an ally',
      1,
      '{}'::jsonb,
      '{}'::jsonb,
      'Rowan lets you go with a brief, approving nod.',
      TRUE,
      'rowan_conversation_end'
    ),
    (
      'waystone_echo',
      'waystone_echo_opening',
      'study_the_glyphs',
      'waystone_insight',
      'The glyphs answer',
      1,
      '{"requires_success":true}'::jsonb,
      '{
        "campaign_flags":{"waystone_echo_seen":true,"waystone_glyphs_understood":true},
        "character_flags":{"waystone_clue_found":true},
        "quests":[{"quest_key":"waystone_whispers","status":"completed"}],
        "objectives":[{"quest_key":"waystone_whispers","objective_key":"investigate_waystone","status":"completed","progress_count":1}],
        "xp":20
      }'::jsonb,
      'The waystone''s whisper resolves into meaning, and the road feels less empty for a heartbeat.',
      TRUE,
      'waystone_echo_success'
    ),
    (
      'waystone_echo',
      'waystone_echo_opening',
      'study_the_glyphs',
      'waystone_misses_you',
      'The whisper escapes',
      2,
      '{"requires_success":false}'::jsonb,
      '{
        "campaign_flags":{"waystone_echo_seen":true},
        "character_flags":{"waystone_clue_found":false},
        "objectives":[{"quest_key":"waystone_whispers","objective_key":"investigate_waystone","status":"active","progress_count":0}],
        "xp":5
      }'::jsonb,
      'You almost catch the pattern, but it slips away before it becomes language.',
      TRUE,
      'waystone_echo_failure'
    ),
    (
      'waystone_echo',
      'waystone_echo_opening',
      'step_back',
      'avoid_the_echo',
      'You back away',
      1,
      '{}'::jsonb,
      '{"campaign_flags":{"waystone_echo_seen":true}}'::jsonb,
      'You step back from the stones before the humming can deepen.',
      TRUE,
      'waystone_echo_failure'
    )
) AS outcome_data (
  dialogue_key,
  node_key,
  option_key,
  outcome_key,
  label,
  sort_order,
  conditions_json,
  effects_json,
  result_text,
  is_terminal,
  next_node_key
) ON outcome_data.dialogue_key = dialogue.dialogue_key
   AND outcome_data.node_key = node.node_key
   AND outcome_data.option_key = option_row.option_key
LEFT JOIN dnd5e_dialogue_node next_node
  ON next_node.dialogue_id = dialogue.id
 AND next_node.node_key = outcome_data.next_node_key
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_dialogue_outcome existing
  WHERE existing.option_id = option_row.id
    AND existing.outcome_key = outcome_data.outcome_key
);

COMMIT;
