#!/usr/bin/env node
const { execFile, exec } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

async function main() {
  console.log('=== Exec Debug ===\n');
  
  // Test 1: execFile with full path
  console.log('1. Testing execFile with full path...');
  try {
    const result = await execFileAsync('/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent/bin/yt-dlp', ['--version'], {
      timeout: 10000,
      env: { ...process.env }
    });
    console.log(`   ✅ Success: ${result.stdout.toString().trim()}`);
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
    console.log(`   Code: ${e.code}`);
    console.log(`   Signal: ${e.signal}`);
    if (e.stdout) console.log(`   Stdout: ${e.stdout.toString()}`);
    if (e.stderr) console.log(`   Stderr: ${e.stderr.toString()}`);
  }

  // Test 2: exec with shell
  console.log('\n2. Testing exec with shell...');
  try {
    const result = await execAsync('/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent/bin/yt-dlp --version', {
      timeout: 10000,
      env: { ...process.env }
    });
    console.log(`   ✅ Success: ${result.stdout.toString().trim()}`);
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
    if (e.stdout) console.log(`   Stdout: ${e.stdout.toString()}`);
    if (e.stderr) console.log(`   Stderr: ${e.stderr.toString()}`);
  }

  // Test 3: execFile with shell option
  console.log('\n3. Testing execFile with shell option...');
  try {
    const result = await execFileAsync('/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent/bin/yt-dlp', ['--version'], {
      timeout: 10000,
      shell: true,
      env: { ...process.env }
    });
    console.log(`   ✅ Success: ${result.stdout.toString().trim()}`);
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
    console.log(`   Code: ${e.code}`);
    console.log(`   Signal: ${e.signal}`);
    if (e.stdout) console.log(`   Stdout: ${e.stdout.toString()}`);
    if (e.stderr) console.log(`   Stderr: ${e.stderr.toString()}`);
  }

  // Test 4: Check PATH
  console.log('\n4. Checking PATH...');
  console.log(`   PATH: ${process.env.PATH}`);
  
  console.log('\n=== Debug Complete ===');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
