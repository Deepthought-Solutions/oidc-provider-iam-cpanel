import { spawn } from 'child_process';
import * as fs from 'fs';
import runMigrations from './run-migrations.mjs';

export default async function () {
  console.log('Global setup: Deleting old test database...');
  if (fs.existsSync('test.db')) {
    fs.unlinkSync('test.db');
  }

  await runMigrations();

  console.log('Starting OIDC provider for tests...');
  const provider = spawn('node', ['--loader', 'ts-node/esm', 'server/server.mjs'], {
    env: { ...process.env, NODE_ENV: 'test', ISSUER_URL: 'http://localhost:3080/' },
    detached: true,
  });
  provider.stdout.on('data', (data) => {
    console.log(`OIDC Provider: ${data}`);
  });
  provider.stderr.on('data', (data) => {
    console.error(`OIDC Provider ERROR: ${data}`);
  });

  await new Promise((resolve, reject) => {
    provider.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`OIDC Provider: ${output}`);
      if (output.includes('OIDC provider is ready for testing.')) {
        resolve();
      }
    });
    provider.on('close', (code) => {
      reject(new Error(`OIDC provider process exited with code ${code}`));
    });
  });

  return () => {
    console.log('Global teardown: Stopping OIDC provider...');
    try {
      process.kill(-provider.pid);
    } catch (e) {
      // Ignore errors if the process is already dead
    }
  };
}
