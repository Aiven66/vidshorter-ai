const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const candidates = [
  path.join(process.resourcesPath || '', 'app.asar', 'node_modules'),
  path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules'),
  path.join(__dirname, '..', 'node_modules'),
  path.join(__dirname, '..', '..', '..', 'node_modules'),
].filter(Boolean).filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
process.env.NODE_PATH = candidates.join(':');
Module._initPaths();
require('./server.js');
