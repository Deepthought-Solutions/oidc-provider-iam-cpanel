export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('upstream_providers', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
        comment: 'Unique provider identifier (e.g., "linkedin", "github")',
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Human-readable name (e.g., "LinkedIn", "GitHub")',
      },
      type: {
        type: Sequelize.ENUM('oidc', 'oauth2'),
        allowNull: false,
        defaultValue: 'oidc',
        comment: 'Provider type: OIDC with discovery or plain OAuth 2.0',
      },
      client_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'OAuth/OIDC client ID',
      },
      client_secret: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'OAuth/OIDC client secret (encrypted in production)',
      },
      discovery_url: {
        type: Sequelize.STRING(512),
        allowNull: true,
        comment: 'OIDC discovery URL (e.g., https://accounts.google.com)',
      },
      authorization_endpoint: {
        type: Sequelize.STRING(512),
        allowNull: true,
        comment: 'OAuth 2.0 authorization endpoint (for non-OIDC providers)',
      },
      token_endpoint: {
        type: Sequelize.STRING(512),
        allowNull: true,
        comment: 'OAuth 2.0 token endpoint (for non-OIDC providers)',
      },
      userinfo_endpoint: {
        type: Sequelize.STRING(512),
        allowNull: true,
        comment: 'Userinfo endpoint (for non-OIDC providers)',
      },
      scopes: {
        type: Sequelize.STRING(512),
        allowNull: false,
        defaultValue: 'openid email profile',
        comment: 'Space-separated OAuth scopes',
      },
      icon_url: {
        type: Sequelize.STRING(512),
        allowNull: true,
        comment: 'URL to provider icon/logo',
      },
      button_color: {
        type: Sequelize.STRING(7),
        allowNull: true,
        comment: 'Hex color for provider button (e.g., #0077B5 for LinkedIn)',
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether this provider is active',
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Display order on login page',
      },
      config_json: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional provider-specific configuration',
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

    await queryInterface.addIndex('upstream_providers', ['enabled', 'sort_order'], {
      name: 'idx_upstream_providers_enabled_sort',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('upstream_providers');
  },
};
