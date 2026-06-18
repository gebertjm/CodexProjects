import { query } from '../config/db.js';
import { selectRulesetsQuery } from '../db/queries/rulesets.js';

export async function listRulesets() {
  const result = await query(selectRulesetsQuery);
  return result.rows;
}
