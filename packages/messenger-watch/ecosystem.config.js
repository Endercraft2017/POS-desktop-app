// pm2 config for messenger-watch on the Kali server.
// Restart with: pm2 restart messenger-watch
module.exports = {
  apps: [
    {
      name: 'messenger-watch',
      script: 'src/index.js',
      cwd: '/var/www/3ks.afkcube.com/messenger-watch',
      // Restart on crash. The script also self-exits every RESTART_AFTER_HOURS
      // and pm2 picks it back up under this policy.
      autorestart: true,
      // Back off between restarts so a permanently-broken login doesn't burn CPU.
      restart_delay: 60_000,
      max_restarts: 20,
      // Headless Chromium can hold ~400-700 MB of resident memory. Restart if
      // it ever grows past 1.5 GB (covers leaks during long-running sessions).
      max_memory_restart: '1500M',
      env: {
        NODE_ENV: 'production',
      },
      out_file: '/var/log/messenger-watch.out.log',
      error_file: '/var/log/messenger-watch.err.log',
      merge_logs: true,
    },
  ],
};
