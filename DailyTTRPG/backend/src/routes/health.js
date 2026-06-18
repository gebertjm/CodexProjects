import { Router } from 'express';
import { checkDatabaseHealth } from '../config/db.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'backend',
    timestamp: new Date().toISOString(),
  });
});

router.get('/db', async (_req, res, next) => {
  try {
    const db = await checkDatabaseHealth();

    res.json({
      status: 'ok',
      data: db,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
