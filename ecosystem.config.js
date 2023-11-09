module.exports = {
  apps: [
    {
      name: 'chatgpt-browser-api',
      script: 'pnpm start',
      instances: 1,
      watch: true,
      max_memory_restart: '180M',
    },
  ],
};
