BEGIN;

UPDATE dnd5e_dialogue_outcome outcome
SET
  effects_json = jsonb_set(
    outcome.effects_json,
    '{character_flags}',
    COALESCE(outcome.effects_json -> 'character_flags', '{}'::jsonb) || '{"rowan_trust":true}'::jsonb,
    TRUE
  ),
  updated_at = NOW()
FROM dnd5e_dialogue_option option_row
JOIN dnd5e_dialogue_node node ON node.id = option_row.node_id
JOIN dnd5e_dialogue dialogue ON dialogue.id = node.dialogue_id
WHERE outcome.option_id = option_row.id
  AND dialogue.dialogue_key = 'elder_rowan_counsel'
  AND outcome.outcome_key IN (
    'immediate_promise_succeeds',
    'measured_help_succeeds',
    'final_appeal_succeeds'
  );

COMMIT;
