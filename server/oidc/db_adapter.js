/*
 * This is a very rough-edged example, the idea is to still work with the fact that oidc-provider
 * has a rather "dynamic" schema. This example uses sequelize with postgresql, and all dynamic data
 * uses JSON fields. id is set to be the primary key, grantId should be additionaly indexed for
 * models where these fields are set (grantId-able models). userCode should be additionaly indexed
 * for DeviceCode model. uid should be additionaly indexed for Session model. For sequelize
 * migrations @see https://github.com/Rogger794/node-oidc-provider/tree/examples/example/migrations/sequelize
*/
import dotenv from "dotenv";

// npm i --save sequelize
import Sequelize from 'sequelize'; // eslint-disable-line import/no-unresolved
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = process.env.NODE_ENV || 'development';
const configPath = path.join(__dirname, '..', '..', 'config', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))[env];
console.log(`db_adapters: sequelize env=${env}`)

let sequelize;

if (env === 'production') {
  sequelize = new Sequelize(
    process.env.OIDC_DB_NAME,
    process.env.OIDC_DB_USER,
    process.env.OIDC_DB_PASS,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      dialect: 'postgres',
    },
  );
} else if (env === 'test') {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'test.db',
  });
} else {
  // For development, use the config directly, making sure the storage path is correct
  config.storage = path.join(__dirname, '..', '..', config.storage);
  sequelize = new Sequelize(config);
}
  
const grantable = new Set([
  'AccessToken',
  'AuthorizationCode',
  'RefreshToken',
  'DeviceCode',
  'BackchannelAuthenticationRequest',
]);

const pluralize = (name) => {
  if (name === 'ClientCredentials') {
    return name;
  }
  return `${name}s`;
};

const models = [
  'Session',
  'AccessToken',
  'AuthorizationCode',
  'RefreshToken',
  'DeviceCode',
  'ClientCredentials',
  'Client',
  'InitialAccessToken',
  'RegistrationAccessToken',
  'Interaction',
  'ReplayDetection',
  'PushedAuthorizationRequest',
  'Grant',
  'BackchannelAuthenticationRequest',
].reduce((map, name) => {
  map.set(`${name}`, sequelize.define(`_oidc_${pluralize(name)}`, {
    id: { type: Sequelize.STRING, primaryKey: true },
    ...(grantable.has(name) ? { grantId: { type: Sequelize.STRING } } : undefined),
    ...(name === 'DeviceCode' ? { userCode: { type: Sequelize.STRING } } : undefined),
    ...(name === 'Session' ? { uid: { type: Sequelize.STRING } } : undefined),
    data: { type: Sequelize.JSON }, // use JSONB woth pgsql
    expiresAt: { type: Sequelize.DATE },
    consumedAt: { type: Sequelize.DATE },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false },
  }));
  return map;
}, new Map());

class SequelizeAdapter {
  constructor(name) {
    this.model = models.get(`${name}`);

    this.name = name;
  }

  async upsert(id, data, expiresIn) {
    await this.model.upsert({
      id,
      data,
      ...(data.grantId ? { grantId: data.grantId } : undefined),
      ...(data.userCode ? { userCode: data.userCode } : undefined),
      ...(data.uid ? { uid: data.uid } : undefined),
      ...(expiresIn ? { expiresAt: new Date(Date.now() + (expiresIn * 1000)) } : undefined),
    });
  }

  async find(id) {
    const found = await this.model.findByPk(id);
    if (!found) return undefined;
    return {
      ...found.data,
      ...(found.consumedAt ? { consumed: true } : undefined),
    };
  }

  async findByUserCode(userCode) {
    const found = await this.model.findOne({ where: { userCode } });
    if (!found) return undefined;
    return {
      ...found.data,
      ...(found.consumedAt ? { consumed: true } : undefined),
    };
  }

  async findByUid(uid) {
    const found = await this.model.findOne({ where: { uid } });
    if (!found) return undefined;
    return {
      ...found.data,
      ...(found.consumedAt ? { consumed: true } : undefined),
    };
  }

  async destroy(id) {
    await this.model.destroy({ where: { id } });
  }

  async consume(id) {
    await this.model.update({ consumedAt: new Date() }, { where: { id } });
  }

  async revokeByGrantId(grantId) {
    await this.model.destroy({ where: { grantId } });
  }

  static async connect() {
    return Promise.resolve();
  }
}

export { sequelize, SequelizeAdapter as default };