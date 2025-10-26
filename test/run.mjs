import 'dotenv/config';
import * as fs from 'fs';
import runMigrations from './run-migrations.mjs';
import { startServer } from '../server/server.mjs';
import { startMyClient } from '../my/server.mjs';
import { v4 as uuidv4 } from 'uuid';
import { Sequelize } from 'sequelize';
import { sequelize } from '../server/oidc/db_adapter.js';

const providerPort = 3080;
const port = 3001;

const providerIssuer = `http://localhost:${providerPort}/`;
const clientHost = `http://localhost:${port}`;

const client = {
  client_id: uuidv4(),
  client_secret: 'a-secret',
  redirect_uris: [`${clientHost}/cb`],
  response_types: ['code'],
  grant_types: ['authorization_code'],
  token_endpoint_auth_method: 'client_secret_basic',
};

const nativeClient = {
    client_id: 'org.test.app',
    application_type: 'native',
    grant_types: ['authorization_code'],
    response_types: ['code'],
    redirect_uris: ['org.test.app://auth'],
    token_endpoint_auth_method: 'none',
}

const deviceFlowClient = {
    client_id: 'llm-mail-sorter',
    application_type: 'native',
    grant_types: ['refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'],
    redirect_uris: [],
    response_types: [],
    token_endpoint_auth_method: 'none',
}

export const clients = [client, nativeClient, deviceFlowClient];

async function provisionClient() {

  const Client = sequelize.define('_oidc_Clients', {
    id: { type: Sequelize.STRING, primaryKey: true },
    data: { type: Sequelize.JSON },
  }, {
    timestamps: false,
  });

  await sequelize.sync();
  for (const c of clients) {
    await Client.upsert({
      id: c.client_id,
      data: c,
      createdAt: Sequelize.NOW,
      updatedAt: Sequelize.NOW
    });
  }
}

async function main() {
  console.log('Deleting old test database...');
  if (fs.existsSync('test.db')) {
    fs.unlinkSync('test.db');
  }

  await runMigrations();
  await provisionClient();
  console.log('Starting client server...');
  await startMyClient({client:client, issuer: providerIssuer, port: port});
  console.log('Starting OIDC provider...');
  await startServer();
}

main();
