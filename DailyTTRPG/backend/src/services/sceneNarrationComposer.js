function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function compact(values) {
  return values
    .map(cleanText)
    .filter((value, index, all) => value && all.indexOf(value) === index);
}

function stripTerminalPunctuation(value) {
  return cleanText(value).replace(/[.!?]+$/g, '').trim();
}

function ensureSentence(value) {
  const text = cleanText(value);
  if (!text) {
    return '';
  }
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededPick(options, seedParts) {
  const values = Array.isArray(options) ? options.filter(Boolean) : [];
  if (values.length === 0) {
    return null;
  }
  const seed = seedParts.map((part) => String(part ?? '')).join('|');
  return values[hashString(seed) % values.length];
}

function sentenceJoin(items) {
  const values = compact(items).map(stripTerminalPunctuation).filter(Boolean);
  if (values.length === 0) {
    return '';
  }
  if (values.length === 1) {
    return values[0];
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function lowerFirst(value) {
  const text = cleanText(value);
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function sameStartingPhrase(text, phrase) {
  const normalizedText = cleanText(text).toLowerCase();
  const normalizedPhrase = cleanText(phrase).toLowerCase();
  if (!normalizedText || !normalizedPhrase) {
    return false;
  }
  return new RegExp(`^${escapeRegExp(normalizedPhrase)}\\b`, 'i').test(normalizedText);
}

function stripLeadingArticle(value) {
  return cleanText(value).replace(/^(?:a|an|the)\s+/i, '').trim();
}

function mentionRegex(term) {
  const words = cleanText(term).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return null;
  }
  return new RegExp(`(^|[^a-z0-9])${words.map(escapeRegExp).join('\\s+')}(?=$|[^a-z0-9])`, 'i');
}

function textMentionsTerm(text, term) {
  const regex = mentionRegex(term);
  return regex ? regex.test(cleanText(text)) : false;
}

function npcKey(npc, index = 0) {
  return cleanText(npc?.npc_id ?? npc?.npcId ?? npc?.key ?? npc?.display_name ?? npc?.displayName ?? index);
}

function npcMentionTerms(npc, npcIdentityIndex = []) {
  const key = npcKey(npc);
  const identity = (npcIdentityIndex ?? []).find((entry) => cleanText(entry?.npc_id) === key);
  const baseTerms = compact([
    npc?.display_name,
    npc?.displayName,
    npc?.public_role_label,
    npc?.unknown_label,
    ...(identity?.match_terms ?? []),
  ]);
  const terms = [];
  for (const term of baseTerms) {
    terms.push(term);
    const withoutArticle = stripLeadingArticle(term);
    if (withoutArticle && withoutArticle !== term) {
      terms.push(withoutArticle);
    }
  }
  return compact(terms).filter((term) => term.length >= 3);
}

function createNpcMentionTracker(npcs = [], npcIdentityIndex = [], pkg = null) {
  const enabled = pkg?.composition_notes?.allow_repeated_npc_mentions !== true;
  const entries = (npcs ?? [])
    .map((npc, index) => ({
      key: npcKey(npc, index),
      npc,
      terms: npcMentionTerms(npc, npcIdentityIndex),
    }))
    .filter((entry) => entry.key && entry.terms.length > 0);
  const mentioned = new Set();

  function markFromText(text) {
    if (!enabled) {
      return;
    }
    for (const entry of entries) {
      if (entry.terms.some((term) => textMentionsTerm(text, term))) {
        mentioned.add(entry.key);
      }
    }
  }

  return {
    enabled,
    markFromText,
    filterUnmentionedNpcs(values = []) {
      if (!enabled) {
        return values ?? [];
      }
      return (values ?? []).filter((npc, index) => !mentioned.has(npcKey(npc, index)));
    },
    wouldRepeatMention(text) {
      if (!enabled) {
        return false;
      }
      return entries.some(
        (entry) =>
          mentioned.has(entry.key) &&
          entry.terms.some((term) => textMentionsTerm(text, term))
      );
    },
  };
}

function sceneKey(scene) {
  return cleanText(scene?.key ?? scene?.slug ?? scene?.scene_key ?? scene?.scene_id);
}

const GREYVALE_NARRATION = {
  'broken-caravan-site': {
    version: 1,
    base: [
      'You stand where the Grey Road bends sharply toward the trees. A broken caravan lies half in the roadside mud, its torn canvas hanging from the wagon ribs and its cargo scattered where frightened hands left it.',
      'The wreck does not sit like an ordinary accident. The split wood, churned ruts, and abandoned supplies make the road feel interrupted rather than merely damaged.',
    ],
    returnVisit: [
      'The broken caravan is still where you left it, settled into the same uneasy roadside silence.',
      'You return to the bend in the Grey Road, where the wrecked caravan waits in the mud like an unfinished account.',
    ],
    sensory: [
      'The air smells of wet canvas, churned mud, and old smoke.',
      'Wind moves through the torn canvas with a dry, restless snap.',
      'Mist clings low to the roadside, softening the trees into dark shapes.',
    ],
    environmentVariants: [
      {
        weather: ['rain', 'drizzle', 'storm'],
        text: 'Rain darkens the torn canvas and turns the roadside mud slick beneath your boots.',
      },
      {
        timeOfDay: ['evening', 'night'],
        text: 'The fading light leaves the wagon ribs stark against the treeline.',
      },
      {
        weather: ['clear'],
        text: 'Clear air makes the damage easy to read, but the quiet around it feels no kinder.',
      },
    ],
    opportunities: {
      subtle: [
        'The wagon damage, the scattered cargo, and the marks in the mud each seem to tell a different part of the story.',
        'The most revealing details may be the ones the road has not yet managed to hide.',
        'The road ahead is quiet, but the signs left behind are not.',
      ],
      softExplicit: [
        'Between the broken caravan, the spilled cargo, the muddy tracks, and any witness willing to speak, there are several places to begin.',
        'A closer look at the wreckage, the tracks, or the survivor account might narrow the truth.',
        'Nothing here points to a single answer; the road, the wreckage, and the shaken witnesses all suggest different lines of inquiry.',
      ],
    },
    affordances: {
      caravan_wreck:
        'The wagon itself draws the eye: cracked frame, torn canvas, and damage that looks too deliberate to blame on a bad road.',
      scattered_cargo:
        'Crates and bundles lie spilled near the wheels, some split open, some dragged just far enough to raise questions.',
      missing_travelers_signs:
        'Small signs of the missing travelers remain in the mud and debris, easy to overlook if you rush the scene.',
      strange_tracks:
        'Fresh tracks cut away from the road toward the trees, sharper and deeper than the softer caravan ruts.',
      road_to_inn:
        'The Grey Road continues toward Dunmere and the promise of witnesses, shelter, and rumors.',
    },
  },
};

function narrationPackageFor(scene) {
  return (
    scene?.narration ??
    scene?.metadata?.narration ??
    GREYVALE_NARRATION[sceneKey(scene)] ??
    null
  );
}

function environmentText(environment, pkg, seedParts) {
  const variants = pkg?.environmentVariants ?? pkg?.environment_variants ?? [];
  const match = variants.find((variant) => {
    const conditions = variant.when ?? variant;
    const weather = environment?.weather ? String(environment.weather).toLowerCase() : null;
    const timeOfDay = environment?.time_of_day
      ? String(environment.time_of_day).toLowerCase()
      : null;
    const season = environment?.season ? String(environment.season).toLowerCase() : null;
    const timeConditions = conditions.timeOfDay ?? conditions.time_of_day;
    const weatherOk =
      !conditions.weather ||
      conditions.weather.map((entry) => String(entry).toLowerCase()).includes(weather);
    const timeOk =
      !timeConditions ||
      timeConditions.map((entry) => String(entry).toLowerCase()).includes(timeOfDay);
    const seasonOk =
      !conditions.season ||
      conditions.season.map((entry) => String(entry).toLowerCase()).includes(season);
    return weatherOk && timeOk && seasonOk;
  });

  if (match?.text) {
    return cleanText(match.text);
  }

  const sensory = seededPick(pkg?.sensory ?? [], [...seedParts, 'sensory']);
  if (sensory) {
    return cleanText(sensory);
  }

  if (environment?.summary) {
    return `The scene carries the feel of ${lowerFirst(environment.summary).replaceAll(' · ', ', ')}.`;
  }
  return '';
}

function npcText(npcs, seedParts, mentionTracker = null) {
  const visible = (mentionTracker?.filterUnmentionedNpcs(npcs) ?? npcs ?? [])
    .filter((npc) => cleanText(npc.display_name ?? npc.displayName))
    .slice()
    .sort((left, right) => {
      const leftPriority = Number(left.priority ?? 0);
      const rightPriority = Number(right.priority ?? 0);
      return rightPriority - leftPriority;
    })
    .slice(0, 3);

  if (visible.length === 0) {
    return '';
  }

  const lines = visible.map((npc) => {
    const name = cleanText(npc.display_name ?? npc.displayName);
    const activity = stripTerminalPunctuation(
      npc.activity_text ?? npc.activityText ?? npc.activity
    );
    if (activity) {
      if (sameStartingPhrase(activity, name)) {
        return lowerFirst(activity);
      }
      return `${name} ${lowerFirst(activity)}`;
    }
    return `${name} remains close enough to matter`;
  });

  const lead = seededPick(
    [
      'Nearby,',
      'In the middle of it,',
      'Against the uneasy quiet,',
    ],
    [...seedParts, 'npc-lead']
  );
  return `${lead} ${sentenceJoin(lines)}.`;
}

function affordanceText(affordances, pkg, seedParts, mentionTracker = null) {
  const proseById = pkg?.affordances ?? {};
  const visible = (affordances ?? [])
    .filter((affordance) => affordance.type !== 'npc' && cleanText(affordance.label))
    .slice()
    .sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0))
    .slice(0, 4);

  if (visible.length === 0) {
    return '';
  }

  const authored = visible
    .map((affordance) => {
      const id = cleanText(affordance.affordance_id ?? affordance.affordanceId);
      return cleanText(proseById[id] ?? affordance.narration?.default);
    })
    .filter(Boolean)
    .filter((text) => !mentionTracker?.wouldRepeatMention(text))
    .slice(0, 2);

  if (authored.length > 0) {
    return authored.map(ensureSentence).join(' ');
  }

  const labels = visible
    .map((affordance) => cleanText(affordance.label))
    .filter(Boolean)
    .filter((text) => !mentionTracker?.wouldRepeatMention(text));
  if (labels.length === 0) {
    return '';
  }
  const lead = seededPick(
    [
      'Your attention catches on',
      'The clearest details are',
      'The scene draws your eye toward',
    ],
    [...seedParts, 'affordance-lead']
  );
  return `${lead} ${sentenceJoin(labels)}.`;
}

function latestResultText(latestResult) {
  const text = cleanText(latestResult?.narration ?? latestResult?.summary ?? latestResult?.text);
  if (!text) {
    return '';
  }
  return `The scene has shifted with what just happened: ${stripTerminalPunctuation(text)}.`;
}

function opportunityText(affordances, objective, pkg, seedParts, mentionTracker = null) {
  const authored = pkg?.opportunities?.subtle ?? pkg?.opportunity_variants?.subtle;
  const authoredOptions = Array.isArray(authored)
    ? authored.filter((text) => !mentionTracker?.wouldRepeatMention(text))
    : [];
  const picked = seededPick(authoredOptions, [...seedParts, 'opportunity', 'subtle']);
  if (picked) {
    return cleanText(picked);
  }

  const labels = (affordances ?? [])
    .filter((affordance) => affordance.type !== 'npc')
    .map((affordance) => cleanText(affordance.label))
    .filter(Boolean)
    .filter((text) => !mentionTracker?.wouldRepeatMention(text))
    .slice(0, 4);
  if (labels.length > 0) {
    return `${sentenceJoin(labels)} hold the clearest details in the scene.`;
  }

  if (objective?.title && !mentionTracker?.wouldRepeatMention(objective.title)) {
    return `For now, the scene keeps circling the same question: ${lowerFirst(objective.title)}.`;
  }
  return '';
}

function fallbackBase(scene) {
  return cleanText(scene?.description ?? scene?.summary ?? scene?.title);
}

function normalizeParagraph(paragraph, defaultKind) {
  const text = cleanText(paragraph?.text ?? paragraph?.narration ?? paragraph);
  if (!text) {
    return null;
  }
  return {
    ...(typeof paragraph === 'object' && paragraph !== null ? paragraph : {}),
    kind: paragraph?.kind ?? defaultKind,
    text,
  };
}

function appendParagraph(paragraphs, mentionTracker, paragraph, defaultKind) {
  const normalized = normalizeParagraph(paragraph, defaultKind);
  if (!normalized) {
    return;
  }
  paragraphs.push(normalized);
  mentionTracker?.markFromText(normalized.text);
}

function buildNarrationParagraphs({
  base,
  pkg,
  seedParts,
  environment,
  visibleNpcs,
  visibleAffordances,
  npcIdentityIndex,
  objective,
  latestResult,
  automaticObservations,
  passiveDiscoveries,
}) {
  const mentionTracker = createNpcMentionTracker(visibleNpcs, npcIdentityIndex, pkg);
  const paragraphs = [];
  appendParagraph(paragraphs, mentionTracker, { kind: 'setting', text: base }, 'setting');
  appendParagraph(
    paragraphs,
    mentionTracker,
    { kind: 'environment', text: environmentText(environment, pkg, seedParts) },
    'environment'
  );
  for (const observation of automaticObservations ?? []) {
    appendParagraph(paragraphs, mentionTracker, observation, 'automatic_observation');
  }
  for (const discovery of passiveDiscoveries ?? []) {
    appendParagraph(paragraphs, mentionTracker, discovery, 'passive_discovery');
  }
  appendParagraph(
    paragraphs,
    mentionTracker,
    { kind: 'presence', text: npcText(visibleNpcs, seedParts, mentionTracker) },
    'presence'
  );
  appendParagraph(
    paragraphs,
    mentionTracker,
    { kind: 'focus', text: affordanceText(visibleAffordances, pkg, seedParts, mentionTracker) },
    'focus'
  );
  appendParagraph(
    paragraphs,
    mentionTracker,
    { kind: 'consequence', text: latestResultText(latestResult) },
    'consequence'
  );
  appendParagraph(
    paragraphs,
    mentionTracker,
    {
      kind: 'opportunity',
      text: opportunityText(visibleAffordances, objective, pkg, seedParts, mentionTracker),
    },
    'opportunity'
  );
  return paragraphs;
}

export function composeSceneNarration({
  scene,
  campaign,
  environment,
  visibleNpcs = [],
  visibleAffordances = [],
  npcIdentityIndex = [],
  objective,
  sceneResultFeed,
  automaticObservations = [],
  passiveDiscoveries = [],
  visitContext = {},
  now = new Date(),
} = {}) {
  const pkg = narrationPackageFor(scene);
  const latestResult = sceneResultFeed?.latest_result ?? sceneResultFeed?.latestResult ?? null;
  const hasLatest = Boolean(latestResult);
  const mode = visitContext.firstVisit === false && !hasLatest ? 'return_visit' : hasLatest ? 'refreshed' : 'full';
  const seedParts = [
    campaign?.campaign_instance_id ?? campaign?.campaign_id,
    scene?.scene_id,
    sceneKey(scene),
    sceneResultFeed?.latest_result?.beat_number ?? sceneResultFeed?.latestResult?.beatNumber,
    visitContext.visitCount ?? 1,
    mode,
    pkg?.version ?? 1,
  ];

  const baseOptions =
    mode === 'return_visit'
      ? pkg?.returnVisit ?? pkg?.return_visit ?? pkg?.base
      : pkg?.base;
  const base = seededPick(baseOptions ?? [], [...seedParts, 'base']) ?? fallbackBase(scene);
  const paragraphs = buildNarrationParagraphs({
    base,
    pkg,
    seedParts,
    environment,
    visibleNpcs,
    visibleAffordances,
    npcIdentityIndex,
    objective,
    latestResult,
    automaticObservations,
    passiveDiscoveries,
  });

  const fullBase = seededPick(pkg?.base ?? [], [...seedParts, 'full-base']) ?? fallbackBase(scene);
  const fullParagraphs = buildNarrationParagraphs({
    base: fullBase,
    pkg,
    seedParts: [...seedParts, 'full'],
    environment,
    visibleNpcs,
    visibleAffordances,
    npcIdentityIndex,
    objective,
    latestResult,
    automaticObservations,
    passiveDiscoveries,
  });

  return {
    mode,
    voice: 'second_person_present',
    title: cleanText(scene?.title ?? scene?.name) || 'Current Scene',
    summary: cleanText(scene?.summary) || cleanText(base),
    paragraphs,
    full_current_narration_available: mode !== 'full',
    full_current_narration: {
      paragraphs: fullParagraphs.length > 0 ? fullParagraphs : paragraphs,
    },
    narration_version: pkg?.version ?? 1,
    composed_at: now.toISOString(),
  };
}

function referenceEntry({ id, type, label, description, dialogue_scene_id, dialogue_title }) {
  const safeId = cleanText(id);
  const safeLabel = cleanText(label);
  if (!safeId || !safeLabel) {
    return null;
  }
  const entry = {
    id: safeId,
    type,
    label: safeLabel,
    description: stripTerminalPunctuation(description) || null,
  };
  const dialogueSceneId = cleanText(dialogue_scene_id);
  if (dialogueSceneId) {
    entry.dialogue_scene_id = dialogueSceneId;
    entry.dialogue_title = cleanText(dialogue_title) || null;
  }
  return entry;
}

function entryFingerprint(entry) {
  return `${cleanText(entry?.type).toLowerCase()}:${cleanText(entry?.label).toLowerCase()}`;
}

function pushUniqueByLabel(list, entry, seen) {
  if (!entry) {
    return false;
  }
  const fingerprint = entryFingerprint(entry);
  if (!fingerprint || seen.has(fingerprint)) {
    return false;
  }
  seen.add(fingerprint);
  list.push(entry);
  return true;
}

export function buildSceneReference({
  visibleNpcs = [],
  visibleAffordances = [],
  closerLooks = [],
} = {}) {
  const people = [];
  const seenPeople = new Set();
  for (const npc of visibleNpcs ?? []) {
    pushUniqueByLabel(
      people,
      referenceEntry({
        id: `npc:${npc.npc_id ?? npc.npcId}`,
        type: 'npc',
        label: npc.display_name ?? npc.displayName,
        description: npc.activity_text ?? npc.activityText ?? npc.activity,
        dialogue_scene_id: npc.dialogue_scene_id,
        dialogue_title: npc.dialogue_title,
      }),
      seenPeople
    );
  }

  const notableThings = [];
  const visiblePaths = [];
  const actionTargets = [];
  const seenTargets = new Set();
  const seenNotableThings = new Set();
  const seenVisiblePaths = new Set();

  for (const person of people) {
    pushUniqueByLabel(
      actionTargets,
      {
        id: person.id,
        type: 'npc',
        label: person.label,
        insert_text: person.label,
        dialogue_scene_id: person.dialogue_scene_id,
        dialogue_title: person.dialogue_title,
      },
      seenTargets
    );
  }

  for (const affordance of visibleAffordances ?? []) {
    const id = cleanText(affordance.affordance_id ?? affordance.affordanceId);
    const type = cleanText(affordance.type) || 'other';
    const entry = referenceEntry({
      id,
      type,
      label: affordance.label,
      description: affordance.description,
      dialogue_scene_id: affordance.dialogue_scene_id,
      dialogue_title: affordance.dialogue_title,
    });
    if (!entry) {
      continue;
    }

    if (type === 'place' || type === 'exit') {
      pushUniqueByLabel(visiblePaths, entry, seenVisiblePaths);
    } else if (type !== 'npc') {
      pushUniqueByLabel(notableThings, entry, seenNotableThings);
    }

    pushUniqueByLabel(
      actionTargets,
      {
        id: entry.id,
        type: entry.type,
        label: entry.label,
        insert_text: entry.label,
        dialogue_scene_id: entry.dialogue_scene_id,
        dialogue_title: entry.dialogue_title,
      },
      seenTargets
    );
  }

  return {
    people_nearby: people,
    notable_things: notableThings,
    visible_paths: visiblePaths,
    action_targets: actionTargets,
    closer_looks: closerLooks,
  };
}

export function buildActionComposerModel(sceneReference) {
  const focusByTarget = new Map();
  for (const look of sceneReference?.closer_looks ?? []) {
    const targetId = cleanText(look.target_id);
    if (targetId) {
      focusByTarget.set(targetId, look);
    }
  }

  return {
    target_chips: (sceneReference?.action_targets ?? []).map((target) => ({
      id: target.id,
      type: target.type,
      label: target.label,
      insert_text: target.insert_text ?? target.label,
      free_focus_state: focusByTarget.get(target.id)?.status ?? null,
      known_context: focusByTarget.get(target.id)?.result?.summary
        ? [focusByTarget.get(target.id).result.summary]
        : [],
    })),
  };
}
