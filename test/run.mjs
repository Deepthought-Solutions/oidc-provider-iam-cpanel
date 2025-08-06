import * as fs from 'fs';
import runMigrations from './run-migrations.mjs';
import { startServer } from '../server/server.mjs';
import { startTestClient } from './testauth.mjs';
async function main() {
  console.log('Deleting old test database...');
  if (fs.existsSync('test.db')) {
    fs.unlinkSync('test.db');
  }

  await runMigrations();

  console.log('Starting OIDC provider...');
  process.env.ISSUER_URL = 'http://localhost:3080/';
  startServer().then(() => {
    startTestClient()
  })
}

main();
