import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '@/storage/database/supabase-client';

export const runtime = 'nodejs';

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_TOKEN ||
    '';

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function findAuthUserByEmail(adminClient: any, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const found = data?.users?.find((user: any) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (!data?.users || data.users.length < 1000) break;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'Invalid email address' }, { status: 400 });
  }

  // Check demo mode registered users
  if (!isSupabaseConfigured()) {
    const DEMO_REGISTERED_USERS_KEY = 'clipop_registered_users';
    const usersJson = request.cookies.get(DEMO_REGISTERED_USERS_KEY)?.value || '';
    if (usersJson) {
      try {
        const users = JSON.parse(usersJson);
        const exists = users.some((u: { email: string }) => 
          u.email.toLowerCase() === email.toLowerCase()
        );
        return Response.json({ exists });
      } catch {
        return Response.json({ exists: false });
      }
    }
    return Response.json({ exists: false });
  }

  try {
    const client = getSupabaseClient();
    
    // First check users table (our app's users table)
    const { data: userData, error: userError } = await client
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    
    if (!userError && userData) {
      console.log(`[check-email] Found in users table: ${email}`);
      return Response.json({ exists: true });
    }

    const adminClient = getSupabaseAdminClient();
    if (adminClient) {
      const authUser = await findAuthUserByEmail(adminClient, email);
      if (authUser) {
        console.log(`[check-email] Found in auth users: ${email}`);
        return Response.json({ exists: true });
      }
    }

    console.log(`[check-email] User does not exist: ${email}`);
    return Response.json({ exists: false });
  } catch (error) {
    console.error('[check-email] Unexpected error:', error);
    return Response.json({ exists: false });
  }
}
