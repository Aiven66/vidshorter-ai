import { createClient } from '@supabase/supabase-js';

interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

let cachedClient: any = null;

function isSupabaseConfigured(): boolean {
  const url = 
    process.env.NEXT_PUBLIC_SUPABASE_URL || 
    process.env.COZE_SUPABASE_URL;
    
  const anonKey = 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    process.env.COZE_SUPABASE_ANON_KEY;
    
  if (!url || !anonKey || url === '' || anonKey === '') {
    return false;
  }
  
  if (typeof window !== 'undefined') {
    return true;
  }
  
  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.includes('supabase.co') && 
        !parsedUrl.hostname.includes('supabase.net') &&
        !parsedUrl.hostname.includes('supabase.in')) {
      return false;
    }
  } catch {
    return false;
  }
  
  const keyParts = anonKey.split('.');
  if (keyParts.length !== 3) {
    return false;
  }
  
  return true;
}

function getSupabaseCredentials(): SupabaseCredentials {
  const url = 
    process.env.NEXT_PUBLIC_SUPABASE_URL || 
    process.env.COZE_SUPABASE_URL ||
    '';
    
  const anonKey = 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    process.env.COZE_SUPABASE_ANON_KEY ||
    '';

  return { url, anonKey };
}

function getSupabaseClient(token?: string) {
  const { url, anonKey } = getSupabaseCredentials();

  if (!url || !anonKey) {
    const createPlaceholderClient = () => {
      const placeholder: any = {
        auth: {
          getSession: async () => ({ data: { session: null } }),
          getUser: async () => ({ data: { user: null } }),
          signInWithPassword: async () => ({ data: { session: null }, error: new Error('Not configured') }),
          signUp: async () => ({ data: { session: null }, error: new Error('Not configured') }),
          signInWithOAuth: async () => ({ data: { url: null }, error: new Error('Not configured') }),
          signOut: async () => ({}),
          setSession: async () => ({ data: { session: null }, error: null }),
        },
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          insert: async () => ({ error: null }),
        }),
      };
      return placeholder;
    };
    return createPlaceholderClient();
  }

  if (token) {
    return createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      db: { timeout: 60000 },
      auth: {
        autoRefreshToken: true,
        persistSession: false,
        detectSessionInUrl: false,
        flowType: 'implicit',
      },
    });
  }

  if (!cachedClient) {
    cachedClient = createClient(url, anonKey, {
      db: { timeout: 60000 },
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
      },
    });

    if (typeof window !== 'undefined') {
      (window as any).__supabaseClient = cachedClient;
    }
  }

  return cachedClient;
}

export { getSupabaseCredentials, getSupabaseClient, isSupabaseConfigured };
