import express from 'express';
import { env } from './config/env.js';
import healthRouter from './routes/health.js';
import rulesetsRouter from './routes/rulesets.js';
import dnd5eRouter from './routes/dnd5e.js';
import accountsRouter from './routes/accounts.js';
import devBeatRouter from './routes/devBeat.js';
import devSmsSimulatorRouter from './routes/devSmsSimulator.js';
import meRouter from './routes/me.js';
import playRouter from './routes/play.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

const app = express();

function corsAllowed(origin) {
  if (!origin) {
    return true;
  }

  if (!env.CORS_ALLOWED_ORIGINS) {
    return env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }

  return env.CORS_ALLOWED_ORIGINS.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(origin);
}

app.use((req, res, next) => {
  const origin = req.get('origin');

  if (corsAllowed(origin)) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    name: 'DailyRPG backend',
    status: 'ok',
    endpoints: [
      '/health',
      '/api/health/db',
      '/api/accounts',
      '/api/accounts/:id',
      '/api/accounts/:id/characters',
      '/api/accounts/:id/active-character',
      '/api/me',
      '/api/me/characters',
      '/api/me/active-character',
      '/api/me/current-campaign',
      '/api/play/character-creation/options',
      '/api/play/character-creation/draft',
      '/api/play/characters',
      '/api/play/characters/:character_id',
      '/api/play/active-character',
      '/api/play/characters/:character_id/set-active',
      '/api/play/starter-adventure',
      '/api/play/dashboard',
      '/api/play/start-adventure',
      '/api/play/current-adventure',
      '/api/play/current-scene',
      '/api/play/free-focus/resolve',
      '/api/play/dialogue/current',
      '/api/play/dialogue/transcript/current',
      '/api/play/dialogue/archive',
      '/api/play/dialogue/archive/:record_id',
      '/api/play/dialogue/search',
      '/api/play/dialogue/clarifying-question/resolve',
      '/api/play/dialogue/social-move/preview',
      '/api/play/dialogue/social-move/submit',
      '/api/play/dialogue/exit',
      '/api/play/action/preview',
      '/api/play/action/submit',
      '/api/dev/advance-beat',
      '/api/dev/dialogue-debug',
      '/api/dev/exploration-mechanics',
      '/api/dev/greyvale-slice-inspector',
      '/api/dev/dialogue-lifecycle/chain',
      '/api/dev/dialogue-lifecycle/annotation',
      '/api/dev/dialogue-lifecycle/correction',
      '/api/dev/dialogue-lifecycle/review',
      '/api/dev/dialogue-path-test/run',
      '/api/dev/playtest-diagnostics',
      '/api/dev/playtest-repair',
      '/api/rulesets',
      '/api/dnd5e/races',
      '/api/dnd5e/classes',
      '/api/dnd5e/languages',
      '/api/dnd5e/feats',
      '/api/dnd5e/spells',
      '/api/dnd5e/spells/:id',
      '/api/dnd5e/items',
      '/api/dnd5e/items/:id',
      '/api/dnd5e/worlds',
      '/api/dnd5e/worlds/:id',
      '/api/dnd5e/worlds/:id/campaigns',
      '/api/dnd5e/worlds/:id/regions',
      '/api/dnd5e/worlds/:id/entities',
      '/api/dnd5e/locations/:id',
      '/api/dnd5e/scenes/:id',
      '/api/dnd5e/campaigns',
      '/api/dnd5e/campaigns/:id',
      '/api/dnd5e/campaigns/:id/characters',
      '/api/dnd5e/campaigns/:id/scenes',
      '/api/dnd5e/campaigns/:id/logs',
      '/api/dnd5e/campaigns/:id/characters/:characterId/scene',
      '/api/dnd5e/campaigns/:id/characters/:characterId/enter-scene',
      '/api/dnd5e/campaigns/:id/characters/:characterId/move',
      '/api/dnd5e/campaigns/:id/characters/:characterId/scene/npcs',
      '/api/dnd5e/campaigns/:id/characters/:characterId/interactions/:interactionId/attempt',
      '/api/dnd5e/campaigns/:id/characters/:characterId/adventure-state',
      '/api/dnd5e/campaigns/:id/characters/:characterId/play-state',
      '/api/dnd5e/campaigns/:id/characters/:characterId/available-actions',
      '/api/dnd5e/campaigns/:id/characters/:characterId/context-summary',
      '/api/dnd5e/campaigns/:id/characters/:characterId/act',
      '/api/dnd5e/campaigns/:id/characters/:characterId/quests',
      '/api/dnd5e/campaigns/:id/characters/:characterId/objectives',
      '/api/dnd5e/campaigns/:id/characters/:characterId/flags',
      '/api/dnd5e/event-templates',
      '/api/dnd5e/events',
      '/api/dnd5e/events/:id',
      '/api/dnd5e/events/:id/choose',
      '/api/dnd5e/commands/execute',
      '/api/dnd5e/characters/:id/overrides',
      '/api/dnd5e/characters/:id/command-logs',
      '/api/dnd5e/characters/:id/history',
      '/api/dnd5e/characters/:id/progression',
      '/api/dnd5e/characters/:id/xp',
      '/api/dnd5e/characters/:id/advancement',
      '/api/dnd5e/characters/:id/milestone',
      '/api/dnd5e/characters/:id/level-up',
      '/api/dnd5e/characters/:id/level-up/start',
      '/api/dnd5e/characters/:id/level-up/defer',
      '/api/dnd5e/characters/:id/level-up/hp',
      '/api/dnd5e/characters/:id/level-up/subclass',
      '/api/dnd5e/characters/:id/level-up/spells',
      '/api/dnd5e/characters/:id/level-up/preview',
      '/api/dnd5e/characters/:id/level-up/finalize',
      '/api/dnd5e/campaigns/:id/level-sync',
      '/api/dnd5e/campaigns/:id/advancement-config',
      '/api/dnd5e/worlds/:id/advancement-config',
      '/api/dnd5e/overrides/:id',
      '/api/dnd5e/characters',
      '/api/dnd5e/characters/:id',
      '/api/dnd5e/characters/:id/campaigns',
      '/api/dnd5e/characters/:id/events',
      '/api/dnd5e/characters/:id/sheet',
      '/api/dnd5e/characters/:id/rules',
      '/api/dnd5e/characters/:id/classes',
      '/api/dnd5e/characters/:id/languages',
      '/api/dnd5e/characters/:id/feats',
      '/api/dnd5e/characters/:id/spells',
      '/api/dnd5e/characters/:id/spells/:characterSpellId',
      '/api/dnd5e/characters/:id/spell-slots',
      '/api/dnd5e/characters/:id/spell-slots/use',
      '/api/dnd5e/characters/:id/spell-slots/restore',
      '/api/dnd5e/characters/:id/items',
      '/api/dnd5e/characters/:id/items/:characterItemId',
      '/api/dnd5e/characters/:id/currency',
      '/api/dnd5e/characters/:id/inactivate',
      '/api/dev/sms-simulator/session',
      '/api/dev/sms-simulator/sessions',
      '/api/dev/sms-simulator/messages/:sessionId',
      '/api/dev/sms-simulator/inbound',
      '/api/dev/sms-simulator/advance-next-beat',
      '/api/dev/sms-simulator/advance-window',
      '/api/dev/sms-simulator/close-window',
      '/api/dev/sms-simulator/resolve-threshold',
      '/api/dev/sms-simulator/combat-prompt',
      '/api/dev/sms-simulator/combat-resolve',
      '/api/dev/sms-simulator/level-available',
      '/api/dev/sms-simulator/debug/:sessionId',
    ],
  });
});

app.use('/health', healthRouter);
app.use('/api/health', healthRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/me', meRouter);
app.use('/api/play', playRouter);
app.use('/api/rulesets', rulesetsRouter);
app.use('/api/dnd5e', dnd5eRouter);
app.use('/api/dev/sms-simulator', devSmsSimulatorRouter);
app.use('/api/dev', devBeatRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
