# Agent Instructions for `auth-www`

This document provides specific instructions for developing and deploying the `auth-www` service, which runs in a Phusion Passenger environment on cPanel.

## Phusion Passenger and Node.js ES Modules

The production environment for this service uses Phusion Passenger to run the Node.js application. Passenger's Node.js loader currently uses the CommonJS `require()` function to load the application's startup file.

Our application's entry point, `server/server.mjs`, is an ECMAScript Module (ESM) and uses top-level `await`. A conflict arises because `require()` cannot be used to load an ESM file that has top-level `await`. This results in a `ERR_REQUIRE_ASYNC_MODULE` error at runtime.

### The `passenger-loader.js` Solution

To resolve this, we use a CommonJS wrapper script, `server/passenger-loader.js`, as the application's startup file in the Passenger configuration.

This loader script contains:
```javascript
// server/passenger-loader.js
import('./server.mjs').catch(err => {
  console.error("Failed to load ES module server:", err);
  process.exit(1);
});
```

This wrapper uses a dynamic `import()` statement, which is a promise-based function that correctly handles loading ES modules, even those with top-level `await`, from a CommonJS context.

### Key Takeaways

- **Do not change the startup file** `server/passenger-loader.js`.
- The main application logic should remain in `server/server.mjs`.
- The `passenger-loader.js` file should not be modified unless there is a fundamental change in the deployment environment or Node.js module handling.
- If you encounter module-related errors during deployment, verify that the interaction between `passenger-loader.js` and `server.mjs` is still valid.

## Database Migrations

This service uses Sequelize for database interactions. To manage database schema changes, we use a migration-based approach instead of `sequelize.sync()`. This practice ensures that schema changes are version-controlled, predictable, and can be applied consistently across all environments (development, testing, and production).

### How Migrations are Applied

The server is configured to automatically apply any pending migrations upon startup. When `server.mjs` is executed, it checks the `migrations` directory, compares the migration files with the records in the `SequelizeMeta` table in the database, and runs any migrations that have not yet been applied.

### Creating a New Migration

When you need to make a change to the database schema (e.g., create a table, add a column), you must create a new migration file. While `sequelize-cli` is not a project dependency, you can create migration files manually in the `auth-www/migrations/` directory.

Follow these steps to create a new migration:

1.  **Generate a filename:** Use a timestamp-based naming convention to ensure proper ordering. For example: `YYYYMMDDHHMMSS-descriptive-name.js`.
2.  **Create the file:** Create the new file in the `auth-www/migrations/` directory.
3.  **Implement `up` and `down` functions:** The migration file must export an object with `up` and `down` async functions.
    *   The `up` function should contain the logic to apply your schema changes (e.g., `queryInterface.createTable(...)`).
    *   The `down` function should contain the logic to revert the changes made by the `up` function.

Here is a template for a new migration file:

```javascript
'use strict';

export default {
  up: async (queryInterface, Sequelize) => {
    // Add your migration logic here
    // e.g., await queryInterface.createTable('users', { id: Sequelize.INTEGER });
  },

  down: async (queryInterface, Sequelize) => {
    // Add logic to revert the migration here
    // e.g., await queryInterface.dropTable('users');
  }
};
```

By following this process, you ensure that all database schema changes are tracked and applied systematically, avoiding the potential issues caused by `sequelize.sync()` in a production environment.

## Global directives

 - When preparing branch name and commit comment, review the whole changeset that will be comitted and compose a meaningful comment that relates the changes and the why. If the why is not clear enough, prompt the human for clarifications. Additionally, create an md file or update the relevant file in the doc/site-specs directory giving a detailed description of the change request. Prefix a feature branch with feat/ and a bugfix branch with fix/.
 - Add of fix playwright tests with new use cases when necessary.