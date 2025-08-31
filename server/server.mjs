// import 'dotenv/config';
// server/index.js
console.log("Starting OIDC provider server")

import Provider from 'oidc-provider';

import render from '@koa/ejs';
import helmet from 'helmet';
import * as path from 'node:path';

import { promisify } from 'node:util';
import routes from './oidc/routes.js';
import configuration from './oidc/configuration.js';
import { getConfiguredClients, registerGrantTypes } from './oidc/configuration.js';
import SequelizeAdapter, { sequelize } from './oidc/db_adapter.js';
import fs from 'node:fs';

const isProduction = process.env.NODE_ENV === 'production';

let port = process.env.PORT || 3080;
let provider_uri = process.env.ISSUER_URL || `http://localhost:${port}/`

if (typeof(PhusionPassenger) !== 'undefined') {
	PhusionPassenger.configure({ autoInstall: false });
	port = 'passenger';
	provider_uri = process.env.ISSUER_URL ||'https://localhost/';
  }

import { dirname } from 'desm';
const __dirname = dirname(import.meta.url);

// startServer();

export function startServer() {
  return new Promise(async (resolve, reject) => {
    const serverTimeout = setTimeout(() => {
      console.log('Server startup timed out.');
      reject(new Error('Server startup timed out.'));
    }, 30000); // 30 seconds timeout

    console.log(`Starting server in ${process.env.NODE_ENV} mode.`);
    if (process.env.NODE_ENV !== 'test') {
      console.log('Checking for database migrations...');
      const queryInterface = sequelize.getQueryInterface();
      const migrationsDir = path.join(__dirname, '..', 'migrations');

      try {
        await queryInterface.createTable('SequelizeMeta', {
          name: {
            type: sequelize.constructor.STRING,
            allowNull: false,
            unique: true,
            primaryKey: true,
          },
        });
        console.log('Created SequelizeMeta table.');
      } catch (e) {
        // Fails silently if the table already exists.
      }

      const executed = await sequelize.query(
        'SELECT name FROM "SequelizeMeta"',
        { type: sequelize.QueryTypes.SELECT }
      ).catch(() => []);
      const executedMigrationNames = executed.map((m) => m.name);
      console.log('Executed migrations:', executedMigrationNames);

      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter((file) => file.endsWith('.js'))
        .sort();

      for (const file of migrationFiles) {
        if (!executedMigrationNames.includes(file)) {
          console.log(`Running migration ${file}`);
          const migrationPath = path.join(migrationsDir, file);
          const { href } = new URL(`file://${migrationPath}`);
          const { default: migration } = await import(href);

          await migration.up(queryInterface, sequelize.constructor);
          await queryInterface.bulkInsert('SequelizeMeta', [{ name: file }]);
          console.log(`Migration ${file} executed successfully.`);
        }
      }
      console.log('Database migrations are up to date.');
    }

    configuration.clients = await getConfiguredClients()
    console.log(`starting issuer ${provider_uri}`)
    const provider = new Provider(provider_uri, { ...configuration });
    registerGrantTypes(provider);
    // provider.on("grant.success", (ctx) => {
    // provider.on("access_token.issued", (accessToken) => {
    //   console.log(accessToken);
    //   new SequelizeAdapter("AccessToken").upsert(accessToken);
    // })
    const directives = helmet.contentSecurityPolicy.getDefaultDirectives();
    delete directives['form-action'];
    const pHelmet = promisify(helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives,
      },
    }));

    provider.use(async (ctx, next) => {
      const origSecure = ctx.req.secure;
      ctx.req.secure = ctx.request.secure;
      await pHelmet(ctx.req, ctx.res);
      ctx.req.secure = origSecure;
      return next();
    });

    render(provider, {
      cache: false,
      viewExt: 'ejs',
      layout: '_layout',
      root: path.join(__dirname, 'views'),
    });

    if (process.env.NODE_ENV === 'production') {
      provider.proxy = true;
      provider.use(async (ctx, next) => {
        if (ctx.secure) {
          await next();
        } else if (ctx.method === 'GET' || ctx.method === 'HEAD') {
          ctx.status = 303;
          ctx.redirect(ctx.href.replace(/^http:\/\//i, 'https://'));
        } else {
          ctx.body = {
            error: 'invalid_request',
            error_description: 'do yourself a favor and only use https',
          };
          ctx.status = 400;
        }
      });
    }

    provider.use(routes(provider).routes());
    const server = provider.listen(port, () => {
      console.log(`OIDC IdP is listening on port ${port}, check its /.well-known/openid-configuration`);
      if (process.env.NODE_ENV === 'test') {
        console.log('OIDC provider is ready for testing.');
      }
      clearTimeout(serverTimeout);
      resolve()
    });
  })

};
