#!/usr/bin/env node
// Wrapper: runs expo export:embed from packages/mobile with absolute paths
// (fixes monorepo CWD issue where Metro can't resolve ./index.js)
const { execSync } = require('child_process');
const path = require('path');
const projectRoot = path.resolve(__dirname);

const args = process.argv.slice(2);
const fixed = [];
const pathFlags = ['--entry-file', '--bundle-output', '--assets-dest', '--sourcemap-output'];

for (let i = 0; i < args.length; i++) {
  if (pathFlags.includes(args[i]) && args[i + 1]) {
    fixed.push(args[i]);
    const p = args[i + 1];
    fixed.push(path.isAbsolute(p) ? p : path.resolve(projectRoot, p));
    i++;
  } else {
    fixed.push(args[i]);
  }
}

const cmd = `npx expo export:embed ${fixed.join(' ')}`;
console.log(`[bundle] CWD: ${projectRoot}`);
execSync(cmd, { cwd: projectRoot, stdio: 'inherit', env: { ...process.env } });
