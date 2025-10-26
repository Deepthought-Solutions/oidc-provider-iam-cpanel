'use strict';

import { v4 as uuidv4 } from 'uuid';

export default {
  up: async (queryInterface, Sequelize) => {
    const clientId = 'llm-mail-sorter';
    const clientSecret = uuidv4();

    const clientData = {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: [`${clientId}://callback`],
      response_types: ['code'],
      grant_types: [
        'authorization_code',
        'refresh_token',
        'urn:ietf:params:oauth:grant-type:device_code'
      ],
      token_endpoint_auth_method: 'client_secret_basic',
    };

    await queryInterface.bulkInsert('_oidc_Clients', [{
      id: clientId,
      data: JSON.stringify(clientData),
      expiresAt: null,
      consumedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);

    console.log(`Created client: ${clientId}`);
    console.log(`Client secret: ${clientSecret}`);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('_oidc_Clients', {
      id: 'llm-mail-sorter'
    });
  }
};
