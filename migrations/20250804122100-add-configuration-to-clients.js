'use strict';

export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('_oidc_Clients', 'configuration', {
      type: Sequelize.JSON,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('_oidc_Clients', 'configuration');
  }
};
