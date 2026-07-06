/**
 * windows-cli.ts
 * Windows 版 Agent CLI，对应 macOS 的 cli.ts。
 *
 * 差异：macOS 用 launchd (launchctl bootstrap/bootout) 管理常驻 Agent；
 *       Windows 用 Task Scheduler (schtasks) 管理开机自启 + 常驻任务。
 *
 * 环境变量传递：macOS 通过 plist 的 EnvironmentVariables；
 *              Windows Task Scheduler 不直接支持环境变量，
 *              因此生成 wrapper .cmd 脚本设置环境变量后启动 node runner.js。
 *
 * 命令：install / uninstall / start / stop / status
 */

import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

type Command = 'install' | 'uninstall' | 'start' | 'stop' | 'status' | 'print';

const TASK_NAME = 'ClipopAgent';

function argValue(args: string[], name: string) {
  const idx = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (idx < 0) return '';
  const raw = args[idx].includes('=') ? args[idx].split('=').slice(1).join('=') : args[idx + 1];
  return (raw || '').trim();
}

function mustGetEnv(name: string, fallback = '') {
  return (process.env[name] || fallback).trim();
}

/** Windows wrapper .cmd 脚本：设置环境变量 + 启动 node runner.js（对应 macOS plist 的 EnvironmentVariables） */
function renderWrapperCmd(params: {
  runnerPath: string;
  serverUrl: string;
  agentId: string;
  secret: string;
  stdoutPath: string;
  stderrPath: string;
}): string {
  const envLines: string[] = [
    `set "VIDSHORTER_SERVER_URL=${params.serverUrl}"`,
    `set "VIDSHORTER_AGENT_ID=${params.agentId}"`,
  ];
  if (params.secret) envLines.push(`set "AGENT_SECRET=${params.secret}"`);
  // 与 runner.ts main() 中的默认值保持一致
  envLines.push(`set "PREFER_EDGE_YOUTUBE=0"`);
  envLines.push(`set "INLINE_CLIPS=0"`);

  const envBlock = envLines.join('\r\n');
  const runnerWin = toWindowsPath(params.runnerPath);
  const stdoutWin = toWindowsPath(params.stdoutPath);
  const stderrWin = toWindowsPath(params.stderrPath);

  return `@echo off\r\nREM Clipop AI Windows Agent wrapper (auto-generated)\r\n${envBlock}\r\nnode "${runnerWin}" 1>>"${stdoutWin}" 2>>"${stderrWin}"\r\n`;
}

/** Task Scheduler XML 定义（对应 macOS plist），开机自启 + 崩溃自动重启 */
function renderTaskXml(params: {
  wrapperPath: string;
  workingDir: string;
}): string {
  const wrapperWin = toWindowsPath(params.wrapperPath);
  const workWin = toWindowsPath(params.workingDir);
  const xmlEsc = (s: string) => s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Clipop AI Background Agent - polls server for video processing jobs</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
    <BootTrigger>
      <Enabled>true</Enabled>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>5</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xmlEsc(wrapperWin)}</Command>
      <WorkingDirectory>${xmlEsc(workWin)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}

