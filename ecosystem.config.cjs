// ecosystem.config.cjs - PM2 configuration for production
module.exports = {
  apps: [{
    name: 'tienhock-server',
    script: 'server.js',
    cwd: '/home/tienhock/tienhock-app',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M'
    // No env section needed - app loads from .env file
  }]
};
