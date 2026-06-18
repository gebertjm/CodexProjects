import { query, withTransaction } from '../config/db.js';
import { selectAccountByIdQuery } from '../db/queries/accounts.js';
import { selectCharacterForCompositionQuery, selectCharacterForReadQuery } from '../db/queries/characterComposition.js';
import {
  clearActiveContextMembershipsForCharacterQuery,
  insertCampaignCharacterQuery,
  insertCampaignLocationStatesForCampaignQuery,
  insertCampaignQuery,
  insertCampaignSceneStatesForCampaignQuery,
  insertEventInstanceQuery,
  insertEventLogQuery,
  insertEventOptionQuery,
  selectActiveContextMembershipForCharacterQuery,
  selectCampaignByIdQuery,
  selectCampaignCharacterMembershipQuery,
  selectCampaignCharactersQuery,
  selectCampaignsQuery,
  selectCharacterEventsQuery,
  selectEventInstanceByIdForUpdateQuery,
  selectEventInstanceByIdQuery,
  selectEventLogRowsByEventQuery,
  selectEventOptionsByEventQuery,
  selectEventTemplateByIdQuery,
  selectEventTemplateByKeyQuery,
  selectEventTemplateOptionsQuery,
  selectEventTemplatesQuery,
  updateEventInstanceResolutionQuery,
} from '../db/queries/events.js';
import { selectActiveEventByCampaignAndCharacterQuery } from '../db/queries/adventureRuntime.js';
import { resolveEventOption } from '../engine/events/eventResolver.js';
import { createHttpError } from '../utils/httpError.js';
import { recordGameplayHistory } from './gameplayHistoryService.js';
import { getDefaultWorldId } from './worldContentService.js';

function normalizeNonEmptyText(value, label) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    throw createHttpError(`${label} is required`, 400);
  }

  return normalized;
}

function slugify(value, fallbackPrefix = 'campaign') {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return normalized || `${fallbackPrefix}-${Date.now().toString(36)}`;
}

function normalizeCampaignType(value) {
  const normalized = String(value ?? 'party').trim() || 'party';

  if (!['solo', 'party', 'questline', 'world_event'].includes(normalized)) {
    throw createHttpError('campaign_type must be solo, party, questline, or world_event', 400);
  }

  return normalized;
}

function normalizeCampaignStatus(value) {
  const normalized = String(value ?? 'active').trim() || 'active';

  if (!['active', 'dormant', 'completed', 'archived'].includes(normalized)) {
    throw createHttpError('status must be active, dormant, completed, or archived', 400);
  }

  return normalized;
}

function mapCampaignRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    world_id: Number(row.world_id),
    world: {
      id: Number(row.world_id),
      name: row.world_name,
      slug: row.world_slug,
    },
    name: row.name,
    slug: row.slug,
    campaign_type: row.campaign_type,
    status: row.status,
    description: row.description,
    created_by_account_id:
      row.created_by_account_id !== null ? Number(row.created_by_account_id) : null,
    created_by:
      row.created_by_account_id !== null
        ? {
            account_id: Number(row.created_by_account_id),
            display_name: row.created_by_display_name,
          }
        : null,
    is_active: row.is_active,
    member_count: row.member_count !== undefined ? Number(row.member_count) : undefined,
    open_event_count: row.open_event_count !== undefined ? Number(row.open_event_count) : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapCampaignCharacterRow(row) {
  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    joined_by_account_id:
      row.joined_by_account_id !== null ? Number(row.joined_by_account_id) : null,
    joined_by:
      row.joined_by_account_id !== null
        ? {
            account_id: Number(row.joined_by_account_id),
            display_name: row.joined_by_display_name,
          }
        : null,
    is_active: row.is_active,
    membership_status: row.membership_status,
    is_active_context: row.is_active_context,
    is_default_solo_campaign: row.is_default_solo_campaign,
    joined_at: row.joined_at,
    left_at: row.left_at,
    created_at: row.created_at,
    character: {
      id: Number(row.character_id),
      name: row.character_name,
      level: Number(row.character_level),
      is_active: row.character_is_active,
      account_id: Number(row.account_id),
      account_display_name: row.account_display_name,
      account_is_active: row.account_is_active,
    },
  };
}

function mapEventTemplateRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    key: row.key,
    name: row.name,
    event_type: row.event_type,
    description: row.description,
    prompt_text: row.prompt_text,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

function mapEventTemplateOptionRow(row) {
  return {
    id: Number(row.id),
    template_id: Number(row.template_id),
    option_key: row.option_key,
    label: row.label,
    description: row.description,
    sort_order: Number(row.sort_order),
    resolution_kind: row.resolution_kind,
    resolution_payload_json: row.resolution_payload_json ?? {},
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

function mapEventOptionRow(row) {
  return {
    id: Number(row.id),
    event_instance_id: Number(row.event_instance_id),
    template_option_id:
      row.template_option_id !== null ? Number(row.template_option_id) : null,
    option_key: row.option_key,
    label: row.label,
    description: row.description,
    sort_order: Number(row.sort_order),
    resolution_kind: row.resolution_kind,
    resolution_payload_json: row.resolution_payload_json ?? {},
    is_available: row.is_available,
    created_at: row.created_at,
  };
}

function mapEventLogRow(row) {
  return {
    id: Number(row.id),
    event_instance_id: Number(row.event_instance_id),
    actor_account_id:
      row.actor_account_id !== null ? Number(row.actor_account_id) : null,
    actor:
      row.actor_account_id !== null
        ? {
            account_id: Number(row.actor_account_id),
            display_name: row.actor_display_name,
          }
        : null,
    log_type: row.log_type,
    message: row.message,
    data_json: row.data_json ?? {},
    created_at: row.created_at,
  };
}

function mapEventInstanceRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    status: row.status,
    prompt_text: row.prompt_text,
    outcome_summary: row.outcome_summary,
    result_json: row.result_json ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    expires_at: row.expires_at,
    campaign: {
      id: Number(row.campaign_id),
      name: row.campaign_name,
      description: row.campaign_description,
      is_active: row.campaign_is_active,
    },
    character: {
      id: Number(row.character_id),
      name: row.character_name,
      account_id: Number(row.account_id),
      account_display_name: row.account_display_name,
      is_active: row.character_is_active,
    },
    template: {
      id: Number(row.template_id),
      key: row.template_key,
      name: row.template_name,
      event_type: row.event_type,
    },
    created_by:
      row.created_by_account_id !== null
        ? {
            account_id: Number(row.created_by_account_id),
            display_name: row.created_by_display_name,
          }
        : null,
    selected_option:
      row.selected_option_id !== null
        ? {
            id: Number(row.selected_option_id),
            option_key: row.selected_option_key,
            label: row.selected_option_label,
          }
        : null,
  };
}

function mapEventSummaryRow(row) {
  return {
    id: Number(row.id),
    status: row.status,
    prompt_text: row.prompt_text,
    outcome_summary: row.outcome_summary,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    campaign: {
      id: Number(row.campaign_id),
      name: row.campaign_name,
    },
    template: {
      id: Number(row.template_id),
      key: row.template_key,
      name: row.template_name,
      event_type: row.event_type,
    },
    selected_option:
      row.selected_option_id !== null
        ? {
            id: Number(row.selected_option_id),
            option_key: row.selected_option_key,
            label: row.selected_option_label,
          }
        : null,
  };
}

function isUniqueViolation(error) {
  return error?.code === '23505';
}

function isForeignKeyViolation(error) {
  return error?.code === '23503';
}

function isCheckViolation(error) {
  return error?.code === '23514';
}

function isRaisedException(error) {
  return error?.code === 'P0001';
}