/** 转换为 Windows 路径格式（反斜杠） */
function toWindowsPath(p: string): string {
  return p.replace(/\//g, '\\');
}

/** 运行 schtasks 命令 */
function schtasks(args: string[]): { code: number; stdout: string; stderr: string } {
  const res = spawnSync('schtasks', args, { stdio: 'pipe', encoding: 'utf8', shell: true });
  return { code: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || '' };
}

/** 安装目录 */
function paths() {
  const home = os.homedir();
  const agentDir = path.join(home, 'AppData', 'Local', 'ClipopAgent');
  const wrapperPath = path.join(agentDir, 'clipop-agent.cmd');
  const taskXmlPath = path.join(agentDir, 'clipop-agent-task.xml');
  const logDir = path.join(agentDir, 'logs');
  const stdoutPath = path.join(logDir, 'out.log');
  const stderrPath = path.join(logDir, 'err.log');
  return { agentDir, wrapperPath, taskXmlPath, logDir, stdoutPath, stderrPath };
}

/** 查找 runner.js（优先同目录，其次 dist/agent/） */
function runnerDistPath(): string {
  const local = path.join(path.dirname(__filename), 'runner.js');
  if (existsSync(local)) return local;
  const cwdPath = path.join(process.cwd(), 'dist', 'agent', 'runner.js');
  if (existsSync(cwdPath)) return cwdPath;
  // Windows 发布包：runner.js 与 cli.js 同目录
  return path.join(path.dirname(__filename), 'runner.js');
}

function usage() {
  return [
    'Clipop AI Windows Agent CLI',
    '',
    'Usage:',
    '  1. Build: pnpm agent:build',
    '  2. node cli.js install --server https://<your-domain> [--secret <AGENT_SECRET>] [--agentId agent-xxx]',
    '  3. node cli.js start|stop|status|uninstall',
    '',
    'Environment variables (alternative to flags):',
    '  VIDSHORTER_SERVER_URL, AGENT_SECRET, VIDSHORTER_AGENT_ID',
  ].join('\n');
}

async function install(args: string[]) {
  const serverUrl = argValue(args, '--server') || mustGetEnv('VIDSHORTER_SERVER_URL', '').replace(/\/$/, '');
  if (!serverUrl) {
    process.stderr.write(`${usage()}\n`);
    process.exit(1);
  }

  const secret = argValue(args, '--secret') || mustGetEnv('AGENT_SECRET', '');
  const agentId = argValue(args, '--agentId') || mustGetEnv('VIDSHORTER_AGENT_ID', `agent-win-${randomUUID().slice(0, 8)}`);

  const runnerPath = runnerDistPath();
  if (!existsSync(runnerPath)) {
    process.stderr.write('Missing runner.js. Run: pnpm agent:build\n');
    process.exit(1);
  }

  const { agentDir, wrapperPath, taskXmlPath, logDir, stdoutPath, stderrPath } = paths();
  await mkdir(agentDir, { recursive: true });
  await mkdir(logDir, { recursive: true });

  // 1. 生成 wrapper .cmd（设置环境变量 + 启动 node runner.js）
  const wrapper = renderWrapperCmd({
    runnerPath,
    serverUrl,
    agentId,
    secret,
    stdoutPath,
    stderrPath,
  });
  await writeFile(wrapperPath, wrapper, 'utf8');

  // 2. 生成 Task Scheduler XML
  const taskXml = renderTaskXml({
    wrapperPath,
    workingDir: path.dirname(runnerPath),
  });
  await writeFile(taskXmlPath, taskXml, 'utf16le');

  // 3. 注册 Task Scheduler 任务（先删除旧任务避免冲突）
  schtasks(['/delete', '/tn', TASK_NAME, '/f']);
  const create = schtasks(['/create', '/tn', TASK_NAME, '/xml', toWindowsPath(taskXmlPath), '/f']);
  if (create.code !== 0) {
    process.stderr.write(`Failed to create scheduled task:\n${create.stderr}\n`);
    process.exit(1);
  }

  // 4. 立即启动
  schtasks(['/run', '/tn', TASK_NAME]);

  process.stdout.write([
    'Clipop AI Windows Agent installed successfully!',
    `  Task:     ${TASK_NAME}`,
    `  Wrapper:  ${wrapperPath}`,
    `  Config:   ${taskXmlPath}`,
    `  Logs:     ${logDir}`,
    `  Agent ID: ${agentId}`,
    `  Server:   ${serverUrl}`,
    '',
    'The agent will auto-start on logon and restart on crash.',
    'Use "node cli.js status" to check, "node cli.js stop" to pause.',
  ].join('\r\n'));
}

async function uninstall() {
  schtasks(['/end', '/tn', TASK_NAME]);
  const del = schtasks(['/delete', '/tn', TASK_NAME, '/f']);
  if (del.code !== 0) {
    process.stderr.write(`Failed to delete task: ${del.stderr}\n`);
  }

  const { wrapperPath, taskXmlPath } = paths();
  await rm(wrapperPath, { force: true });
  await rm(taskXmlPath, { force: true });

  process.stdout.write('Clipop AI Windows Agent uninstalled.\n');
}

function start() {
  const res = schtasks(['/run', '/tn', TASK_NAME]);
  if (res.code !== 0) {
    process.stderr.write(`Failed to start: ${res.stderr}\n`);
    process.exit(1);
  }
  process.stdout.write('Agent started.\n');
}

function stop() {
  const res = schtasks(['/end', '/tn', TASK_NAME]);
  if (res.code !== 0) {
    process.stderr.write(`Failed to stop: ${res.stderr}\n`);
    process.exit(1);
  }
  process.stdout.write('Agent stopped.\n');
}

function printStatus() {
  const res = schtasks(['/query', '/tn', TASK_NAME, '/v', '/fo', 'list']);
  if (res.code !== 0) {
    process.stdout.write('Agent not installed or not running.\n');
    return;
  }
  process.stdout.write(res.stdout);

  // 检查日志文件
  const { stdoutPath, stderrPath } = paths();
  if (existsSync(stdoutPath)) {
    process.stdout.write(`\n--- Last 5 lines of stdout (${stdoutPath}) ---\n`);
  }
  if (existsSync(stderrPath)) {
    process.stdout.write(`\n--- Last 5 lines of stderr (${stderrPath}) ---\n`);
  }
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
    process.stderr.write(`Unknown command: ${cmd}\n\n${usage()}\n`);
    process.exit(1);
  }
}

main();
