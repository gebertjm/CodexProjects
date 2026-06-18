import { Router } from 'express';
import { listRulesets } from '../services/rulesetsService.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const rulesets = await listRulesets();

    res.json({
      data: rulesets,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
