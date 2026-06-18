import { Router } from 'express';

import { requireFirebaseAuth } from '../auth/firebaseAuth.js';
import { advanceBeatForDevAccount } from '../services/beatAdvanceService.js';
import {
  createAnnotationCorrectionChainForAccount,
  createAnnotationLifecycleRecordForAccount,
  createCorrectionLifecycleRecordForAccount,
  reviewAnnotationCorrectionRecordForAccount,
} from '../services/dialogueFocusCommit/dialogueAnnotationCorrectionService.js';
import { getDialogueDebugWorkspaceForAccount } from '../services/dialogueFocusCommit/dialogueDebugWorkspaceService.js';
import { runDialoguePathTestForAccount } from '../services/dialogueFocusCommit/dialoguePathTestHarnessService.js';
import { getExplorationMechanicsDebugReadModelForAccount } from '../services/explorationMechanicsDebugReadModel.js';
import { getGreyvaleSliceInspectorForAccount } from '../services/greyvaleSliceInspectorService.js';
import { getOrCreatePlayerState } from '../services/playerStateService.js';
import {
  runPlaytestDiagnosticsForAccount,
  runPlaytestRepairForAccount,
} from '../services/playtestDiagnosticsService.js';

const router = Router();

router.use(requireFirebaseAuth);

async function accountIdForRequest(req) {
  const playerState = await getOrCreatePlayerState(req.firebaseUser);
  return Number(playerState.account.account_id);
}

router.post('/advance-beat', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await advanceBeatForDevAccount(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

router.get('/playtest-diagnostics', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(
      await runPlaytestDiagnosticsForAccount(accountId, {
        campaign_instance_id: req.query.campaign_instance_id,
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get('/dialogue-debug', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await getDialogueDebugWorkspaceForAccount(accountId, req.query ?? {}));
  } catch (error) {
    next(error);
  }
});

router.get('/exploration-mechanics', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await getExplorationMechanicsDebugReadModelForAccount(accountId, req.query ?? {}));
  } catch (error) {
    next(error);
  }
});

router.get('/greyvale-slice-inspector', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await getGreyvaleSliceInspectorForAccount(accountId, req.query ?? {}));
  } catch (error) {
    next(error);
  }
});

router.post('/dialogue-lifecycle/chain', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.status(201).json(await createAnnotationCorrectionChainForAccount(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

router.post('/dialogue-lifecycle/annotation', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.status(201).json(await createAnnotationLifecycleRecordForAccount(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

router.post('/dialogue-lifecycle/correction', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.status(201).json(await createCorrectionLifecycleRecordForAccount(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

router.post('/dialogue-lifecycle/review', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await reviewAnnotationCorrectionRecordForAccount(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

router.post('/dialogue-path-test/run', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await runDialoguePathTestForAccount(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

router.post('/playtest-repair', async (req, res, next) => {
  try {
    const accountId = await accountIdForRequest(req);
    res.json(await runPlaytestRepairForAccount(accountId, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

export default router;
