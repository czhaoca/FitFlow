module.exports = {
  apps: [
    // Authentication Service
    {
      name: 'fitflow-auth',
      script: './services/auth/index.js',
      instances: 2,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        SERVICE_NAME: 'auth-service'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        SERVICE_NAME: 'auth-service'
      },
      error_file: './logs/auth-error.log',
      out_file: './logs/auth-out.log',
      log_file: './logs/auth-combined.log',
      time: true,
      kill_timeout: 5000,
      listen_timeout: 5000,
      wait_ready: true
    },

    // Payment Service
    {
      name: 'fitflow-payment',
      script: './services/payment/index.js',
      instances: 2,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3002,
        SERVICE_NAME: 'payment-service'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
        SERVICE_NAME: 'payment-service'
      },
      error_file: './logs/payment-error.log',
      out_file: './logs/payment-out.log',
      log_file: './logs/payment-combined.log',
      time: true,
      kill_timeout: 5000,
      listen_timeout: 5000,
      wait_ready: true
    },

    // Notification Service
    {
      name: 'fitflow-notification',
      script: './services/notification/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      cron_restart: '0 0 * * *', // Restart daily at midnight
      env: {
        NODE_ENV: 'development',
        PORT: 3003,
        SERVICE_NAME: 'notification-service'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3003,
        SERVICE_NAME: 'notification-service'
      },
      error_file: './logs/notification-error.log',
      out_file: './logs/notification-out.log',
      log_file: './logs/notification-combined.log',
      time: true,
      kill_timeout: 5000,
      listen_timeout: 5000,
      wait_ready: true
    }
  ],

  // Deployment configuration
  deploy: {
    development: {
      user: 'cloudpanel',
      host: 'test.fitflow.example.com',
      ref: 'origin/main',
      repo: 'https://github.com/czhaoca/FitFlow.git',
      path: '/home/cloudpanel/htdocs/test.fitflow.example.com',
      'post-deploy': 'npm install && pm2 startOrRestart ecosystem.config.js --env development',
      env: {
        NODE_ENV: 'development'
      }
    },
    production: {
      user: 'cloudpanel',
      host: 'api.fitflow.ca',
      ref: 'origin/main',
      repo: 'https://github.com/czhaoca/FitFlow.git',
      path: '/home/cloudpanel/htdocs/api.fitflow.ca',
      'post-deploy': 'npm install && pm2 startOrRestart ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};