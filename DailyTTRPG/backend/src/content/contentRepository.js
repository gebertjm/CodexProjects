function json(value) {
  return JSON.stringify(value ?? {});
}

async function selectOptionalId(executor, sql, params) {
  const result = await executor.query(sql, params);
  return result.rows[0] ? Number(result.rows[0].id) : null;
}

async function selectExistingId(executor, table, whereSql, params) {
  return selectOptionalId(executor, `SELECT id FROM ${table} WHERE ${whereSql} LIMIT 1`, params);
}

export async function getExistingContentMaps(executor, worldSlug) {
  const worldId = await selectOptionalId(
    executor,
    'SELECT id FROM dnd5e_world WHERE slug = $1',
    [worldSlug]
  );

  const [
    regionTemplates,
    locationTemplates,
    sceneTemplates,
    npcTemplates,
    monsterTemplates,
    quests,
    skills,
    eventTemplates,
    knowledgeDefinitions,
    environmentFlavorEntries,
    environmentModifiers,
  ] = await Promise.all([
    executor.query('SELECT key, id FROM dnd5e_region_template'),
    executor.query('SELECT key, id FROM dnd5e_location_template'),
    executor.query('SELECT key, id FROM dnd5e_scene_template'),
    executor.query('SELECT key, id FROM dnd5e_npc'),
    executor.query('SELECT key, id FROM dnd5e_monster'),
    executor.query('SELECT key, id FROM dnd5e_quest'),
    executor.query('SELECT slug, id FROM dnd5e_skill'),
    executor.query('SELECT key, id FROM dnd5e_event_template'),
    executor.query('SELECT knowledge_key, id FROM dnd5e_knowledge_definition'),
    executor.query('SELECT flavor_key, id FROM dnd5e_environment_flavor'),
    executor.query('SELECT modifier_key, id FROM dnd5e_environment_modifier'),
  ]);

  const worldScoped = worldId
    ? await Promise.all([
        executor.query('SELECT slug, id FROM dnd5e_campaign WHERE world_id = $1', [worldId]),
        executor.query('SELECT key, id FROM dnd5e_region WHERE world_id = $1', [worldId]),
        executor.query('SELECT key, id FROM dnd5e_location WHERE world_id = $1', [worldId]),
        executor.query('SELECT key, id FROM dnd5e_scene WHERE world_id = $1', [worldId]),
        executor.query('SELECT entity_key, id FROM dnd5e_world_entity WHERE world_id = $1', [worldId]),
        executor.query('SELECT hook_key, id FROM dnd5e_content_hook WHERE world_id = $1', [worldId]),
        executor.query('SELECT slug, id FROM dnd5e_encounter_template WHERE world_id = $1', [
          worldId,
        ]),
        executor.query(
          `
            SELECT transition.transition_key, transition.id
            FROM dnd5e_scene_transition transition
            JOIN dnd5e_scene scene ON scene.id = transition.from_scene_id
            WHERE scene.world_id = $1
          `,
          [worldId]
        ),
        executor.query(
          `
            SELECT interaction.interaction_key, interaction.id
            FROM dnd5e_scene_interaction interaction
            JOIN dnd5e_scene scene ON scene.id = interaction.scene_id
            WHERE scene.world_id = $1
          `,
          [worldId]
        ),
        executor.query(
          `
            SELECT affordance.affordance_key, affordance.id
            FROM dnd5e_scene_affordance affordance
            JOIN dnd5e_scene scene ON scene.id = affordance.scene_id
            WHERE scene.world_id = $1
          `,
          [worldId]
        ),
      ])
    : [];

  function toMap(rows, keyName = 'key') {
    return new Map(rows.map((row) => [row[keyName], Number(row.id)]));
  }

  return {
    worldId,
    regionTemplates: toMap(regionTemplates.rows),
    locationTemplates: toMap(locationTemplates.rows),
    sceneTemplates: toMap(sceneTemplates.rows),
    npcTemplates: toMap(npcTemplates.rows),
    monsterTemplates: toMap(monsterTemplates.rows),
    quests: toMap(quests.rows),
    skills: toMap(skills.rows, 'slug'),
    eventTemplates: toMap(eventTemplates.rows),
    knowledgeDefinitions: toMap(knowledgeDefinitions.rows, 'knowledge_key'),
    environmentFlavorEntries: toMap(environmentFlavorEntries.rows, 'flavor_key'),
    environmentModifiers: toMap(environmentModifiers.rows, 'modifier_key'),
    campaigns: worldScoped[0] ? toMap(worldScoped[0].rows, 'slug') : new Map(),
    regions: worldScoped[1] ? toMap(worldScoped[1].rows) : new Map(),
    locations: worldScoped[2] ? toMap(worldScoped[2].rows) : new Map(),
    scenes: worldScoped[3] ? toMap(worldScoped[3].rows) : new Map(),
    worldEntities: worldScoped[4] ? toMap(worldScoped[4].rows, 'entity_key') : new Map(),
    contentHooks: worldScoped[5] ? toMap(worldScoped[5].rows, 'hook_key') : new Map(),
    encounterTemplates: worldScoped[6] ? toMap(worldScoped[6].rows, 'slug') : new Map(),
    sceneTransitions: worldScoped[7] ? toMap(worldScoped[7].rows, 'transition_key') : new Map(),
    interactions: worldScoped[8] ? toMap(worldScoped[8].rows, 'interaction_key') : new Map(),
    sceneAffordances: worldScoped[9] ? toMap(worldScoped[9].rows, 'affordance_key') : new Map(),
  };
}

