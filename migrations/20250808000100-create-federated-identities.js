export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('federated_identities', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      account_uid: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'Reference to accounts.uid',
      },
      provider_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Provider identifier (matches upstream_providers.name)',
      },
      provider_subject: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Subject (sub) claim from provider',
      },
      provider_email: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Email from provider (may differ from local email)',
      },
      claims_json: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Full claims from provider ID token/userinfo',
      },
      verified: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether this federated identity has been verified for owned domains',
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last time this identity was used for login',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Unique constraint: one provider identity can only link to one account
    await queryInterface.addIndex('federated_identities', ['provider_name', 'provider_subject'], {
      name: 'idx_federated_identities_provider_subject',
      unique: true,
    });

    // Index for finding all identities for an account
    await queryInterface.addIndex('federated_identities', ['account_uid'], {
      name: 'idx_federated_identities_account',
    });

    // Foreign key to accounts table
    await queryInterface.addConstraint('federated_identities', {
      fields: ['account_uid'],
      type: 'foreign key',
      name: 'fk_federated_identities_account',
      references: {
        table: 'accounts',
        field: 'uid',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('federated_identities');
  },
};
