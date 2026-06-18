import { Router } from 'express';

import { env } from '../config/env.js';
import { requireFirebaseAuth } from '../auth/firebaseAuth.js';
import { getCharacterSceneView } from '../services/characterSceneViewService.js';
import { getOrCreatePlayerState } from '../services/playerStateService.js';
import {
  getCurrentAdventurePreview,
  getPlayerDashboard,
  getStarterAdventureIntro,
} from '../services/playerDashboardService.js';
import {
  abandonCharacterCreationDraft,
  createWebCharacter,
  getActiveCharacterCreationDraft,
  getCharacterCreationOptions,
  patchCharacterCreationDraft,
  saveCharacterCreationDraft,
  setActiveWebCharacter,
  startWebAdventure,
} from '../services/webCharacterCreationService.js';
import {
  getWebCharacterSheet,
  listWebCharacters,
  setActiveCharacterForWeb,
} from '../services/webCharacterManagementService.js';
import {
  previewWebAction,
  submitWebAction,
} from '../services/actionComposerService.js';
import {
  getPlayerCurrentDialogueTranscriptForAccount,
  getPlayerDialogueArchiveRecordForAccount,
  listPlayerDialogueArchiveForAccount,
  searchPlayerDialogueArchiveForAccount,
} from '../services/dialogueFocusCommit/dialogueArchiveService.js';
import {
  getDialogueFocusCommitStateForAccount,
  previewCommittedSocialMoveForAccount,
  resolveClarifyingQuestionForAccount,
  resolveDialogueExitForAccount,
  submitCommittedSocialMoveForAccount,
} from '../services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js';
import {
  getCampaignHistoryForAccount,
  getCampaignKnowledgeForAccount,
} from '../services/playerBeatResultService.js';
import { resolveFreeFocusForAccount } from '../services/freeFocusService.js';
import { createHttpError } from '../utils/httpError.js';
import { query } from '../config/db.js';

const router = Router();

async function debugAllowedForAccount(req, accountId) {
  if (env.NODE_ENV === 'production' || String(req.query.include_debug ?? '').toLowerCase() !== 'true') {
    return false;
  }

  const result = await query(
    `
      SELECT COALESCE(can_advance_beats, FALSE) AS can_advance_beats
      FROM account
      WHERE id = $1
      LIMIT 1
    `,
    [accountId]
  );
  return result.rows[0]?.can_advance_beats === true;
}

function mechanicsAllowed(req, includeDebug = false) {
  return includeDebug || String(req.query.include_mechanics ?? '').toLowerCase() === 'true';
}

router.use(requireFirebaseAuth);

function parsePositiveId(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(`${label} must be a positive integer`, 400);
  }
  return parsed;
}

async function accountIdForRequest(req) {
  const playerState = await getOrCreatePlayerState(req.firebaseUser);
  return Number(playerState.account.account_id);
}

router.get('/character-creation/options', async (_req, res, next) => {
  try {
    res.json(await getCharacterCreationOptions());
  } catch (error) {
    next(error);
  }
});

