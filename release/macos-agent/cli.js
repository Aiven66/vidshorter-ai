"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/agent/cli.ts
var import_node_fs = require("fs");
var import_promises = require("fs/promises");
var import_node_os = __toESM(require("os"));
var import_node_path = __toESM(require("path"));
var import_node_child_process = require("child_process");
var import_node_crypto = require("crypto");
function argValue(args, name) {
  const idx = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (idx < 0) return "";
  const raw = args[idx].includes("=") ? args[idx].split("=").slice(1).join("=") : args[idx + 1];
  return (raw || "").trim();
}
function mustGetEnv(name, fallback = "") {
  return (process.env[name] || fallback).trim();
}
function plistEscape(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function renderPlist(params) {
  const envVars = [
    ["VIDSHORTER_SERVER_URL", params.serverUrl],
    ["VIDSHORTER_AGENT_ID", params.agentId]
  ];
  if (params.secret) envVars.push(["AGENT_SECRET", params.secret]);
  const envXml = envVars.map(([k, v]) => `<key>${plistEscape(k)}</key><string>${plistEscape(v)}</string>`).join("");
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
function launchctl(args) {
  const res = (0, import_node_child_process.spawnSync)("launchctl", args, { stdio: "pipe", encoding: "utf8" });
  return { code: res.status ?? 1, stdout: res.stdout || "", stderr: res.stderr || "" };
}
function domain() {
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  return `gui/${uid}`;
}
function label() {
  return "com.vidshorter.agent";
}
function paths() {
  const home = import_node_os.default.homedir();
  const plistPath = import_node_path.default.join(home, "Library", "LaunchAgents", `${label()}.plist`);
  const logDir = import_node_path.default.join(home, "Library", "Logs", "VidShorterAgent");
  const stdoutPath = import_node_path.default.join(logDir, "out.log");
  const stderrPath = import_node_path.default.join(logDir, "err.log");
  return { plistPath, logDir, stdoutPath, stderrPath };
}
function runnerDistPath() {
  const local = import_node_path.default.join(import_node_path.default.dirname(__filename), "runner.js");
  if ((0, import_node_fs.existsSync)(local)) return local;
  return import_node_path.default.join(process.cwd(), "dist", "agent", "runner.js");
}
function usage() {
  return [
    "Usage:",
    "  pnpm agent:build",
    "  pnpm agent:mac install --server https://<your-domain> [--secret <AGENT_SECRET>] [--agentId agent-xxx]",
    "  pnpm agent:mac start|stop|status|print|uninstall"
  ].join("\n");
}
async function install(args) {
  const serverUrl = argValue(args, "--server") || mustGetEnv("VIDSHORTER_SERVER_URL", "").replace(/\/$/, "");
  if (!serverUrl) {
    process.stderr.write(`${usage()}
`);
    process.exit(1);
  }
  const secret = argValue(args, "--secret") || mustGetEnv("AGENT_SECRET", "");
  const agentId = argValue(args, "--agentId") || mustGetEnv("VIDSHORTER_AGENT_ID", `agent-${(0, import_node_crypto.randomUUID)()}`);
  const runnerPath = runnerDistPath();
  if (!(0, import_node_fs.existsSync)(runnerPath)) {
    process.stderr.write("Missing dist/agent/runner.js. Run: pnpm agent:build\n");
    process.exit(1);
  }
  const { plistPath, logDir, stdoutPath, stderrPath } = paths();
  await (0, import_promises.mkdir)(import_node_path.default.dirname(plistPath), { recursive: true });
  await (0, import_promises.mkdir)(logDir, { recursive: true });
  const plist = renderPlist({
    label: label(),
    runnerPath,
    serverUrl,
    agentId,
    secret,
    stdoutPath,
    stderrPath
  });
  await (0, import_promises.writeFile)(plistPath, plist, "utf8");
  launchctl(["bootout", domain(), plistPath]);
  const boot = launchctl(["bootstrap", domain(), plistPath]);
  if (boot.code !== 0) {
    const load = launchctl(["load", "-w", plistPath]);
    if (load.code !== 0) {
      process.stderr.write(`${boot.stderr}
${load.stderr}
`);
      process.exit(1);
    }
  }
  launchctl(["kickstart", "-k", `${domain()}/${label()}`]);
  process.stdout.write(`Installed: ${plistPath}
`);
}
async function uninstall() {
  const { plistPath } = paths();
  launchctl(["bootout", domain(), plistPath]);
  launchctl(["unload", "-w", plistPath]);
  await (0, import_promises.rm)(plistPath, { force: true });
  process.stdout.write("Uninstalled\n");
}
function start() {
  const { plistPath } = paths();
  const res = launchctl(["kickstart", "-k", `${domain()}/${label()}`]);
  if (res.code === 0) {
    process.stdout.write("Started\n");
    return;
  }
  const boot = launchctl(["bootstrap", domain(), plistPath]);
  if (boot.code !== 0) {
    process.stderr.write(`${boot.stderr}
`);
    process.exit(1);
  }
  const ks = launchctl(["kickstart", "-k", `${domain()}/${label()}`]);
  if (ks.code !== 0) {
    process.stderr.write(`${ks.stderr}
`);
    process.exit(1);
  }
  process.stdout.write("Started\n");
}
function stop() {
  const { plistPath } = paths();
  const res = launchctl(["bootout", domain(), plistPath]);
  if (res.code !== 0) {
    const unload = launchctl(["unload", "-w", plistPath]);
    if (unload.code !== 0) {
      process.stderr.write(`${res.stderr}
${unload.stderr}
`);
      process.exit(1);
    }
  }
  process.stdout.write("Stopped\n");
}
function printStatus() {
  const res = launchctl(["print", `${domain()}/${label()}`]);
  if (res.code !== 0) {
    process.stdout.write("not running\n");
    return;
  }
  process.stdout.write(res.stdout);
}
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || "";
  if (!cmd) {
    process.stdout.write(`${usage()}
`);
    return;
  }
  if (cmd === "install") await install(args.slice(1));
  else if (cmd === "uninstall") await uninstall();
  else if (cmd === "start") start();
  else if (cmd === "stop") stop();
  else if (cmd === "status") printStatus();
  else if (cmd === "print") printStatus();
  else {
    process.stdout.write(`${usage()}
`);
    process.exit(1);
  }
}
main();
