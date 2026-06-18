import {
  actionVerbFromText,
  listActionVerbs,
  normalizeActionText,
} from './smsActionVerbRegistry.js';
import {
  compactCandidate,
  logSmsIntentResolution,
} from './smsExplorationAffordanceService.js';

const COMMANDS = new Set(['HELP', 'STATUS', 'LEVEL', 'STOP', 'START']);
const VERB_WORDS = new Set(
  listActionVerbs().flatMap((verb) => [
    ...words(verb.id),
    ...words(verb.label),
    ...verb.aliases.flatMap(words),
  ])
);

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function words(value) {
  return normalizeActionText(value)
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !['the', 'a', 'an', 'to', 'with', 'for', 'of', 'around'].includes(word));
}

function targetScore(inputWords, affordance) {
  const targetInputWords = inputWords.filter((word) => !VERB_WORDS.has(word));
  const aliasWords = unique([
    ...words(affordance.label),
    ...normalizeArray(affordance.aliases).flatMap(words),
  ]).filter((word) => !VERB_WORDS.has(word));
  const matches = targetInputWords.filter((word) => aliasWords.includes(word));

  if (matches.length === 0) {
    return 0;
  }

  return Math.min(0.55, 0.2 + matches.length * 0.15);
}

function hasExplicitTargetWords(inputWords) {
  return inputWords.some((word) => !VERB_WORDS.has(word));
}

function candidateFrom(affordance, action, confidence, reason) {
  return {
    verb: action.verb,
    target_affordance_id: affordance.affordance_key,
    interaction_id: action.interaction_id ?? null,
    transition_id: action.transition_id ?? null,
    action_key: action.action_key,
    action: action.runtime_action,
    label: action.runtime_action?.label ?? affordance.label,
    confidence,
    reason,
    affordance,
  };
}

function verbsCompatible(inputVerb, actionVerb, affordance) {
  if (!inputVerb || !actionVerb || inputVerb.id === actionVerb) {
    return true;
  }

  const tags = new Set(normalizeArray(affordance.tags));

  if (
    ['observe', 'investigate', 'search'].includes(inputVerb.id) &&
    ['observe', 'investigate', 'search'].includes(actionVerb) &&
    (tags.has('object') || tags.has('scene') || tags.has('clue') || tags.has('container'))
  ) {
    return true;
  }

  if (
    ['investigate', 'search', 'track'].includes(inputVerb.id) &&
    ['investigate', 'search', 'track'].includes(actionVerb) &&
    (tags.has('trail') || tags.has('clue'))
  ) {
    return true;
  }

  return false;
}

function rankCandidates(candidates) {
  return candidates
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, 4);
}

export async function resolveSmsExplorationIntent({
  session = null,
  userText,
  affordances = [],
  sceneId = null,
  log = true,
} = {}) {
  const normalized = normalizeActionText(userText);
  const upper = String(userText ?? '').trim().toUpperCase();

  if (!normalized) {
    return {
      status: 'invalid',
      candidates: [],
      clarification: null,
      reason: 'empty_input',
    };
  }

  if (COMMANDS.has(upper)) {
    return {
      status: 'out_of_scope',
      candidates: [],
      clarification: null,
      reason: 'command',
    };
  }

  const activeAffordances = normalizeArray(affordances).filter(
    (affordance) => !['hidden', 'locked', 'resolved'].includes(affordance.state)
  );
  const inputWords = words(normalized);
  const verb = actionVerbFromText(normalized);
  const explicitTargetWords = hasExplicitTargetWords(inputWords);
  const candidates = [];

  for (const affordance of activeAffordances) {
    const score = targetScore(inputWords, affordance);

    for (const action of normalizeArray(affordance.available_actions)) {
      if (verb && !verbsCompatible(verb, action.verb, affordance)) {
        continue;
      }

      let confidence = score;
      const reasons = [];

      if (verb && action.verb === verb.id && score > 0) {
        confidence += 0.4;
        reasons.push(`matched verb ${verb.id}`);
      }

      if (score > 0) {
        reasons.push(`matched target ${affordance.label}`);
      }

      if (!verb && score > 0 && affordance.available_actions.length === 1) {
        confidence += 0.15;
        reasons.push('target-only single obvious action');
      }

      if (verb && score === 0 && action.verb === verb.id && !explicitTargetWords) {
        confidence += 0.4;
        reasons.push('verb-only candidate');
      }

      if (confidence >= 0.35) {
        candidates.push(candidateFrom(
          affordance,
          action,
          Number(confidence.toFixed(2)),
          reasons.join('; ')
        ));
      }
    }
  }

  const ranked = rankCandidates(candidates);
  let status = 'invalid';
  let chosenCandidate = null;
  let clarification = null;

  if (ranked.length === 1 && ranked[0].confidence >= 0.35) {
    status = 'resolved';
    chosenCandidate = ranked[0];
  } else if (ranked.length > 1) {
    const [first, second] = ranked;

    if (first.confidence >= 0.75 && first.confidence - second.confidence >= 0.25) {
      status = 'resolved';
      chosenCandidate = first;
    } else {
      status = 'ambiguous';
      clarification = {
        question: verb?.id === 'talk' ? 'Who do you approach?' : 'What do you focus on?',
        candidates: ranked,
        options: ranked.map((candidate) => candidate.label),
      };
    }
  }

  const result = {
    status,
    candidates: ranked,
    chosen_candidate: chosenCandidate,
    clarification,
    confidence: chosenCandidate?.confidence ?? ranked[0]?.confidence ?? 0,
    reason:
      chosenCandidate?.reason ??
      (status === 'ambiguous' ? 'multiple plausible affordances' : 'no matching affordance'),
  };

  if (log) {
    await logSmsIntentResolution({
      session,
      userText,
      normalizedText: normalized,
      sceneId,
      availableAffordances: activeAffordances,
      status,
      candidates: ranked,
      chosenCandidate,
      confidence: result.confidence,
      clarificationNeeded: status === 'ambiguous',
    });
  }

  return result;
}

export function buildClarificationState({
  sourceText,
  candidates = [],
  actionWindowId = null,
} = {}) {
  return {
    source_user_text: sourceText,
    action_window_id: actionWindowId,
    candidates: normalizeArray(candidates).map(compactCandidate),
    created_at: new Date().toISOString(),
    expires_when_window_changes: true,
  };
}

export function candidateFromClarification(clarificationState, index) {
  const candidate = normalizeArray(clarificationState?.candidates)[index];

  if (!candidate) {
    return null;
  }

  return candidate;
}
