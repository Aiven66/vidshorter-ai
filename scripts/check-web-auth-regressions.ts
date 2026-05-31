import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getSupabaseClient } from '../src/storage/database/supabase-client';

const root = process.cwd();

function readProjectFile(filePath: string): string {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

const client = getSupabaseClient();
assert.equal(typeof client.auth.getSession, 'function');
assert.equal(typeof client.auth.signInWithPassword, 'function');
assert.equal(typeof client.auth.signInWithOAuth, 'function');
assert.equal(typeof client.from('users').select, 'function');

const query = client
  .from('users')
  .select('id')
  .eq('email', 'auth-regression@example.com')
  .maybeSingle();
assert.equal(typeof query.then, 'function');

const tokenClient = getSupabaseClient('auth-regression-token');
assert.notEqual(tokenClient, client);
assert.equal(typeof tokenClient.auth.getUser, 'function');

const callbackSource = readProjectFile('src/app/auth/callback/page.tsx');
assert.match(callbackSource, /new CustomEvent\('clipop-auth-session'/);
assert.match(callbackSource, /window\.dispatchEvent\(new Event\('clipop-auth-change'\)\)/);
assert.match(callbackSource, /accessToken: sessionForRedirect\.accessToken/);
assert.match(callbackSource, /refreshToken: sessionForRedirect\.refreshToken/);

const authContextSource = readProjectFile('src/lib/auth-context.tsx');
assert.match(authContextSource, /window\.addEventListener\('clipop-auth-session'/);
assert.match(authContextSource, /window\.removeEventListener\('clipop-auth-session'/);
assert.match(authContextSource, /client\.auth\.getUser\(token\)/);
assert.match(authContextSource, /getSignInProviderHint/);
assert.match(authContextSource, /already connected to Google sign-in/);

console.log('Web auth regression checks passed.');