async function requireAccountIfProvided(accountId, executor = { query }) {
  if (accountId === null || accountId === undefined) {
    return null;
  }

  const result = await executor.query(selectAccountByIdQuery, [accountId]);

  if (!result.rows[0]) {
    throw createHttpError('actor_account_id must reference an existing account', 400);
  }

  return result.rows[0];
}

async function requireCharacterForGameplay(characterId, executor) {
  const result = await executor.query(selectCharacterForCompositionQuery, [characterId]);
  const character = result.rows[0] || null;

  if (!character) {
    throw createHttpError('Character not found', 404);
  }

  if (!character.account_is_active) {
    throw createHttpError('Character account is inactive', 400);
  }

  if (!character.is_active) {
    throw createHttpError('Inactive characters cannot participate in events', 409);
  }

  return {
    id: Number(character.id),
    account_id: Number(character.account_id),
    name: character.name,
    is_active: character.is_active,
    account_is_active: character.account_is_active,
  };
}

async function requireCharacterForRead(characterId, executor = { query }) {
  const result = await executor.query(selectCharacterForReadQuery, [characterId]);
  const character = result.rows[0] || null;

  if (!character) {
    throw createHttpError('Character not found', 404);
  }

  return character;
}

async function getCampaignByIdInternal(campaignId, executor = { query }) {
  const result = await executor.query(selectCampaignByIdQuery, [campaignId]);
  return mapCampaignRow(result.rows[0] || null);
}

async function getCampaignDetailsByIdInternal(campaignId, executor = { query }) {
  const campaign = await getCampaignByIdInternal(campaignId, executor);

  if (!campaign) {
    return null;
  }

  const membersResult = await executor.query(selectCampaignCharactersQuery, [campaignId]);

  return {
    campaign,
    members: membersResult.rows.map(mapCampaignCharacterRow),
  };
}

async function requireActiveCampaign(campaignId, executor = { query }) {
  const campaign = await getCampaignByIdInternal(campaignId, executor);

  if (!campaign) {
    throw createHttpError('Campaign not found', 404);
  }

  if (!campaign.is_active) {
    throw createHttpError('Campaign is inactive', 409);
  }

  return campaign;
}

async function getCampaignMembership(campaignId, characterId, executor = { query }) {
  const result = await executor.query(selectCampaignCharacterMembershipQuery, [
    campaignId,
    characterId,
  ]);
  return result.rows[0] ? mapCampaignCharacterRow(result.rows[0]) : null;
}

async function requireActiveCampaignMembership(campaignId, characterId, executor = { query }) {
  const membership = await getCampaignMembership(campaignId, characterId, executor);

  if (!membership) {
    throw createHttpError('Character is not part of that campaign', 409);
  }

  if (!membership.is_active) {
    throw createHttpError('That campaign membership is inactive', 409);
  }

  return membership;
}

async function getEventTemplateByKeyOrId({ template_key, template_id }, executor = { query }) {
  if (template_key) {
    const result = await executor.query(selectEventTemplateByKeyQuery, [template_key]);
    return mapEventTemplateRow(result.rows[0] || null);
  }

  if (template_id) {
    const result = await executor.query(selectEventTemplateByIdQuery, [template_id]);
    return mapEventTemplateRow(result.rows[0] || null);
  }

  throw createHttpError('template_key or template_id is required', 400);
}

async function requireActiveEventTemplate(input, executor = { query }) {
  const template = await getEventTemplateByKeyOrId(input, executor);

  if (!template) {
    throw createHttpError('Event template not found', 404);
  }

  if (!template.is_active) {
    throw createHttpError('Event template is inactive', 409);
  }

  return template;
}

async function listEventTemplateOptionsInternal(templateId, executor = { query }) {
  const result = await executor.query(selectEventTemplateOptionsQuery, [templateId]);
  return result.rows.map(mapEventTemplateOptionRow);
}

async function listEventOptionsInternal(eventId, executor = { query }) {
  const result = await executor.query(selectEventOptionsByEventQuery, [eventId]);
  return result.rows.map(mapEventOptionRow);
}

