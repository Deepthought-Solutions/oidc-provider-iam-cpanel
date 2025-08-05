'use strict';
import { v4 as uuidv4 } from 'uuid';

export default {
  up: async (queryInterface, Sequelize) => {
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === 'postgres' || dialect === 'sqlite') {
      // The recommended approach is to create a new table and copy the data.
      await queryInterface.createTable('accounts_new', {
        uid: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
        },
        password: {
          type: Sequelize.STRING(512),
          defaultValue: null,
        },
        email: {
          type: Sequelize.STRING(255),
          allowNull: false,
          unique: true,
        },
        createdAt: {
          allowNull: false,
          type: Sequelize.DATE
        },
        updatedAt: {
          allowNull: false,
          type: Sequelize.DATE
        }
      });

      const accounts = await queryInterface.sequelize.query('SELECT * FROM accounts', { type: queryInterface.sequelize.QueryTypes.SELECT });

      if (accounts.length > 0) {
        const accountsWithUuid = accounts.map(account => {
            const { uid, ...rest } = account;
            return {
                ...rest,
                uid: uuidv4()
            };
        });
        await queryInterface.bulkInsert('accounts_new', accountsWithUuid);
      }

      await queryInterface.dropTable('accounts');
      await queryInterface.renameTable('accounts_new', 'accounts');
    }
  },

  down: async (queryInterface, Sequelize) => {
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === 'postgres' || dialect === 'sqlite') {
      await queryInterface.createTable('accounts_old', {
        uid: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false,
        },
        password: {
          type: Sequelize.STRING(512),
          defaultValue: null,
        },
        email: {
          type: Sequelize.STRING(255),
          allowNull: false,
          unique: true,
        },
        createdAt: {
          allowNull: false,
          type: Sequelize.DATE
        },
        updatedAt: {
          allowNull: false,
          type: Sequelize.DATE
        }
      });

      const accounts = await queryInterface.sequelize.query('SELECT * FROM accounts', { type: queryInterface.sequelize.QueryTypes.SELECT });
      if (accounts.length > 0) {
        // We lose the original uid, so we just re-create them.
        const accountsWithoutUuid = accounts.map(({ uid, ...rest }) => rest);
        await queryInterface.bulkInsert('accounts_old', accountsWithoutUuid);
      }

      await queryInterface.dropTable('accounts');
      await queryInterface.renameTable('accounts_old', 'accounts');
    }
  }
};
