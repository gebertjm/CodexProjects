const ACTION_VERBS = Object.freeze([
  {
    id: 'observe',
    label: 'Observe',
    aliases: ['look', 'look around', 'watch', 'scan', 'notice'],
    description: 'Take in the scene without committing to a risky action.',
    typical_skills: ['perception', 'insight'],
    target_tags: ['scene', 'person', 'object', 'place', 'hazard', 'environmental_feature'],
    sms_examples: ['look around', 'watch the innkeeper'],
  },
  {
    id: 'investigate',
    label: 'Investigate',
    aliases: ['inspect', 'examine', 'study', 'check', 'read'],
    description: 'Study a target for meaning, evidence, or inconsistency.',
    typical_skills: ['investigation'],
    target_tags: ['object', 'scene', 'clue', 'hazard', 'trail', 'container'],
    sms_examples: ['inspect the wagon', 'examine the tracks'],
  },
  {
    id: 'search',
    label: 'Search',
    aliases: ['find', 'look for', 'seek', 'check for'],
    description: 'Search for people, objects, clues, or hidden details.',
    typical_skills: ['perception', 'investigation'],
    target_tags: ['object', 'scene', 'clue', 'container', 'person', 'place'],
    sms_examples: ['search the cargo', 'look for survivors'],
  },
  {
    id: 'track',
    label: 'Track',
    aliases: ['follow', 'trail', 'trace', 'pursue'],
    description: 'Follow signs of movement or a trail.',
    typical_skills: ['survival'],
    target_tags: ['trail', 'clue', 'place', 'exit'],
    sms_examples: ['follow the tracks', 'trail the footprints'],
  },
  {
    id: 'talk',
    label: 'Talk',
    aliases: ['speak', 'ask', 'question', 'approach'],
    description: 'Speak with a person or social target.',
    typical_skills: ['persuasion', 'insight', 'intimidation'],
    target_tags: ['person'],
    sms_examples: ['talk to the innkeeper', 'ask the survivor'],
  },
  {
    id: 'move',
    label: 'Move',
    aliases: ['go', 'enter', 'leave', 'travel', 'head', 'continue', 'return'],
    description: 'Move to another place or continue along a route.',
    typical_skills: [],
    target_tags: ['exit', 'place', 'trail'],
    sms_examples: ['move toward the inn', 'continue to Dunmere'],
  },
  {
    id: 'use',
    label: 'Use',
    aliases: ['interact', 'activate', 'apply', 'open'],
    description: 'Use or manipulate an object or feature.',
    typical_skills: ['sleight_of_hand', 'arcana'],
    target_tags: ['object', 'container', 'hazard', 'environmental_feature'],
    sms_examples: ['use the key', 'open the crate'],
  },
  {
    id: 'help',
    label: 'Help',
    aliases: ['assist', 'aid', 'support'],
    description: 'Help another character or stabilize a situation.',
    typical_skills: ['medicine', 'persuasion'],
    target_tags: ['person', 'scene'],
    sms_examples: ['help the survivor', 'aid the guards'],
  },
  {
    id: 'wait',
    label: 'Wait',
    aliases: ['rest', 'hold', 'stay', 'pause'],
    description: 'Wait, keep watch, or let the moment breathe.',
    typical_skills: [],
    target_tags: ['scene'],
    sms_examples: ['wait', 'keep watch'],
  },
]);

const aliasMap = new Map();

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ');
}

for (const verb of ACTION_VERBS) {
  aliasMap.set(normalize(verb.id), verb);
  aliasMap.set(normalize(verb.label), verb);

  for (const alias of verb.aliases) {
    aliasMap.set(normalize(alias), verb);
  }
}

export function listActionVerbs() {
  return ACTION_VERBS.map((verb) => ({
    ...verb,
    aliases: [...verb.aliases],
    typical_skills: [...verb.typical_skills],
    target_tags: [...verb.target_tags],
    sms_examples: [...verb.sms_examples],
  }));
}

export function resolveActionVerb(value) {
  const normalized = normalize(value);

  if (!normalized) {
    return null;
  }

  if (aliasMap.has(normalized)) {
    return aliasMap.get(normalized);
  }

  const tokenMatch = [...aliasMap.entries()]
    .sort((left, right) => right[0].length - left[0].length)
    .find(([alias]) => normalized === alias || normalized.startsWith(`${alias} `));

  return tokenMatch?.[1] ?? null;
}

export function actionVerbFromText(value) {
  const normalized = normalize(value);

  if (!normalized) {
    return null;
  }

  const exact = resolveActionVerb(normalized);

  if (exact) {
    return exact;
  }

  return [...aliasMap.entries()]
    .sort((left, right) => right[0].length - left[0].length)
    .find(([alias]) => normalized.includes(alias))?.[1] ?? null;
}

export function normalizeActionText(value) {
  return normalize(value);
}

export function isKnownActionVerb(value) {
  return Boolean(resolveActionVerb(value));
}

