'use strict';

const grantable = new Set([
  'AccessToken',
  'AuthorizationCode',
  'RefreshToken',
  'DeviceCode',
  'BackchannelAuthenticationRequest',
]);

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
];

const pluralize = (name) => {
  if (name === 'ClientCredentials') {
    return name;
  }
  return `${name}s`;
};

const oidcTables = models.map(name => `_oidc_${pluralize(name)}`);
const otherTables = ['accounts', 'totp_secrets'];
const allTables = [...oidcTables, ...otherTables];

export default {
  up: async (queryInterface, Sequelize) => {
    for (const table of allTables) {
      await queryInterface.changeColumn(table, 'createdAt', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.NOW,
      });
      await queryInterface.changeColumn(table, 'updatedAt', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.NOW,
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    for (const table of allTables) {
      await queryInterface.changeColumn(table, 'createdAt', {
        type: Sequelize.DATE,
        allowNull: false,
      });
      await queryInterface.changeColumn(table, 'updatedAt', {
        type: Sequelize.DATE,
        allowNull: false,
      });
    }
  }
};
