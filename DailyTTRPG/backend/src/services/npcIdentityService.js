function asSet(values = []) {
  return new Set(
    values
      .map((value) => (typeof value === 'string' ? value : value?.knowledge_id ?? value?.knowledge_key))
      .filter(Boolean)
  );
}

export function resolveNpcDisplayIdentity({ npc, knownFacts = [] }) {
  const identity = npc.identity_json ?? npc.identity ?? {};
  const knownFactIds = asSet(knownFacts);
  const nameKnowledgeIds = [
    identity.knowledge_id_for_true_name,
    ...(identity.known_if_character_has_knowledge ?? []),
  ].filter(Boolean);
  const publiclyKnown = Boolean(identity.publicly_known);
  const trueNameKnown =
    publiclyKnown || nameKnowledgeIds.some((knowledgeId) => knownFactIds.has(knowledgeId));
  const trueName = npc.true_name ?? npc.name;
  const revealPolicy = identity.reveal_policy ?? 'role_until_known';

  if (trueNameKnown && trueName) {
    return {
      display_name: trueName,
      true_name_known: true,
      label_source: publiclyKnown ? 'publicly_known' : 'character_knowledge',
    };
  }

  if (revealPolicy === 'unknown_until_known' && npc.unknown_label) {
    return {
      display_name: npc.unknown_label,
      true_name_known: false,
      label_source: 'unknown_label',
    };
  }

  if (npc.public_role_label) {
    return {
      display_name: npc.public_role_label,
      true_name_known: false,
      label_source: 'public_role_label',
    };
  }

  return {
    display_name: npc.unknown_label ?? npc.role ?? 'someone nearby',
    true_name_known: false,
    label_source: 'unknown_label',
  };
}

export function npcAliasList(npc, displayName) {
  return [
    displayName,
    npc.public_role_label,
    npc.unknown_label,
    ...(npc.aliases_json ?? npc.aliases ?? []),
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter((value, index, all) => value && all.indexOf(value) === index);
}
