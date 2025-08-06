import 'dotenv/config';
import { sequelize } from '../server/oidc/db_adapter.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function runMigrations() {
  console.log('Running migrations...');
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
