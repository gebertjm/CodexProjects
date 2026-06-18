BEGIN;

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS can_advance_beats BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE dnd5e_action_window
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_started_at TIMESTAMPTZ;

ALTER TABLE dnd5e_action_window
  DROP CONSTRAINT IF EXISTS dnd5e_action_window_status_check;

ALTER TABLE dnd5e_action_window
  ADD CONSTRAINT dnd5e_action_window_status_check CHECK (
    status IN (
      'pending_prompt',
      'open',
      'closing',
      'closed',
      'resolving',
      'resolved',
      'expired',
      'canceled',
      'cancelled'
    )
  );

ALTER TABLE dnd5e_character_default_action_policy
  ALTER COLUMN response_timeout_seconds SET DEFAULT 86400;

UPDATE dnd5e_character_default_action_policy
SET
  response_timeout_seconds = 86400,
  notes = COALESCE(notes, '') || CASE
    WHEN COALESCE(notes, '') LIKE '%Stage 6B.5 beat-window migration%'
      THEN ''
    ELSE ' Stage 6B.5 beat-window migration: async web windows now remain open until scheduled/manual resolution.'
  END,
  updated_at = NOW()
WHERE response_timeout_seconds = 300
  AND (
    notes IS NULL
    OR notes LIKE '%Stage 4E default policy%'
    OR notes LIKE '%Auto-seeded%'
  );

UPDATE dnd5e_action_window
SET
  expires_at = NOW() + INTERVAL '1 day',
  resolution_summary = COALESCE(resolution_summary, '') || CASE
    WHEN COALESCE(resolution_summary, '') LIKE '%Stage 6B.5 beat-window migration%'
      THEN ''
    ELSE ' Stage 6B.5 beat-window migration: repaired legacy short web action window.'
  END,
  updated_at = NOW()
WHERE status = 'open'
  AND expires_at IS NOT NULL
  AND expires_at <= opens_at + INTERVAL '10 minutes';

CREATE INDEX IF NOT EXISTS idx_account_can_advance_beats
  ON account(can_advance_beats)
  WHERE can_advance_beats = TRUE;

COMMIT;
