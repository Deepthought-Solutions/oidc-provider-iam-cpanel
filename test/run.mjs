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

async function provisionClient() {

  const Client = sequelize.define('_oidc_Clients', {
    id: { type: Sequelize.STRING, primaryKey: true },
    data: { type: Sequelize.JSON },
  }, {
    timestamps: false,
  });

  await sequelize.sync();
  await Client.upsert({ 
    id: client.client_id,
    data: client,
    createdAt: Sequelize.NOW,
    updatedAt: Sequelize.NOW
  });

}

async function main() {
  console.log('Deleting old test database...');
  if (fs.existsSync('test.db')) {
    fs.unlinkSync('test.db');
  }

  await runMigrations();
  await provisionClient();
  console.log('Starting OIDC provider...');
  startMyClient({client:client, issuer: providerIssuer, port: port}).then(() => {
    startServer()
  })
}

main();
