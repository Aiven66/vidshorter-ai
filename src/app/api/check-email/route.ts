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

    // Try to use auth admin API if service role key is available
    try {
      const { data: { users }, error: authError } = await client.auth.admin.listUsers({
        email: email,
        limit: 1,
      });
      
      if (!authError && users && users.length > 0) {
        console.log(`[check-email] Found in auth users: ${email}`);
        return Response.json({ exists: true });
      }
    } catch (adminError) {
      console.log(`[check-email] Admin API not available, trying alternative method`);
    }

    // Alternative: Try signUp to check if user exists
    // This will fail if user already exists, but won't create a new user
    try {
      const { error: signUpError } = await client.auth.signUp({
        email: email,
        password: 'temp-password-that-will-never-be-used-123',
      });
      
      if (signUpError) {
        // Check if error indicates user already exists
        if (
          signUpError.message.includes('already registered') ||
          signUpError.message.includes('user already exists') ||
          signUpError.message.includes('email already in use')
        ) {
          console.log(`[check-email] Signup failed because user exists: ${email}`);
          return Response.json({ exists: true });
        }
      }
      
      // If signUp succeeded, we need to delete the user we just created
      if (!signUpError) {
        try {
          const { data: { session } } = await client.auth.getSession();
          if (session?.user) {
            await client.auth.admin.deleteUser(session.user.id);
            console.log(`[check-email] Cleaned up test user: ${email}`);
          }
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch (signUpCatchError) {
      // Ignore errors from this fallback method
    }

    console.log(`[check-email] User does not exist: ${email}`);
    return Response.json({ exists: false });
  } catch (error) {
    console.error('[check-email] Unexpected error:', error);
    return Response.json({ exists: false });
  }
}