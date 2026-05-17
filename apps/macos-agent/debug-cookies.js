#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

async function main() {
  console.log('=== VidShorter Cookie Debug Tool ===\n');
  
  // 1. Check Chrome cookies database
  const chromeCookieDb = path.join(process.env.HOME, 'Library/Application Support/Google/Chrome/Default/Cookies');
  console.log('1. Checking Chrome cookies database...');
  console.log(`   Path: ${chromeCookieDb}`);
  
  try {
    const stat = fs.statSync(chromeCookieDb);
    console.log(`   ✅ Found, size: ${stat.size} bytes`);
  } catch (e) {
    console.log(`   ❌ Not found: ${e.message}`);
  }

  // 2. Check if yt-dlp can read cookies
  console.log('\n2. Testing yt-dlp cookie extraction...');
  try {
    const result = await execFileAsync('python3', [
      '-m', 'yt_dlp',
      '--cookies-from-browser', 'chrome',
      '--cookies', '/tmp/test-cookies.txt',
      '--skip-download',
      '--no-playlist',
      '-q',
      'https://www.youtube.com/watch?v=7qWH7e_AEDs'
    ], { timeout: 15000 });
    console.log('   ✅ yt-dlp cookie extraction succeeded');
    
    const cookieFile = '/tmp/test-cookies.txt';
    if (fs.existsSync(cookieFile)) {
      const content = fs.readFileSync(cookieFile, 'utf-8');
      const lines = content.split('\n').filter(line => !line.startsWith('#') && line.trim());
      console.log(`   Cookie file created with ${lines.length} cookies`);
      
      // Check for YouTube-related cookies
      const ytCookies = lines.filter(line => line.includes('.youtube.com') || line.includes('youtube.com'));
      console.log(`   YouTube cookies found: ${ytCookies.length}`);
      if (ytCookies.length > 0) {
        console.log('   Sample YouTube cookies:');
        ytCookies.slice(0, 3).forEach(c => console.log(`     ${c.split('\t')[5]}=${c.split('\t')[6]}`));
      }
    }
  } catch (e) {
    console.log(`   ❌ yt-dlp cookie extraction failed: ${e.message}`);
    if (e.stderr) console.log(`   Stderr: ${e.stderr.toString().slice(0, 200)}`);
  }

  // 3. Test yt-dlp directly with cookies
  console.log('\n3. Testing yt-dlp download with cookies...');
  try {
    const result = await execFileAsync('python3', [
      '-m', 'yt_dlp',
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
    console.log(`   ❌ yt-dlp download test failed: ${e.message}`);
    if (e.stderr) {
      const stderr = e.stderr.toString();
      console.log(`   Stderr: ${stderr.slice(0, 300)}`);
      
      if (stderr.includes('Sign in') || stderr.includes('login')) {
        console.log('\n   ⚠️  YouTube is asking for login');
        console.log('   Make sure you are logged into YouTube in Chrome');
      }
    }
  }

  // 4. Check Python availability
  console.log('\n4. Checking Python environment...');
  try {
    const result = await execFileAsync('python3', ['--version'], { timeout: 5000 });
    console.log(`   Python version: ${result.stdout.toString().trim()}`);
    
    const pipResult = await execFileAsync('python3', ['-m', 'pip', 'show', 'yt-dlp'], { timeout: 5000 });
    const pipOutput = pipResult.stdout.toString();
    const versionMatch = pipOutput.match(/Version: (\d+\.\d+\.\d+)/);
    console.log(`   yt-dlp version: ${versionMatch ? versionMatch[1] : 'unknown'}`);
  } catch (e) {
    console.log(`   ❌ Python check failed: ${e.message}`);
  }

  console.log('\n=== Debug Complete ===');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
