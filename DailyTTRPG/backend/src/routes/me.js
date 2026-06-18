import { Router } from 'express';
import { requireFirebaseAuth } from '../auth/firebaseAuth.js';
import {
  getOrCreatePlayerState,
} from '../services/playerStateService.js';

const router = Router();

async function loadPlayerState(req, res, next) {
  try {
    const state = await getOrCreatePlayerState(req.firebaseUser);
    res.locals.playerState = state;
    next();
  } catch (error) {
    next(error);
  }
}

router.use(requireFirebaseAuth);

router.get('/', loadPlayerState, (req, res) => {
  res.json(res.locals.playerState);
});

router.get('/characters', loadPlayerState, (_req, res) => {
  res.json({
    characters: res.locals.playerState.characters,
  });
});

router.get('/active-character', loadPlayerState, (_req, res) => {
  res.json({
    active_character: res.locals.playerState.active_character,
  });
});

router.get('/current-campaign', loadPlayerState, (_req, res) => {
  res.json({
    current_campaign: res.locals.playerState.current_campaign,
    action_required: res.locals.playerState.action_required,
  });
});

export default router;

