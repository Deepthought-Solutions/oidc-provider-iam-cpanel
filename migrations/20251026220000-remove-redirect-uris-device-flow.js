'use strict';

export default {
  up: async (queryInterface, Sequelize) => {
    const clientId = 'llm-mail-sorter';

    // Get the existing client
    const [client] = await queryInterface.sequelize.query(
      `SELECT data FROM "_oidc_Clients" WHERE id = :clientId`,
      {
        replacements: { clientId },
        type: queryInterface.sequelize.QueryTypes.SELECT
      }
    );

    if (client) {
      const clientData = typeof client.data === 'string' ? JSON.parse(client.data) : client.data;

      // For device flow, completely remove redirect_uris and response_types
      // Empty arrays cause oidc-provider to validate "must contain members"
      delete clientData.redirect_uris;
      delete clientData.response_types;

      await queryInterface.sequelize.query(
        `UPDATE "_oidc_Clients" SET data = :data, "updatedAt" = :updatedAt WHERE id = :clientId`,
        {
          replacements: {
            clientId,
            data: JSON.stringify(clientData),
            updatedAt: new Date()
          }
        }
      );

      console.log(`Removed redirect_uris and response_types from device flow client ${clientId}`);
    } else {
      console.log(`Client ${clientId} not found, skipping migration`);
    }
  },

  down: async (queryInterface, Sequelize) => {
    const clientId = 'llm-mail-sorter';

    const [client] = await queryInterface.sequelize.query(
      `SELECT data FROM "_oidc_Clients" WHERE id = :clientId`,
      {
        replacements: { clientId },
        type: queryInterface.sequelize.QueryTypes.SELECT
      }
    );

    if (client) {
      const clientData = typeof client.data === 'string' ? JSON.parse(client.data) : client.data;

      // Restore empty arrays
      clientData.redirect_uris = [];
      clientData.response_types = [];

      await queryInterface.sequelize.query(
        `UPDATE "_oidc_Clients" SET data = :data, "updatedAt" = :updatedAt WHERE id = :clientId`,
        {
          replacements: {
            clientId,
            data: JSON.stringify(clientData),
            updatedAt: new Date()
          }
        }
      );

      console.log(`Restored redirect_uris and response_types for client ${clientId}`);
    }
  }
};
