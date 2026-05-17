#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const YT_DLP_BIN = path.join(__dirname, 'bin', 'yt-dlp');

async function main() {
  console.log('=== VidShorter yt-dlp Debug Tool (Bundled) ===\n');
  
  // 1. Check yt-dlp binary
  console.log('1. Checking bundled yt-dlp...');
  console.log(`   Path: ${YT_DLP_BIN}`);
  
  try {
    const stat = fs.statSync(YT_DLP_BIN);
    console.log(`   ✅ Found, size: ${stat.size} bytes`);
    
    const { stdout } = await execFileAsync(YT_DLP_BIN, ['--version'], { timeout: 10000 });
    console.log(`   Version: ${stdout.toString().trim()}`);
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
    return;
  }

  // 2. Test yt-dlp with cookies from browser
  console.log('\n2. Testing yt-dlp with Chrome cookies...');
  try {
    const result = await execFileAsync(YT_DLP_BIN, [
      '--cookies-from-browser', 'chrome',
      '--extractor-args', 'youtube:player_client=tv_embedded',
      '--no-playlist',
      '-f', 'best[height<=720]',
      '-g',
      'https://www.youtube.com/watch?v=7qWH7e_AEDs'
    ], { timeout: 30000 });
    
    const urls = result.stdout.toString().split('\n').filter(line => line.startsWith('http'));
    if (urls.length > 0) {
      console.log(`   ✅ Successfully got stream URL: ${urls[0].slice(0, 80)}...`);
    } else {
      console.log('   ❌ No stream URL returned');
    }
  } catch (e) {
    console.log(`   ❌ Failed: ${e.message}`);
    if (e.stderr) {
      const stderr = e.stderr.toString();
      console.log(`   Stderr: ${stderr.slice(0, 400)}`);
      
      if (stderr.includes('Sign in') || stderr.includes('login')) {
        console.log('\n   ⚠️  YouTube is asking for login');
        console.log('   Make sure you are logged into YouTube in Chrome');
      }
    }
  }

  // 3. Test yt-dlp without cookies (fallback)
  console.log('\n3. Testing yt-dlp without cookies (fallback)...');
  try {
    const result = await execFileAsync(YT_DLP_BIN, [
      '--extractor-args', 'youtube:player_client=mweb',
      '--no-playlist',
      '-f', 'best[height<=720]',
      '-g',
      'https://www.youtube.com/watch?v=7qWH7e_AEDs'
    ], { timeout: 30000 });
    
    const urls = result.stdout.toString().split('\n').filter(line => line.startsWith('http'));
    if (urls.length > 0) {
      console.log(`   ✅ Successfully got stream URL: ${urls[0].slice(0, 80)}...`);
    } else {
      console.log('   ❌ No stream URL returned');
    }
  } catch (e) {
    console.log(`   ❌ Failed: ${e.message}`);
    if (e.stderr) {
      const stderr = e.stderr.toString();
      console.log(`   Stderr: ${stderr.slice(0, 400)}`);
    }
  }

  // 4. Test yt-dlp info
  console.log('\n4. Testing yt-dlp info...');
  try {
    const result = await execFileAsync(YT_DLP_BIN, [
      '--cookies-from-browser', 'chrome',
      '--no-playlist',
      '-j',
      'https://www.youtube.com/watch?v=7qWH7e_AEDs'
    ], { timeout: 30000 });
    
    const info = JSON.parse(result.stdout.toString());
    console.log(`   ✅ Video title: ${info.title}`);
    console.log(`   Duration: ${info.duration} seconds`);
    console.log(`   Formats available: ${info.formats.length}`);
  } catch (e) {
    console.log(`   ❌ Failed: ${e.message}`);
    if (e.stderr) {
      console.log(`   Stderr: ${e.stderr.slice(0, 200)}`);
    }
  }

  console.log('\n=== Debug Complete ===');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
