#!/usr/bin/env node

const path = require('path');
const { finalizeMacApp } = require('./mac-package-utils');

const root = path.resolve(__dirname, '..');
const appPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'dist', 'mac-arm64', 'Clipop Agent.app');

try {
  finalizeMacApp(appPath, { root });
} catch (error) {
  console.error(`[finalize-mac-app] ${error.message}`);
  process.exit(1);
}
