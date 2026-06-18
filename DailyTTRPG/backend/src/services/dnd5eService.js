import { query } from '../config/db.js';
import {
  selectRacesQuery,
  selectClassesQuery,
  selectLanguagesQuery,
  selectFeatsQuery,
} from '../db/queries/dnd5e.js';

export async function listRaces() {
  const result = await query(selectRacesQuery);
  return result.rows;
}

export async function listClasses() {
  const result = await query(selectClassesQuery);
  return result.rows;
}

export async function listLanguages() {
  const result = await query(selectLanguagesQuery);
  return result.rows;
}

export async function listFeats() {
  const result = await query(selectFeatsQuery);
  return result.rows;
}
