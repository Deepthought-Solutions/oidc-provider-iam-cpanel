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

export default {
  up: async (queryInterface, Sequelize) => {
    for (const name of models) {
      await queryInterface.createTable(`_oidc_${pluralize(name)}`, {
        id: { type: Sequelize.STRING, primaryKey: true },
        ...(grantable.has(name) ? { grantId: { type: Sequelize.STRING } } : undefined),
        ...(name === 'DeviceCode' ? { userCode: { type: Sequelize.STRING } } : undefined),
        ...(name === 'Session' ? { uid: { type: Sequelize.STRING } } : undefined),
        data: { type: Sequelize.JSON },
        expiresAt: { type: Sequelize.DATE },
        consumedAt: { type: Sequelize.DATE },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    for (const name of models) {
      await queryInterface.dropTable(`_oidc_${pluralize(name)}`);
    }
  }
};