async function listEventLogsInternal(eventId, executor = { query }) {
  const result = await executor.query(selectEventLogRowsByEventQuery, [eventId]);
  return result.rows.map(mapEventLogRow);
}

async function insertEventLogInternal(eventId, actorAccountId, logType, message, data, executor) {
  const result = await executor.query(insertEventLogQuery, [
    eventId,
    actorAccountId ?? null,
    logType,
    message ?? null,
    JSON.stringify(data ?? {}),
  ]);

  return mapEventLogRow(result.rows[0]);
}

async function getEventByIdInternal(eventId, executor = { query }) {
  const result = await executor.query(selectEventInstanceByIdQuery, [eventId]);
  const event = mapEventInstanceRow(result.rows[0] || null);

  if (!event) {
    return null;
  }

  const [options, logs] = await Promise.all([
    listEventOptionsInternal(eventId, executor),
    listEventLogsInternal(eventId, executor),
  ]);

  return {
    ...event,
    options,
    logs,
  };
}

async function getEventForUpdate(eventId, executor) {
  const result = await executor.query(selectEventInstanceByIdForUpdateQuery, [eventId]);
  const event = mapEventInstanceRow(result.rows[0] || null);

  if (!event) {
    throw createHttpError('Event not found', 404);
  }

  return event;
}

function selectEventOption(options, input) {
  const optionId = input.option_id ?? null;
  const optionKey = input.option_key ?? null;

  if ((optionId === null) === (optionKey === null)) {
    throw createHttpError('Provide exactly one of option_id or option_key', 400);
  }

  const option = optionId
    ? options.find((entry) => entry.id === optionId)
    : options.find((entry) => entry.option_key === optionKey);

  if (!option) {
    throw createHttpError('Event option not found', 404);
  }

  if (!option.is_available) {
    throw createHttpError('That event option is not currently available', 409);
  }

  return option;
}

export async function listCampaigns() {
  const result = await query(selectCampaignsQuery);
  return result.rows.map(mapCampaignRow);
}

export async function getCampaignById(campaignId) {
  return getCampaignDetailsByIdInternal(campaignId);
}

