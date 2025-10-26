export default {
  async up(queryInterface, Sequelize) {
    // Seed default provider configurations from environment variables
    const providers = [];

    // LinkedIn
    if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
      providers.push({
        name: 'linkedin',
        display_name: 'LinkedIn',
        type: 'oidc',
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        discovery_url: 'https://www.linkedin.com',
        scopes: 'openid profile email',
        button_color: '#0077B5',
        enabled: true,
        sort_order: 10,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    // GitHub (OAuth 2.0, not OIDC)
    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
      providers.push({
        name: 'github',
        display_name: 'GitHub',
        type: 'oauth2',
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        authorization_endpoint: 'https://github.com/login/oauth/authorize',
        token_endpoint: 'https://github.com/login/oauth/access_token',
        userinfo_endpoint: 'https://api.github.com/user',
        scopes: 'user:email',
        button_color: '#24292e',
        enabled: true,
        sort_order: 20,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    // Google
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      providers.push({
        name: 'google',
        display_name: 'Google',
        type: 'oidc',
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        discovery_url: 'https://accounts.google.com',
        scopes: 'openid email profile',
        button_color: '#4285F4',
        enabled: true,
        sort_order: 30,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    // Facebook
    if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
      providers.push({
        name: 'facebook',
        display_name: 'Facebook',
        type: 'oidc',
        client_id: process.env.FACEBOOK_CLIENT_ID,
        client_secret: process.env.FACEBOOK_CLIENT_SECRET,
        discovery_url: 'https://www.facebook.com',
        scopes: 'openid email',
        button_color: '#1877F2',
        enabled: true,
        sort_order: 40,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    // Microsoft
    if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
      providers.push({
        name: 'microsoft',
        display_name: 'Microsoft',
        type: 'oidc',
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        discovery_url: 'https://login.microsoftonline.com/common/v2.0',
        scopes: 'openid email profile',
        button_color: '#00A4EF',
        enabled: true,
        sort_order: 50,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    // Apple
    if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
      providers.push({
        name: 'apple',
        display_name: 'Apple',
        type: 'oidc',
        client_id: process.env.APPLE_CLIENT_ID,
        client_secret: process.env.APPLE_CLIENT_SECRET,
        discovery_url: 'https://appleid.apple.com',
        scopes: 'openid email name',
        button_color: '#000000',
        enabled: true,
        sort_order: 60,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    // Insert providers only if we have any configured
    if (providers.length > 0) {
      await queryInterface.bulkInsert('upstream_providers', providers);
      console.log(`Seeded ${providers.length} upstream provider(s)`);
    } else {
      console.log('No upstream providers configured via environment variables');
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove seeded providers
    await queryInterface.bulkDelete('upstream_providers', {
      name: {
        [Sequelize.Op.in]: ['linkedin', 'github', 'google', 'facebook', 'microsoft', 'apple']
      }
    });
  },
};
