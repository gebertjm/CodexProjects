DELETE FROM account_ruleset
WHERE account_id IN (
  SELECT id FROM account WHERE email = 'dev@dailyrpg.local'
);

DELETE FROM account
WHERE email IN ('dev@dailyrpg.local', 'schema-test@example.com');

INSERT INTO account (
  email,
  phone_number,
  phone_number_normalized,
  display_name,
  first_name,
  last_name,
  password_hash,
  is_active,
  phone_number_verified_at,
  sms_opt_in_at,
  preferred_channel
)
VALUES (
  'dev@dailyrpg.local',
  '(555) 100-0001',
  '+15551000001',
  'DailyRPG Dev',
  'Dev',
  'Tester',
  'local-dev-only',
  TRUE,
  NOW(),
  NOW(),
  'sms'
);

INSERT INTO account_ruleset (account_id, ruleset_id)
SELECT a.id, r.id
FROM account a
JOIN ruleset r ON r.key = 'dnd5e'
WHERE a.email = 'dev@dailyrpg.local'
ON CONFLICT (account_id, ruleset_id) DO NOTHING;
