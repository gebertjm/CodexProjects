import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool(env.dbConfig);

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error.');
  console.error(error.message);
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseHealth() {
  const result = await query(
    'SELECT NOW() AS server_time, current_database() AS database_name, current_user AS database_user'
  );

  return result.rows[0];
}

export async function verifyDatabaseConnection() {
  await query('SELECT 1');
}
