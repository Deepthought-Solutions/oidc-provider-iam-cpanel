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

      // Remove redirect_uris and response_types for device code flow
      delete clientData.redirect_uris;
      delete clientData.response_types;

      // Update grant_types to only include device code and refresh token
      clientData.grant_types = [
        'refresh_token',
        'urn:ietf:params:oauth:grant-type:device_code'
      ];

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

      console.log(`Fixed client ${clientId} for device code flow`);
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

      // Restore original configuration
      clientData.redirect_uris = [`${clientId}://callback`];
      clientData.response_types = ['code'];
      clientData.grant_types = [
        'authorization_code',
        'refresh_token',
        'urn:ietf:params:oauth:grant-type:device_code'
      ];

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

      console.log(`Reverted client ${clientId} configuration`);
    }
  }
};