export async function detectUpsertAction(executor, table, whereSql, params) {
  return (await selectExistingId(executor, table, whereSql, params)) ? 'update' : 'create';
}

export async function upsertWorld(executor, record) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_world (
        slug,
        name,
        description,
        theme_tags_json,
        status
      )
      VALUES ($1, $2, $3, $4::jsonb, $5)
      ON CONFLICT (slug) DO UPDATE
      SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        theme_tags_json = EXCLUDED.theme_tags_json,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      record.slug,
      record.name,
      record.description,
      JSON.stringify(record.theme_tags ?? []),
      record.status,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertRegionTemplate(executor, record) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_region_template (key, name, description, source)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (key) DO UPDATE
      SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        source = EXCLUDED.source,
        updated_at = NOW()
      RETURNING id;
    `,
    [record.slug, record.name, record.description, record.source ?? 'content_package']
  );

  return Number(result.rows[0].id);
}

export async function upsertLocationTemplate(executor, record, regionTemplateId) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_location_template (region_template_id, key, name, description, source)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (key) DO UPDATE
      SET
        region_template_id = EXCLUDED.region_template_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        source = EXCLUDED.source,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      regionTemplateId,
      record.slug,
      record.name,
      record.description,
      record.source ?? 'content_package',
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertSceneTemplate(executor, record, locationTemplateId) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_scene_template (
        location_template_id,
        key,
        name,
        summary,
        description,
        entry_text,
        entry_conditions_json,
        source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      ON CONFLICT (key) DO UPDATE
      SET
        location_template_id = EXCLUDED.location_template_id,
        name = EXCLUDED.name,
        summary = EXCLUDED.summary,
        description = EXCLUDED.description,
        entry_text = EXCLUDED.entry_text,
        entry_conditions_json = EXCLUDED.entry_conditions_json,
        source = EXCLUDED.source,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      locationTemplateId,
      record.slug,
      record.name,
      record.summary,
      record.description,
      record.entry_text,
      json(record.entry_conditions),
      record.source ?? 'content_package',
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertCampaign(executor, record, worldId) {
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (world_id, slug) DO UPDATE
      SET
        name = EXCLUDED.name,
        campaign_type = EXCLUDED.campaign_type,
        status = EXCLUDED.status,
        description = EXCLUDED.description,
        created_by_account_id = COALESCE(EXCLUDED.created_by_account_id, dnd5e_campaign.created_by_account_id),
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      worldId,
      record.slug,
      record.name,
      record.campaign_type,
      record.status,
      record.description,
      record.created_by_account_id,
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertRegion(executor, record, worldId, templateId) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_region (
        world_id,
        template_id,
        key,
        name,
        description,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (world_id, key) DO UPDATE
      SET
        template_id = EXCLUDED.template_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [worldId, templateId, record.slug, record.name, record.description, record.is_active]
  );

  return Number(result.rows[0].id);
}

export async function upsertLocation(executor, record, worldId, regionId, templateId) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_location (
        world_id,
        region_id,
        template_id,
        key,
        name,
        description,
        region_name,
        is_active
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        (SELECT name FROM dnd5e_region WHERE id = $2),
        $7
      )
      ON CONFLICT (world_id, key) DO UPDATE
      SET
        region_id = EXCLUDED.region_id,
        template_id = EXCLUDED.template_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        region_name = EXCLUDED.region_name,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      worldId,
      regionId,
      templateId,
      record.slug,
      record.name,
      record.description,
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertScene(executor, record, worldId, locationId, templateId) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_scene (
        world_id,
        location_id,
        template_id,
        key,
        name,
        summary,
        description,
        entry_text,
        metadata_json,
        is_starting_scene,
        entry_conditions_json,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, $12)
      ON CONFLICT (world_id, key) DO UPDATE
      SET
        location_id = EXCLUDED.location_id,
        template_id = EXCLUDED.template_id,
        name = EXCLUDED.name,
        summary = EXCLUDED.summary,
        description = EXCLUDED.description,
        entry_text = EXCLUDED.entry_text,
        metadata_json = EXCLUDED.metadata_json,
        is_starting_scene = EXCLUDED.is_starting_scene,
        entry_conditions_json = EXCLUDED.entry_conditions_json,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      worldId,
      locationId,
      templateId,
      record.slug,
      record.name,
      record.summary,
      record.description,
      record.entry_text,
      json({
        ...(record.metadata ?? {}),
        narration: record.narration ?? null,
        narration_tier: record.narration_tier ?? null,
        interaction_model: record.interaction_model ?? null,
        automatic_observations: record.automatic_observations ?? [],
        passive_discoveries: record.passive_discoveries ?? [],
        free_focus: record.free_focus ?? [],
        beat_actions: record.beat_actions ?? [],
      }),
      record.is_starting_scene,
      json(record.entry_conditions),
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertSceneTransition(executor, record, ids) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_scene_transition (
        from_scene_id,
        to_scene_id,
        transition_key,
        label,
        description,
        sort_order,
        is_default_path,
        recommendation_json,
        conditions_json,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
      ON CONFLICT (from_scene_id, transition_key) DO UPDATE
      SET
        to_scene_id = EXCLUDED.to_scene_id,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        is_default_path = EXCLUDED.is_default_path,
        recommendation_json = EXCLUDED.recommendation_json,
        conditions_json = EXCLUDED.conditions_json,
        is_active = EXCLUDED.is_active
      RETURNING id;
    `,
    [
      ids.fromSceneId,
      ids.toSceneId,
      record.slug,
      record.label,
      record.description,
      record.sort_order,
      record.is_default_path,
      json(record.recommendation),
      json(record.conditions),
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertNpcTemplate(executor, record) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_npc (
        key,
        name,
        npc_type,
        disposition,
        role,
        description,
        true_name,
        public_role_label,
        unknown_label,
        aliases_json,
        default_location_key,
        default_scene_key,
        default_visibility,
        default_availability,
        default_actions_json,
        identity_json,
        schedule_json,
        metadata_json,
        is_active
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14,
        $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19
      )
      ON CONFLICT (key) DO UPDATE
      SET
        name = EXCLUDED.name,
        npc_type = EXCLUDED.npc_type,
        disposition = EXCLUDED.disposition,
        role = EXCLUDED.role,
        description = EXCLUDED.description,
        true_name = EXCLUDED.true_name,
        public_role_label = EXCLUDED.public_role_label,
        unknown_label = EXCLUDED.unknown_label,
        aliases_json = EXCLUDED.aliases_json,
        default_location_key = EXCLUDED.default_location_key,
        default_scene_key = EXCLUDED.default_scene_key,
        default_visibility = EXCLUDED.default_visibility,
        default_availability = EXCLUDED.default_availability,
        default_actions_json = EXCLUDED.default_actions_json,
        identity_json = EXCLUDED.identity_json,
        schedule_json = EXCLUDED.schedule_json,
        metadata_json = EXCLUDED.metadata_json,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      record.slug,
      record.name,
      record.npc_type,
      record.disposition,
      record.role,
      record.description,
      record.true_name ?? record.name,
      record.public_role_label ?? null,
      record.unknown_label ?? record.public_role_label ?? record.name,
      JSON.stringify(record.aliases ?? []),
      record.default_location_id ?? null,
      record.default_scene_id ?? null,
      record.default_visibility ?? 'visible',
      record.default_availability ?? 'available',
      JSON.stringify(record.default_actions ?? ['observe', 'talk']),
      json(record.identity),
      JSON.stringify(record.schedule ?? []),
      json(record.metadata),
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertWorldEntity(executor, record, ids) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_world_entity (
        world_id,
        entity_key,
        entity_type,
        npc_template_id,
        monster_template_id,
        current_region_id,
        current_location_id,
        current_scene_id,
        status,
        disposition,
        faction,
        state_json,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
      ON CONFLICT (world_id, entity_key) DO UPDATE
      SET
        entity_type = EXCLUDED.entity_type,
        npc_template_id = EXCLUDED.npc_template_id,
        monster_template_id = EXCLUDED.monster_template_id,
        current_region_id = EXCLUDED.current_region_id,
        current_location_id = EXCLUDED.current_location_id,
        current_scene_id = EXCLUDED.current_scene_id,
        status = EXCLUDED.status,
        disposition = EXCLUDED.disposition,
        faction = EXCLUDED.faction,
        state_json = EXCLUDED.state_json,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      ids.worldId,
      record.slug,
      record.entity_type,
      ids.npcTemplateId,
      ids.monsterTemplateId,
      ids.regionId,
      ids.locationId,
      ids.sceneId,
      record.status,
      record.disposition,
      record.faction,
      json(record.state),
      record.notes,
    ]
  );

  return Number(result.rows[0].id);
}