router.get('/character-creation/draft', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json({
      draft: await getActiveCharacterCreationDraft(accountId),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/character-creation/draft', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.status(201).json({
      draft: await saveCharacterCreationDraft(accountId, req.body ?? {}),
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/character-creation/draft/:draft_id', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    const draftId = parsePositiveId(req.params.draft_id, 'draft_id');
    res.json({
      draft: await patchCharacterCreationDraft(accountId, draftId, req.body ?? {}),
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/character-creation/draft/:draft_id', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    const draftId = parsePositiveId(req.params.draft_id, 'draft_id');
    res.json({
      draft: await abandonCharacterCreationDraft(accountId, draftId),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.status(201).json(await createWebCharacter(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

router.get('/characters', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await listWebCharacters(accountId));
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:character_id', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    const characterId = parsePositiveId(req.params.character_id, 'character_id');
    res.json(await getWebCharacterSheet(accountId, characterId));
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:character_id/set-active', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    const characterId = parsePositiveId(req.params.character_id, 'character_id');
    res.json(await setActiveWebCharacter(accountId, characterId));
  } catch (error) {
    next(error);
  }
});

router.post('/active-character', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    const characterId = parsePositiveId(req.body?.character_id, 'character_id');
    res.json(await setActiveCharacterForWeb(accountId, characterId));
  } catch (error) {
    next(error);
  }
});

router.get('/starter-adventure', async (_req, res, next) => {
  try {
    res.json({
      starter_adventure: await getStarterAdventureIntro(),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await getPlayerDashboard(accountId));
  } catch (error) {
    next(error);
  }
});

router.get('/current-adventure', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await getCurrentAdventurePreview(accountId));
  } catch (error) {
    next(error);
  }
});

router.post('/start-adventure', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    const started = await startWebAdventure(accountId, req.body ?? {});
    const dashboard = await getPlayerDashboard(accountId);
    const currentScene = await getCharacterSceneView({
      accountId,
      includeDebug: false,
      includeMechanics: false,
    });
    const route =
      currentScene?.state === 'active'
        ? dashboard.current_adventure?.scene_route ?? '/play/campaign/scene'
        : dashboard.starter_adventure?.route_after_start ?? '/play/campaign';
    res.json({
      ...started,
      dashboard,
      current_adventure: dashboard.current_adventure,
      current_scene: currentScene,
      route,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/current-scene', async (req, res, next) => {
  try {
    const playerState = await getOrCreatePlayerState(req.firebaseUser);
    const accountId = Number(playerState.account.account_id);
    const includeDebug = await debugAllowedForAccount(req, accountId);
    const view = await getCharacterSceneView({
      accountId,
      characterId: req.query.character_id ?? null,
      campaignInstanceId: req.query.campaign_instance_id ?? null,
      includeDebug,
      includeMechanics: mechanicsAllowed(req, includeDebug),
    });

    res.json(view);
  } catch (error) {
    next(error);
  }
});

router.get('/campaign/history', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await getCampaignHistoryForAccount(accountId));
  } catch (error) {
    next(error);
  }
});

router.get('/campaign/knowledge', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await getCampaignKnowledgeForAccount(accountId));
  } catch (error) {
    next(error);
  }
});

router.get('/dialogue/current', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await getDialogueFocusCommitStateForAccount(accountId, req.query ?? {}));
  } catch (error) {
    next(error);
  }
});

router.get('/dialogue/transcript/current', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await getPlayerCurrentDialogueTranscriptForAccount(accountId, req.query ?? {}));
  } catch (error) {
    next(error);
  }
});

router.get('/dialogue/archive', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await listPlayerDialogueArchiveForAccount(accountId, req.query ?? {}));
  } catch (error) {
    next(error);
  }
});

router.get('/dialogue/archive/:record_id', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    const recordId = parsePositiveId(req.params.record_id, 'record_id');
    res.json(await getPlayerDialogueArchiveRecordForAccount(accountId, recordId));
  } catch (error) {
    next(error);
  }
});

router.get('/dialogue/search', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await searchPlayerDialogueArchiveForAccount(accountId, req.query ?? {}));
  } catch (error) {
    next(error);
  }
});

router.post('/dialogue/clarifying-question/resolve', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await resolveClarifyingQuestionForAccount(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

router.post('/dialogue/social-move/preview', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await previewCommittedSocialMoveForAccount(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

router.post('/dialogue/social-move/submit', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await submitCommittedSocialMoveForAccount(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

router.post('/dialogue/exit', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await resolveDialogueExitForAccount(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

router.post('/action/preview', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await previewWebAction(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

router.post('/action/submit', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await submitWebAction(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

router.post('/free-focus/resolve', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await resolveFreeFocusForAccount(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

export default router;
