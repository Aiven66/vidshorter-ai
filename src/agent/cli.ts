import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

type Command = 'install' | 'uninstall' | 'start' | 'stop' | 'status' | 'print';

function argValue(args: string[], name: string) {
  const idx = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (idx < 0) return '';
  const raw = args[idx].includes('=') ? args[idx].split('=').slice(1).join('=') : args[idx + 1];
  return (raw || '').trim();
}

function mustGetEnv(name: string, fallback = '') {
  return (process.env[name] || fallback).trim();
}

function plistEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function renderPlist(params: {
  label: string;
  runnerPath: string;
  serverUrl: string;
  agentId: string;
  secret: string;
  stdoutPath: string;
  stderrPath: string;
}) {
  const envVars: Array<[string, string]> = [
    ['VIDSHORTER_SERVER_URL', params.serverUrl],
    ['VIDSHORTER_AGENT_ID', params.agentId],
  ];
  if (params.secret) envVars.push(['AGENT_SECRET', params.secret]);

  const envXml = envVars
    .map(([k, v]) => `<key>${plistEscape(k)}</key><string>${plistEscape(v)}</string>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plistEscape(params.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>${plistEscape(params.runnerPath)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>${envXml}</dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${plistEscape(params.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${plistEscape(params.stderrPath)}</string>
</dict>
</plist>
`;
}

function launchctl(args: string[]) {
  const res = spawnSync('launchctl', args, { stdio: 'pipe', encoding: 'utf8' });
  return { code: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function domain() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  return `gui/${uid}`;
}

function label() {
  return 'com.vidshorter.agent';
}

function paths() {
  const home = os.homedir();
  const plistPath = path.join(home, 'Library', 'LaunchAgents', `${label()}.plist`);
  const logDir = path.join(home, 'Library', 'Logs', 'VidShorterAgent');
  const stdoutPath = path.join(logDir, 'out.log');
  const stderrPath = path.join(logDir, 'err.log');
  return { plistPath, logDir, stdoutPath, stderrPath };
}

function runnerDistPath() {
  const local = path.join(path.dirname(__filename), 'runner.js');
  if (existsSync(local)) return local;
  return path.join(process.cwd(), 'dist', 'agent', 'runner.js');
}

function usage() {
  return [
    'Usage:',
    '  pnpm agent:build',
    '  pnpm agent:mac install --server https://<your-domain> [--secret <AGENT_SECRET>] [--agentId agent-xxx]',
    '  pnpm agent:mac start|stop|status|print|uninstall',
  ].join('\n');
}

async function install(args: string[]) {
  const serverUrl = argValue(args, '--server') || mustGetEnv('VIDSHORTER_SERVER_URL', '').replace(/\/$/, '');
  if (!serverUrl) {
    process.stderr.write(`${usage()}\n`);
    process.exit(1);
  }

  const secret = argValue(args, '--secret') || mustGetEnv('AGENT_SECRET', '');
  const agentId = argValue(args, '--agentId') || mustGetEnv('VIDSHORTER_AGENT_ID', `agent-${randomUUID()}`);

  const runnerPath = runnerDistPath();
  if (!existsSync(runnerPath)) {
    process.stderr.write('Missing dist/agent/runner.js. Run: pnpm agent:build\n');
    process.exit(1);
  }

  const { plistPath, logDir, stdoutPath, stderrPath } = paths();
  await mkdir(path.dirname(plistPath), { recursive: true });
  await mkdir(logDir, { recursive: true });
  const plist = renderPlist({
    label: label(),
    runnerPath,
    serverUrl,
    agentId,
    secret,
    stdoutPath,
    stderrPath,
  });
  await writeFile(plistPath, plist, 'utf8');

  launchctl(['bootout', domain(), plistPath]);
  const boot = launchctl(['bootstrap', domain(), plistPath]);
  if (boot.code !== 0) {
    const load = launchctl(['load', '-w', plistPath]);
    if (load.code !== 0) {
      process.stderr.write(`${boot.stderr}\n${load.stderr}\n`);
      process.exit(1);
    }
  }

  launchctl(['kickstart', '-k', `${domain()}/${label()}`]);
  process.stdout.write(`Installed: ${plistPath}\n`);
}

async function uninstall() {
  const { plistPath } = paths();
  launchctl(['bootout', domain(), plistPath]);
  launchctl(['unload', '-w', plistPath]);
  await rm(plistPath, { force: true });
  process.stdout.write('Uninstalled\n');
}

function start() {
  const { plistPath } = paths();
  const res = launchctl(['kickstart', '-k', `${domain()}/${label()}`]);
  if (res.code === 0) {
    process.stdout.write('Started\n');
    return;
  }
  const boot = launchctl(['bootstrap', domain(), plistPath]);
  if (boot.code !== 0) {
    process.stderr.write(`${boot.stderr}\n`);
    process.exit(1);
  }
  const ks = launchctl(['kickstart', '-k', `${domain()}/${label()}`]);
  if (ks.code !== 0) {
    process.stderr.write(`${ks.stderr}\n`);
    process.exit(1);
  }
  process.stdout.write('Started\n');
}

function stop() {
  const { plistPath } = paths();
  const res = launchctl(['bootout', domain(), plistPath]);
  if (res.code !== 0) {
    const unload = launchctl(['unload', '-w', plistPath]);
    if (unload.code !== 0) {
      process.stderr.write(`${res.stderr}\n${unload.stderr}\n`);
      process.exit(1);
    }
  }
  process.stdout.write('Stopped\n');
}

function printStatus() {
  const res = launchctl(['print', `${domain()}/${label()}`]);
  if (res.code !== 0) {
    process.stdout.write('not running\n');
    return;
  }
  process.stdout.write(res.stdout);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = (args[0] || '') as Command;
  if (!cmd) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (cmd === 'install') await install(args.slice(1));
  else if (cmd === 'uninstall') await uninstall();
  else if (cmd === 'start') start();
  else if (cmd === 'stop') stop();
  else if (cmd === 'status') printStatus();
  else if (cmd === 'print') printStatus();
  else {
    process.stdout.write(`${usage()}\n`);
    process.exit(1);
  }
}

main();