export async function createCampaign(input) {
  return withTransaction(async (client) => {
    await requireAccountIfProvided(input.created_by_account_id ?? null, client);

    const name = normalizeNonEmptyText(input.name, 'name');
    const worldId = input.world_id ?? (await getDefaultWorldId(client));
    const slug = input.slug?.trim() ? slugify(input.slug) : slugify(name);
    const campaignType = normalizeCampaignType(input.campaign_type);
    const status = normalizeCampaignStatus(input.status);
    const isActive = status !== 'archived';
    const description = input.description?.trim() ? input.description.trim() : null;
    let insertResult;

    try {
      insertResult = await client.query(insertCampaignQuery, [
        worldId,
        name,
        slug,
        campaignType,
        status,
        description,
        input.created_by_account_id ?? null,
        isActive,
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw createHttpError('A campaign with that slug already exists in this world', 409);
      }

      if (isForeignKeyViolation(error)) {
        throw createHttpError('world_id or created_by_account_id references a missing record', 400);
      }

      if (isCheckViolation(error)) {
        throw createHttpError('Campaign payload failed a database validation rule', 400);
      }

      throw error;
    }

    const campaignId = Number(insertResult.rows[0].id);
    await client.query(insertCampaignLocationStatesForCampaignQuery, [campaignId]);
    await client.query(insertCampaignSceneStatesForCampaignQuery, [campaignId]);

    return getCampaignDetailsByIdInternal(campaignId, client);
  });
}

export async function addCharacterToCampaign(campaignId, input) {
  return withTransaction(async (client) => {
    await requireActiveCampaign(campaignId, client);
    await requireCharacterForGameplay(input.character_id, client);
    await requireAccountIfProvided(input.joined_by_account_id ?? null, client);

    const existingActiveContextResult = await client.query(
      selectActiveContextMembershipForCharacterQuery,
      [input.character_id]
    );
    const requestedActiveContext = input.is_active_context === true;
    const shouldSetActiveContext =
      requestedActiveContext || existingActiveContextResult.rowCount === 0;

    if (requestedActiveContext) {
      await client.query(clearActiveContextMembershipsForCharacterQuery, [input.character_id]);
    }

    try {
      await client.query(insertCampaignCharacterQuery, [
        campaignId,
        input.character_id,
        input.joined_by_account_id ?? null,
        true,
        'active',
        shouldSetActiveContext,
        false,
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw createHttpError('That character is already part of the campaign', 409);
      }

      if (isForeignKeyViolation(error)) {
        throw createHttpError('Campaign membership references an invalid campaign, character, or account', 400);
      }

      if (isRaisedException(error)) {
        throw createHttpError(error.message, 400);
      }

      throw error;
    }

    return getCampaignDetailsByIdInternal(campaignId, client);
  });
}

export async function listEventTemplates() {
  const result = await query(selectEventTemplatesQuery);
  const templates = result.rows.map(mapEventTemplateRow);

  return Promise.all(
    templates.map(async (template) => ({
      ...template,
      options: await listEventTemplateOptionsInternal(template.id),
    }))
  );
}

export async function listCharacterEvents(characterId) {
  await requireCharacterForRead(characterId);
  const result = await query(selectCharacterEventsQuery, [characterId]);
  return result.rows.map(mapEventSummaryRow);
}

export async function getEventById(eventId) {
  return getEventByIdInternal(eventId);
}

export async function findActiveEventForCharacter(campaignId, characterId, executor = { query }) {
  const normalizedCampaignId = Number(campaignId);
  const normalizedCharacterId = Number(characterId);

  if (!Number.isInteger(normalizedCampaignId) || normalizedCampaignId <= 0) {
    throw createHttpError('campaignId must be a positive integer', 400);
  }

  if (!Number.isInteger(normalizedCharacterId) || normalizedCharacterId <= 0) {
    throw createHttpError('characterId must be a positive integer', 400);
  }

  const result = await executor.query(selectActiveEventByCampaignAndCharacterQuery, [
    normalizedCampaignId,
    normalizedCharacterId,
  ]);
  const row = result.rows[0] || null;

  if (!row) {
    return null;
  }

  return getEventByIdInternal(Number(row.id), executor);
}

async function createEventInstanceInternal(input, client) {
    const campaignId = Number(input.campaign_id);
    const characterId = Number(input.character_id);

    if (!Number.isInteger(campaignId) || campaignId <= 0) {
      throw createHttpError('campaign_id must be a positive integer', 400);
    }

    if (!Number.isInteger(characterId) || characterId <= 0) {
      throw createHttpError('character_id must be a positive integer', 400);
    }

    await requireAccountIfProvided(input.created_by_account_id ?? null, client);
    await requireActiveCampaign(campaignId, client);
    await requireCharacterForGameplay(characterId, client);
    await requireActiveCampaignMembership(campaignId, characterId, client);

    const template = await requireActiveEventTemplate(
      {
        template_key: input.template_key ?? null,
        template_id: input.template_id ?? null,
      },
      client
    );
    const templateOptions = await listEventTemplateOptionsInternal(template.id, client);

    if (templateOptions.length === 0) {
      throw createHttpError('That event template does not have any active options', 409);
    }

    let eventId;

    try {
      const insertResult = await client.query(insertEventInstanceQuery, [
        campaignId,
        characterId,
        template.id,
        'active',
        template.prompt_text,
        input.created_by_account_id ?? null,
      ]);
      eventId = Number(insertResult.rows[0].id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw createHttpError('This character already has an open event in that campaign', 409);
      }

      if (isForeignKeyViolation(error)) {
        throw createHttpError('Event creation references an invalid campaign, character, template, or account', 400);
      }

      throw error;
    }

    for (const option of templateOptions) {
      await client.query(insertEventOptionQuery, [
        eventId,
        option.id,
        option.option_key,
        option.label,
        option.description,
        option.sort_order,
        option.resolution_kind,
        JSON.stringify(option.resolution_payload_json ?? {}),
        option.is_active,
      ]);
    }

    await insertEventLogInternal(
      eventId,
      input.created_by_account_id ?? null,
      'created',
      `Created event from template ${template.key}.`,
      {
        template: {
          id: template.id,
          key: template.key,
          name: template.name,
        },
        option_count: templateOptions.length,
      },
      client
    );

    await recordGameplayHistory(
      {
        character_id: characterId,
        actor_account_id: input.created_by_account_id ?? null,
        source_type: 'event',
        source_entity_id: eventId,
        action_key: 'event_created',
        summary: `Created event ${template.name}.`,
        input_json: {
          campaign_id: campaignId,
          template: {
            id: template.id,
            key: template.key,
            name: template.name,
          },
        },
        result_json: {
          status: 'active',
          prompt_text: template.prompt_text,
          option_keys: templateOptions.map((option) => option.option_key),
        },
        xp_delta: 0,
      },
      client
    );

  return getEventByIdInternal(eventId, client);
}

export async function createEventInstance(input, executor = null) {
  if (executor) {
    return createEventInstanceInternal(input, executor);
  }

  return withTransaction(async (client) => createEventInstanceInternal(input, client));
}

export async function chooseEventOption(eventId, input) {
  return withTransaction(async (client) => {
    if (!Number.isInteger(Number(eventId)) || Number(eventId) <= 0) {
      throw createHttpError('eventId must be a positive integer', 400);
    }

    await requireAccountIfProvided(input.actor_account_id ?? null, client);
    const event = await getEventForUpdate(eventId, client);

    if (!event.campaign.is_active) {
      throw createHttpError('Campaign is inactive', 409);
    }

    await requireCharacterForGameplay(event.character.id, client);

    if (event.status !== 'active') {
      throw createHttpError(`This event is ${event.status} and cannot accept another choice`, 409);
    }

    const options = await listEventOptionsInternal(event.id, client);
    const option = selectEventOption(options, {
      option_id: input.option_id ?? null,
      option_key: input.option_key ?? null,
    });

    await insertEventLogInternal(
      event.id,
      input.actor_account_id ?? null,
      'choice_submitted',
      `Selected option ${option.option_key}.`,
      {
        option: {
          id: option.id,
          option_key: option.option_key,
          label: option.label,
        },
      },
      client
    );

    const resolution = await resolveEventOption({
      eventInstance: {
        id: event.id,
        campaign_id: event.campaign.id,
        character_id: event.character.id,
        character_name: event.character.name,
      },
      option,
      executor: client,
    });

    await client.query(updateEventInstanceResolutionQuery, [
      event.id,
      option.id,
      option.option_key,
      resolution.outcome_summary,
      JSON.stringify({
        option: {
          id: option.id,
          option_key: option.option_key,
          label: option.label,
        },
        ...resolution.result_json,
      }),
    ]);

    await insertEventLogInternal(
      event.id,
      input.actor_account_id ?? null,
      'resolved',
      resolution.outcome_summary,
      {
        option: {
          id: option.id,
          option_key: option.option_key,
          label: option.label,
        },
        ...resolution.result_json,
      },
      client
    );

    await recordGameplayHistory(
      {
        character_id: event.character.id,
        actor_account_id: input.actor_account_id ?? null,
        source_type: 'event',
        source_entity_id: event.id,
        action_key: 'event_resolved',
        summary: resolution.outcome_summary,
        input_json: {
          option: {
            id: option.id,
            option_key: option.option_key,
            label: option.label,
          },
        },
        result_json: {
          event_id: event.id,
          template: event.template,
          ...resolution.result_json,
        },
        xp_delta: Number(resolution.result_json?.progression?.amount_granted ?? 0),
      },
      client
    );

    return getEventByIdInternal(event.id, client);
  });
}