export async function syncSceneNpcPresence(executor, record, sceneId, npcId, worldEntityId) {
  await executor.query(
    `
      INSERT INTO dnd5e_scene_npc (
        scene_id,
        npc_id,
        presence_text,
        sort_order,
        availability_conditions_json,
        is_active,
        world_entity_id
      )
      VALUES ($1, $2, $3, 0, '{}'::jsonb, TRUE, $4)
      ON CONFLICT (scene_id, npc_id) DO UPDATE
      SET
        world_entity_id = EXCLUDED.world_entity_id,
        presence_text = COALESCE(EXCLUDED.presence_text, dnd5e_scene_npc.presence_text),
        is_active = TRUE;
    `,
    [sceneId, npcId, record.presence_text ?? null, worldEntityId]
  );
}

export async function upsertEncounterTemplate(executor, record, ids) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_encounter_template (
        world_id,
        campaign_id,
        scene_id,
        slug,
        name,
        encounter_type,
        difficulty_intent,
        scaling_enabled,
        story_fixed_by_default,
        explicit_story_scaling,
        allowed_scaling_methods_json,
        disallowed_scaling_methods_json,
        party_size_min,
        party_size_max,
        level_min,
        level_max,
        async_beat_min,
        async_beat_max,
        base_variant,
        variants_json,
        resolution_paths_json,
        reward_value_json,
        fail_forward,
        metadata_json,
        is_active
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11::jsonb,
        $12::jsonb,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19,
        $20::jsonb,
        $21::jsonb,
        $22::jsonb,
        $23,
        $24::jsonb,
        $25
      )
      ON CONFLICT (world_id, slug) DO UPDATE
      SET
        campaign_id = EXCLUDED.campaign_id,
        scene_id = EXCLUDED.scene_id,
        name = EXCLUDED.name,
        encounter_type = EXCLUDED.encounter_type,
        difficulty_intent = EXCLUDED.difficulty_intent,
        scaling_enabled = EXCLUDED.scaling_enabled,
        story_fixed_by_default = EXCLUDED.story_fixed_by_default,
        explicit_story_scaling = EXCLUDED.explicit_story_scaling,
        allowed_scaling_methods_json = EXCLUDED.allowed_scaling_methods_json,
        disallowed_scaling_methods_json = EXCLUDED.disallowed_scaling_methods_json,
        party_size_min = EXCLUDED.party_size_min,
        party_size_max = EXCLUDED.party_size_max,
        level_min = EXCLUDED.level_min,
        level_max = EXCLUDED.level_max,
        async_beat_min = EXCLUDED.async_beat_min,
        async_beat_max = EXCLUDED.async_beat_max,
        base_variant = EXCLUDED.base_variant,
        variants_json = EXCLUDED.variants_json,
        resolution_paths_json = EXCLUDED.resolution_paths_json,
        reward_value_json = EXCLUDED.reward_value_json,
        fail_forward = EXCLUDED.fail_forward,
        metadata_json = EXCLUDED.metadata_json,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      ids.worldId,
      ids.campaignId,
      ids.sceneId,
      record.slug,
      record.name,
      record.encounter_type,
      record.difficulty_intent,
      record.scaling_enabled,
      record.story_fixed_by_default,
      record.explicit_story_scaling,
      json(record.allowed_scaling_methods),
      json(record.disallowed_scaling_methods),
      record.party_size_range?.min ?? null,
      record.party_size_range?.max ?? null,
      record.level_range?.min ?? null,
      record.level_range?.max ?? null,
      record.async_beat_target?.min ?? null,
      record.async_beat_target?.max ?? null,
      record.base_variant,
      json(record.variants),
      json(record.resolution_paths),
      json(record.reward_value),
      record.fail_forward,
      json({
        ...(record.metadata ?? {}),
        ...(record.stat_tweak_bounds ? { stat_tweak_bounds: record.stat_tweak_bounds } : {}),
      }),
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertKnowledgeDefinition(executor, record, packageInfo = {}) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_knowledge_definition (
        content_package_id,
        content_package_version,
        knowledge_key,
        knowledge_type,
        public_label,
        canonical_text,
        hidden_until_discovered,
        tags_json,
        metadata_json,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
      ON CONFLICT (knowledge_key) DO UPDATE
      SET
        content_package_id = EXCLUDED.content_package_id,
        content_package_version = EXCLUDED.content_package_version,
        knowledge_type = EXCLUDED.knowledge_type,
        public_label = EXCLUDED.public_label,
        canonical_text = EXCLUDED.canonical_text,
        hidden_until_discovered = EXCLUDED.hidden_until_discovered,
        tags_json = EXCLUDED.tags_json,
        metadata_json = EXCLUDED.metadata_json,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      packageInfo.name ?? packageInfo.id ?? 'default',
      packageInfo.version ?? null,
      record.knowledge_id,
      record.type,
      record.public_label,
      record.canonical_text,
      record.hidden_until_discovered,
      JSON.stringify(record.tags ?? []),
      json(record.metadata),
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertEnvironmentFlavorEntry(executor, record) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_environment_flavor (
        flavor_key,
        slot,
        text,
        tags_json,
        valid_weather_json,
        valid_time_of_day_json,
        valid_season_json,
        valid_location_tags_json,
        valid_scene_tags_json,
        valid_biome_json,
        valid_location_environment_json,
        tone_or_mood_json,
        priority,
        weight,
        reuse_cooldown,
        exclusions_json,
        requires_known_facts_json,
        excludes_known_facts_json,
        requires_world_flags_json,
        excludes_world_flags_json,
        max_once_per_scene,
        author_notes,
        gm_notes,
        metadata_json,
        is_active
      )
      VALUES (
        $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb,
        $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16::jsonb, $17::jsonb,
        $18::jsonb, $19::jsonb, $20::jsonb, $21, $22, $23, $24::jsonb, $25
      )
      ON CONFLICT (flavor_key) DO UPDATE
      SET
        slot = EXCLUDED.slot,
        text = EXCLUDED.text,
        tags_json = EXCLUDED.tags_json,
        valid_weather_json = EXCLUDED.valid_weather_json,
        valid_time_of_day_json = EXCLUDED.valid_time_of_day_json,
        valid_season_json = EXCLUDED.valid_season_json,
        valid_location_tags_json = EXCLUDED.valid_location_tags_json,
        valid_scene_tags_json = EXCLUDED.valid_scene_tags_json,
        valid_biome_json = EXCLUDED.valid_biome_json,
        valid_location_environment_json = EXCLUDED.valid_location_environment_json,
        tone_or_mood_json = EXCLUDED.tone_or_mood_json,
        priority = EXCLUDED.priority,
        weight = EXCLUDED.weight,
        reuse_cooldown = EXCLUDED.reuse_cooldown,
        exclusions_json = EXCLUDED.exclusions_json,
        requires_known_facts_json = EXCLUDED.requires_known_facts_json,
        excludes_known_facts_json = EXCLUDED.excludes_known_facts_json,
        requires_world_flags_json = EXCLUDED.requires_world_flags_json,
        excludes_world_flags_json = EXCLUDED.excludes_world_flags_json,
        max_once_per_scene = EXCLUDED.max_once_per_scene,
        author_notes = EXCLUDED.author_notes,
        gm_notes = EXCLUDED.gm_notes,
        metadata_json = EXCLUDED.metadata_json,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      record.id,
      record.slot,
      record.text,
      JSON.stringify(record.tags ?? []),
      JSON.stringify(record.valid_weather ?? []),
      JSON.stringify(record.valid_time_of_day ?? []),
      JSON.stringify(record.valid_season ?? []),
      JSON.stringify(record.valid_location_tags ?? []),
      JSON.stringify(record.valid_scene_tags ?? []),
      JSON.stringify(record.valid_biome ?? []),
      JSON.stringify(record.valid_location_environment ?? []),
      JSON.stringify(record.tone_or_mood ?? []),
      record.priority ?? 0,
      record.weight ?? 1,
      record.reuse_cooldown ?? 0,
      JSON.stringify(record.exclusions ?? []),
      JSON.stringify(record.requires_known_facts ?? []),
      JSON.stringify(record.excludes_known_facts ?? []),
      JSON.stringify(record.requires_world_flags ?? []),
      JSON.stringify(record.excludes_world_flags ?? []),
      record.max_once_per_scene ?? false,
      record.author_notes ?? null,
      record.gm_notes ?? null,
      json(record.metadata),
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertEnvironmentModifier(executor, record) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_environment_modifier (
        modifier_key,
        environment_key,
        check_type,
        skill_slug,
        context,
        modifier,
        reason,
        narrative_hint,
        conditions_json,
        metadata_json,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)
      ON CONFLICT (modifier_key) DO UPDATE
      SET
        environment_key = EXCLUDED.environment_key,
        check_type = EXCLUDED.check_type,
        skill_slug = EXCLUDED.skill_slug,
        context = EXCLUDED.context,
        modifier = EXCLUDED.modifier,
        reason = EXCLUDED.reason,
        narrative_hint = EXCLUDED.narrative_hint,
        conditions_json = EXCLUDED.conditions_json,
        metadata_json = EXCLUDED.metadata_json,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      record.id,
      record.environment_id,
      record.check_type,
      record.skill ?? null,
      record.context ?? null,
      record.modifier,
      record.reason,
      record.narrative_hint ?? null,
      json(record.conditions),
      json(record.metadata),
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertSceneAffordance(executor, record, ids) {
  const affordanceResult = await executor.query(
    `
      INSERT INTO dnd5e_scene_affordance (
        scene_id,
        affordance_key,
        label,
        aliases_json,
        tags_json,
        metadata_json,
        initial_state,
        is_active
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8)
      ON CONFLICT (scene_id, affordance_key) DO UPDATE
      SET
        label = EXCLUDED.label,
        aliases_json = EXCLUDED.aliases_json,
        tags_json = EXCLUDED.tags_json,
        metadata_json = EXCLUDED.metadata_json,
        initial_state = EXCLUDED.initial_state,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      ids.sceneId,
      record.affordance_id,
      record.label,
      JSON.stringify(record.aliases ?? []),
      JSON.stringify(record.tags ?? []),
      json({
        ...(record.metadata ?? {}),
        narration: record.narration ?? null,
        priority: record.priority ?? null,
        free_focus: record.free_focus ?? null,
        prerequisites: record.prerequisites ?? [],
        hidden_until: record.hidden_until ?? [],
        locked_until: record.locked_until ?? [],
        reveals: record.reveals ?? [],
        adds_affordances: record.adds_affordances ?? [],
        removes_affordances: record.removes_affordances ?? [],
      }),
      record.initial_state,
      record.is_active,
    ]
  );
  const affordanceId = Number(affordanceResult.rows[0].id);

  for (const action of record.available_actions ?? []) {
    await executor.query(
      `
        INSERT INTO dnd5e_scene_affordance_action (
          affordance_id,
          verb,
          action_key,
          interaction_id,
          transition_id,
          repeat_policy,
          metadata_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (affordance_id, verb, action_key) DO UPDATE
        SET
          interaction_id = EXCLUDED.interaction_id,
          transition_id = EXCLUDED.transition_id,
          repeat_policy = EXCLUDED.repeat_policy,
          metadata_json = EXCLUDED.metadata_json,
          updated_at = NOW();
      `,
      [
        affordanceId,
        action.verb,
        action.interaction_id
          ? `scene_interaction:${action.interaction_id}`
          : action.transition_id
            ? `scene_transition:${action.transition_id}`
            : `${action.verb}:${record.affordance_id}`,
        ids.interactionIds?.get(action.interaction_id) ?? null,
        ids.transitionIds?.get(action.transition_id) ?? null,
        action.repeat_policy,
        json(action.metadata),
      ]
    );
  }

  return affordanceId;
}

export async function upsertQuest(executor, record) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_quest (
        key,
        name,
        summary,
        description,
        availability_conditions_json,
        discovery_summary,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
      ON CONFLICT (key) DO UPDATE
      SET
        name = EXCLUDED.name,
        summary = EXCLUDED.summary,
        description = EXCLUDED.description,
        availability_conditions_json = EXCLUDED.availability_conditions_json,
        discovery_summary = EXCLUDED.discovery_summary,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      record.slug,
      record.name,
      record.summary,
      record.description,
      json(record.availability_conditions),
      record.discovery_summary,
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertQuestObjective(executor, record, questId) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_quest_objective (
        quest_id,
        key,
        title,
        description,
        sort_order,
        activation_conditions_json,
        completion_conditions_json,
        failure_conditions_json,
        progress_target,
        hard_gate
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)
      ON CONFLICT (quest_id, key) DO UPDATE
      SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        activation_conditions_json = EXCLUDED.activation_conditions_json,
        completion_conditions_json = EXCLUDED.completion_conditions_json,
        failure_conditions_json = EXCLUDED.failure_conditions_json,
        progress_target = EXCLUDED.progress_target,
        hard_gate = EXCLUDED.hard_gate
      RETURNING id;
    `,
    [
      questId,
      record.slug,
      record.title,
      record.description,
      record.sort_order,
      json(record.activation_conditions),
      json(record.completion_conditions),
      json(record.failure_conditions),
      record.progress_target,
      record.hard_gate,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertSceneInteraction(executor, record, ids) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_scene_interaction (
        scene_id,
        npc_id,
        interaction_key,
        label,
        description,
        interaction_type,
        skill_id,
        difficulty_class,
        sort_order,
        is_repeatable,
        availability_conditions_json,
        success_effects_json,
        failure_effects_json,
        success_text,
        failure_text,
        verb,
        target_affordance_key,
        result_bands_json,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, $17, $18::jsonb, $19)
      ON CONFLICT (scene_id, interaction_key) DO UPDATE
      SET
        npc_id = EXCLUDED.npc_id,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        interaction_type = EXCLUDED.interaction_type,
        skill_id = EXCLUDED.skill_id,
        difficulty_class = EXCLUDED.difficulty_class,
        sort_order = EXCLUDED.sort_order,
        is_repeatable = EXCLUDED.is_repeatable,
        availability_conditions_json = EXCLUDED.availability_conditions_json,
        success_effects_json = EXCLUDED.success_effects_json,
        failure_effects_json = EXCLUDED.failure_effects_json,
        success_text = EXCLUDED.success_text,
        failure_text = EXCLUDED.failure_text,
        verb = EXCLUDED.verb,
        target_affordance_key = EXCLUDED.target_affordance_key,
        result_bands_json = EXCLUDED.result_bands_json,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      ids.sceneId,
      ids.npcId,
      record.slug,
      record.label,
      record.description,
      record.interaction_type,
      ids.skillId,
      record.difficulty_class,
      record.sort_order,
      record.is_repeatable,
      json(record.availability_conditions),
      json(record.success_effects),
      json(record.failure_effects),
      record.success_text,
      record.failure_text,
      record.verb,
      record.target_affordance_id,
      json(record.result_bands ?? []),
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertDialogue(executor, record, ids) {
  const result = await executor.query(
    `
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
        is_repeatable,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
      ON CONFLICT (dialogue_key) DO UPDATE
      SET
        scene_id = EXCLUDED.scene_id,
        npc_id = EXCLUDED.npc_id,
        name = EXCLUDED.name,
        summary = EXCLUDED.summary,
        description = EXCLUDED.description,
        trigger_type = EXCLUDED.trigger_type,
        trigger_event = EXCLUDED.trigger_event,
        sort_order = EXCLUDED.sort_order,
        availability_conditions_json = EXCLUDED.availability_conditions_json,
        is_repeatable = EXCLUDED.is_repeatable,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      ids.sceneId,
      ids.npcId,
      record.slug,
      record.name,
      record.summary,
      record.description,
      record.trigger_type,
      record.trigger_event,
      record.sort_order,
      json(record.availability_conditions),
      record.is_repeatable,
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertEventTemplate(executor, record) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_event_template (
        key,
        name,
        event_type,
        description,
        prompt_text,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (key) DO UPDATE
      SET
        name = EXCLUDED.name,
        event_type = EXCLUDED.event_type,
        description = EXCLUDED.description,
        prompt_text = EXCLUDED.prompt_text,
        is_active = EXCLUDED.is_active
      RETURNING id;
    `,
    [
      record.slug,
      record.name,
      record.event_type,
      record.description,
      record.prompt_text,
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertEventTemplateOption(executor, record, templateId) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_event_template_option (
        template_id,
        option_key,
        label,
        description,
        sort_order,
        resolution_kind,
        resolution_payload_json,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      ON CONFLICT (template_id, option_key) DO UPDATE
      SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        resolution_kind = EXCLUDED.resolution_kind,
        resolution_payload_json = EXCLUDED.resolution_payload_json,
        is_active = EXCLUDED.is_active
      RETURNING id;
    `,
    [
      templateId,
      record.slug,
      record.label,
      record.description,
      record.sort_order,
      record.resolution_kind,
      json(record.resolution_payload),
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertDialogueNode(executor, record, ids) {
  const result = await executor.query(
    `
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
      ON CONFLICT (dialogue_id, node_key) DO UPDATE
      SET
        speaker_npc_id = EXCLUDED.speaker_npc_id,
        title = EXCLUDED.title,
        speaker_type = EXCLUDED.speaker_type,
        text_content = EXCLUDED.text_content,
        sort_order = EXCLUDED.sort_order,
        is_entry_node = EXCLUDED.is_entry_node,
        is_terminal = EXCLUDED.is_terminal,
        availability_conditions_json = EXCLUDED.availability_conditions_json,
        entry_effects_json = EXCLUDED.entry_effects_json,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      ids.dialogueId,
      ids.speakerNpcId,
      record.slug,
      record.title,
      record.speaker_type,
      record.text_content,
      record.sort_order,
      record.is_entry_node,
      record.is_terminal,
      json(record.availability_conditions),
      json(record.entry_effects),
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertDialogueOption(executor, record, ids) {
  const result = await executor.query(
    `
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
        check_visibility,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
      ON CONFLICT (node_id, option_key) DO UPDATE
      SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        availability_conditions_json = EXCLUDED.availability_conditions_json,
        check_mode = EXCLUDED.check_mode,
        skill_id = EXCLUDED.skill_id,
        difficulty_class = EXCLUDED.difficulty_class,
        check_visibility = EXCLUDED.check_visibility,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      ids.nodeId,
      record.slug,
      record.label,
      record.description,
      record.sort_order,
      json(record.availability_conditions),
      record.check_mode,
      ids.skillId,
      record.difficulty_class,
      record.check_visibility,
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertDialogueOutcome(executor, record, ids) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_dialogue_outcome (
        option_id,
        next_node_id,
        outcome_key,
        label,
        sort_order,
        conditions_json,
        effects_json,
        result_text,
        is_terminal,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)
      ON CONFLICT (option_id, outcome_key) DO UPDATE
      SET
        next_node_id = EXCLUDED.next_node_id,
        label = EXCLUDED.label,
        sort_order = EXCLUDED.sort_order,
        conditions_json = EXCLUDED.conditions_json,
        effects_json = EXCLUDED.effects_json,
        result_text = EXCLUDED.result_text,
        is_terminal = EXCLUDED.is_terminal,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      ids.optionId,
      ids.nextNodeId,
      record.slug,
      record.label,
      record.sort_order,
      json(record.conditions),
      json(record.effects),
      record.result_text,
      record.is_terminal,
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertContentHook(executor, record, ids) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_content_hook (
        world_id,
        campaign_id,
        scene_id,
        npc_id,
        hook_key,
        hook_point,
        scope_type,
        scope_key,
        label,
        description,
        conditions_json,
        effects_json,
        event_triggers_json,
        feedback_json,
        priority,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16)
      ON CONFLICT (world_id, hook_key) DO UPDATE
      SET
        campaign_id = EXCLUDED.campaign_id,
        scene_id = EXCLUDED.scene_id,
        npc_id = EXCLUDED.npc_id,
        hook_point = EXCLUDED.hook_point,
        scope_type = EXCLUDED.scope_type,
        scope_key = EXCLUDED.scope_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        conditions_json = EXCLUDED.conditions_json,
        effects_json = EXCLUDED.effects_json,
        event_triggers_json = EXCLUDED.event_triggers_json,
        feedback_json = EXCLUDED.feedback_json,
        priority = EXCLUDED.priority,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      ids.worldId,
      ids.campaignId,
      ids.sceneId,
      ids.npcId,
      record.slug,
      record.hook_point,
      record.scope_type,
      record.scope_key,
      record.label,
      record.description,
      json(record.conditions),
      json(record.effects),
      JSON.stringify(record.event_triggers ?? []),
      JSON.stringify({
        ...(record.feedback ?? {}),
        text: record.text ?? {},
      }),
      record.priority,
      record.is_active,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertCampaignLocationState(executor, record, ids) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_campaign_location_state (
        campaign_id,
        location_id,
        is_discovered,
        is_available,
        overlay_json,
        notes
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      ON CONFLICT (campaign_id, location_id) DO UPDATE
      SET
        is_discovered = EXCLUDED.is_discovered,
        is_available = EXCLUDED.is_available,
        overlay_json = EXCLUDED.overlay_json,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      ids.campaignId,
      ids.locationId,
      record.is_discovered,
      record.is_available,
      json(record.overlay),
      record.notes,
    ]
  );

  return Number(result.rows[0].id);
}

export async function upsertCampaignSceneState(executor, record, ids) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_campaign_scene_state (
        campaign_id,
        scene_id,
        is_discovered,
        is_available,
        overlay_json,
        notes
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      ON CONFLICT (campaign_id, scene_id) DO UPDATE
      SET
        is_discovered = EXCLUDED.is_discovered,
        is_available = EXCLUDED.is_available,
        overlay_json = EXCLUDED.overlay_json,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING id;
    `,
    [
      ids.campaignId,
      ids.sceneId,
      record.is_discovered,
      record.is_available,
      json(record.overlay),
      record.notes,
    ]
  );

  return Number(result.rows[0].id);
}
