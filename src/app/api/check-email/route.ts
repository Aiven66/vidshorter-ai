import { NextRequest } from 'next/server';
import { getSupabaseClient, isSupabaseConfigured } from '@/storage/database/supabase-client';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'Invalid email address' }, { status: 400 });
  }

  // Check demo mode registered users
  if (!isSupabaseConfigured()) {
    const DEMO_REGISTERED_USERS_KEY = 'vidshorter_registered_users';
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
    
    // Check auth users
    const { data: { users }, error: authError } = await client.auth.admin.listUsers();
    if (!authError && users) {
      const authExists = users.some(u => u.email?.toLowerCase() === email.toLowerCase());
      if (authExists) {
        return Response.json({ exists: true });
      }
    }

    // Also check users table
    const { data: userData, error: userError } = await client
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    
    if (!userError && userData) {
      return Response.json({ exists: true });
    }

    return Response.json({ exists: false });
  } catch {
    return Response.json({ exists: false });
  }
}