import { createInteractionDomainAdapter } from '../interactionCore/domainAdapter.js';
import {
  DIALOGUE_FIELD_MAP,
  DIALOGUE_FOCUS_COMMIT_DOMAIN,
} from './dialogueFocusCommitTypes.js';

export const dialogueFocusCommitAdapter = createInteractionDomainAdapter({
  domain: DIALOGUE_FOCUS_COMMIT_DOMAIN,
  domain_label: 'Dialogue Focus / Commit',
  field_map: DIALOGUE_FIELD_MAP,
});

export function normalizeDialogueFocusCommitScene(dialogueScene = {}) {
  return dialogueFocusCommitAdapter.normalizeDefinitions(dialogueScene);
}

export function getDialogueFocusCommitPrimitiveMappings() {
  return dialogueFocusCommitAdapter.primitive_mappings;
}
