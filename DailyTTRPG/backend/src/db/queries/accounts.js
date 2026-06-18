export const insertAccountQuery = `
  INSERT INTO account (
    email,
    phone_number,
    phone_number_normalized,
    display_name,
    first_name,
    last_name,
    phone_number_verified_at,
    sms_opt_in_at,
    sms_opt_out_at,
    preferred_channel
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  RETURNING
    id,
    email,
    phone_number,
    phone_number_normalized,
    display_name,
    first_name,
    last_name,
    preferred_channel,
    phone_number_verified_at,
    sms_opt_in_at,
    sms_opt_out_at,
    active_character_id,
    is_active,
    created_at,
    updated_at;
`;

export const selectAccountByIdQuery = `
  SELECT
    id,
    email,
    phone_number,
    phone_number_normalized,
    display_name,
    first_name,
    last_name,
    preferred_channel,
    phone_number_verified_at,
    sms_opt_in_at,
    sms_opt_out_at,
    active_character_id,
    is_active,
    created_at,
    updated_at
  FROM account
  WHERE id = $1;
`;

export const selectAccountByIdForUpdateQuery = `
  SELECT
    id,
    email,
    phone_number,
    phone_number_normalized,
    display_name,
    first_name,
    last_name,
    preferred_channel,
    phone_number_verified_at,
    sms_opt_in_at,
    sms_opt_out_at,
    active_character_id,
    is_active,
    created_at,
    updated_at
  FROM account
  WHERE id = $1
  FOR UPDATE;
`;

export const updateAccountActiveCharacterQuery = `
  UPDATE account
  SET
    active_character_id = $2,
    updated_at = NOW()
  WHERE id = $1
  RETURNING
    id,
    email,
    phone_number,
    phone_number_normalized,
    display_name,
    first_name,
    last_name,
    preferred_channel,
    phone_number_verified_at,
    sms_opt_in_at,
    sms_opt_out_at,
    active_character_id,
    is_active,
    created_at,
    updated_at;
`;

export const selectAccountCharactersQuery = `
  SELECT
    ch.id,
    ch.name,
    ch.level,
    ch.is_active,
    race.name AS race_name,
    class.name AS class_name,
    background.name AS background_name,
    ch.created_at,
    CASE
      WHEN account.active_character_id = ch.id THEN TRUE
      ELSE FALSE
    END AS is_current_active
  FROM dnd5e_character ch
  JOIN account ON account.id = ch.account_id
  LEFT JOIN dnd5e_race race ON race.id = ch.race_id
  LEFT JOIN dnd5e_class class ON class.id = ch.class_id
  LEFT JOIN dnd5e_background background ON background.id = ch.background_id
  WHERE ch.account_id = $1
  ORDER BY ch.created_at DESC, ch.id DESC;
`;
