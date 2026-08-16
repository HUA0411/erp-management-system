// PM2 生产集群配置：pm2 start ecosystem.config.js
// 说明：JWT 无状态 + 内存缓存，集群多进程无需共享会话；限流/缓存按进程独立，
// 如需跨进程一致性，升级为 Redis（见 README「Redis 升级路径」）。
module.exports = {
  apps: [
    {
      name: 'erp-server',
      cwd: './server',
      script: 'dist/main.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
