import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env file
config({ path: resolve(__dirname, '../../../.env') });

import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { getEnv } from '@bostonia/shared';

const PORT = parseInt(getEnv('PORT', '3005'), 10);
const HOST = getEnv('HOST', '0.0.0.0');

async function main() {
  const app = await createApp();

  app.listen(PORT, HOST, () => {
    logger.info(`Payment service listening on ${HOST}:${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down payment service...');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  logger.error(error, 'Failed to start payment service');
  process.exit(1);
});
