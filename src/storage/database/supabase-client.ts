import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

let cachedClient: SupabaseClient | null = null;

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

function getSupabaseClient(token?: string): SupabaseClient {
  const { url, anonKey } = getSupabaseCredentials();

  if (cachedClient && !token) {
    return cachedClient;
  }

  if (!url || !anonKey) {
    const client = createClient('https://placeholder.supabase.co', 'placeholder-key', {
      global: token ? {
        headers: { Authorization: `Bearer ${token}` },
      } : undefined,
      db: { timeout: 1000 },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    return client;
  }

  const client = createClient(url, anonKey, {
    global: token ? {
      headers: { Authorization: `Bearer ${token}` },
    } : undefined,
    db: { timeout: 60000 },
    auth: {
      autoRefreshToken: true,
      persistSession: typeof window !== 'undefined',
      detectSessionInUrl: true,
    },
  });

  if (!token && !cachedClient) {
    cachedClient = client;
  }

  return client;
}

export { getSupabaseCredentials, getSupabaseClient, isSupabaseConfigured };
