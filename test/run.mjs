import { spawn } from 'child_process';
import * as fs from 'fs';
import runMigrations from './run-migrations.mjs';

async function main() {
  console.log('Deleting old test database...');
  if (fs.existsSync('test.db')) {
    fs.unlinkSync('test.db');
  }

  await runMigrations();

  console.log('Starting OIDC provider...');
  const provider = spawn('node', ['--loader', 'ts-node/esm', 'server/server.mjs'], {
    env: { ...process.env, NODE_ENV: 'test', ISSUER_URL: 'http://localhost:3080/' },
  });
  provider.stdout.pipe(process.stdout);
  provider.stderr.pipe(process.stderr);

  console.log('Starting test client server...');
  const testAuth = spawn('node', ['test/testauth.mjs']);
  testAuth.stdout.pipe(process.stdout);
  testAuth.stderr.pipe(process.stderr);

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Running Playwright tests...');
  const playwright = spawn('npx', ['playwright', 'test'], {
    stdio: 'inherit',
  });

  playwright.on('close', (code) => {
    console.log(`Playwright exited with code ${code}`);
    provider.kill();
    testAuth.kill();
    process.exit(code);
  });
}

main();
