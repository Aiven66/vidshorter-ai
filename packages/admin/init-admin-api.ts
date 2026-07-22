/**
 * SERVER-ONLY — do not import from client components.
 *
 * Initialize the first admin account. Called once during deployment.
 * Idempotent: skips creation if an admin already exists.
 */

import type { AdminConfig } from './server/verify';
import { getTables } from './server/verify';

export interface InitAdminInput {
  email: string;
  password: string;
  name?: string;
}

/**
 * Ensure at least one admin exists.
 * 1. Check users table for role='admin'.
 * 2. If none, create the auth user via service-role auth.admin.createUser.
 * 3. Upsert users row with role='admin'.
 * 4. Insert credits (adminCredits balance) and pro subscription.
 */
export async function initAdmin(
  config: AdminConfig,
  input: InitAdminInput,
): Promise<{ created: boolean; message: string }> {
  const tables = getTables(config);
  const { email, password, name } = input;

  if (!email || !password) {
    throw new Error('initAdmin: email and password are required');
  }

  const url = config.supabaseUrl;
  const serviceKey = config.supabaseServiceRoleKey;
  if (!url || !serviceKey) {
    throw new Error('initAdmin: supabaseUrl and supabaseServiceRoleKey must be configured');
  }

  const { createClient } = await import('@supabase/supabase-js');
  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Check for existing admin.
  const { data: existing } = await adminClient
    .from(tables.users)
    .select('id')
    .eq('role', 'admin')
    .maybeSingle();

  if (existing) {
    return { created: false, message: 'Admin account already exists' };
  }

  // 2. Create the auth user.
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: name || 'Admin' },
  });

  if (authError) {
    // If already registered, attempt to look up and promote.
    if (authError.message.includes('already') || authError.message.includes('registered')) {
      const { data: listData } = await adminClient.auth.admin.listUsers();
      const found = (listData?.users || []).find((u) => u.email === email);
      if (found) {
        await adminClient
          .from(tables.users)
          .upsert({ id: found.id, email, name: name || 'Admin', role: 'admin' }, { onConflict: 'id' });
        await adminClient.from(tables.credits).upsert(
          { user_id: found.id, balance: config.adminCredits || 999999 },
          { onConflict: 'user_id' },
        );
        await adminClient.from(tables.subscriptions).upsert(
          { user_id: found.id, plan_type: 'pro', status: 'active' },
          { onConflict: 'user_id' },
        );
        return { created: true, message: 'Existing user promoted to admin' };
      }
    }
    throw new Error(`initAdmin: failed to create auth user: ${authError.message}`);
  }

  const userId = authData.user?.id;
  if (!userId) {
    throw new Error('initAdmin: auth user creation returned no id');
  }

  // 3. Upsert users row with admin role.
  await adminClient
    .from(tables.users)
    .upsert({ id: userId, email, name: name || 'Admin', role: 'admin' }, { onConflict: 'id' });

  // 4. Insert credits + pro subscription.
  await adminClient.from(tables.credits).insert({
    user_id: userId,
    balance: config.adminCredits || 999999,
  });

  await adminClient.from(tables.subscriptions).insert({
    user_id: userId,
    plan_type: 'pro',
    status: 'active',
  });

  return { created: true, message: 'Admin account created successfully' };
}
