import app from './app.js';
import { env } from './config/env.js';
import { verifyDatabaseConnection } from './config/db.js';

async function startServer() {
  try {
    await verifyDatabaseConnection();

    app.listen(env.PORT, env.HOST, () => {
      console.log(`DailyRPG backend listening on ${env.HOST}:${env.PORT}`);
    });
  } catch (error) {
    console.error('DailyRPG backend failed to start.');
    console.error(error.message);
    process.exit(1);
  }
}

startServer();
