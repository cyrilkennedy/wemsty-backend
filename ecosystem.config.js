module.exports = {
  apps: [
    {
      name: 'wemsty-api',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: process.env.API_MAX_MEMORY_RESTART || '300M',
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production'
      }
    },
    {
      name: 'wemsty-worker',
      script: 'workers/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: process.env.WORKER_MAX_MEMORY_RESTART || '300M',
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        WORKER_PROCESS: 'true'
      }
    },
    {
      name: 'wemsty-scheduler',
      script: 'scheduler.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: process.env.SCHEDULER_MAX_MEMORY_RESTART || '200M',
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production'
      }
    }
  ]
};
