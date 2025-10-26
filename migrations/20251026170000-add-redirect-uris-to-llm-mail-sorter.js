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

      // Add empty redirect_uris array
      clientData.redirect_uris = [];

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

      console.log(`Added empty redirect_uris array to client ${clientId}`);
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

      // Remove redirect_uris
      delete clientData.redirect_uris;

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

      console.log(`Removed redirect_uris from client ${clientId}`);
    }
  }
};
