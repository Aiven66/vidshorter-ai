import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

// Cache for Supabase client
let cachedClient: SupabaseClient | null = null;

// Check if Supabase is configured with valid credentials
function isSupabaseConfigured(): boolean {
  const url = 
    process.env.NEXT_PUBLIC_SUPABASE_URL || 
    process.env.COZE_SUPABASE_URL;
    
  const anonKey = 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    process.env.COZE_SUPABASE_ANON_KEY;
    
  // Check if both values exist and are not empty
  if (!url || !anonKey || url === '' || anonKey === '') {
    return false;
  }
  
  // Validate URL format (should be a valid Supabase URL)
  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.includes('supabase.co') && 
        !parsedUrl.hostname.includes('supabase.net') &&
        !parsedUrl.hostname.includes('supabase.in')) {
      // Not a Supabase URL - could be placeholder
      return false;
    }
  } catch {
    return false;
  }
  
  // Validate anon key format (should be a JWT with 3 parts separated by dots)
  const keyParts = anonKey.split('.');
  if (keyParts.length !== 3) {
    // Not a valid JWT format - likely a placeholder
    return false;
  }
  
  return true;
}

function getSupabaseCredentials(): SupabaseCredentials {
  // Try multiple sources for credentials
  // 1. NEXT_PUBLIC_ prefixed (client-side accessible via next.config.ts mapping)
  // 2. COZE_ prefixed (server-side from Coze platform)
  
  const url = 
    process.env.NEXT_PUBLIC_SUPABASE_URL || 
    process.env.COZE_SUPABASE_URL ||
    '';
    
  const anonKey = 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    process.env.COZE_SUPABASE_ANON_KEY ||
    '';

  if (!url || !anonKey) {
    console.warn('Supabase credentials not found. Demo mode will be used.');
  }

  return { url, anonKey };
}

function getSupabaseClient(token?: string): SupabaseClient {
  const { url, anonKey } = getSupabaseCredentials();

  // Return cached client if available and no custom token
  if (cachedClient && !token) {
    return cachedClient;
  }

  // Validate credentials - return a dummy client that won't make network calls
  // This prevents errors when Supabase is not configured
  if (!url || !anonKey) {
    // Create a client with dummy values - it will fail gracefully on API calls
    // But won't throw during initialization
    const dummyUrl = 'https://placeholder.supabase.co';
    const dummyKey = 'placeholder-key';
    
    const client = createClient(dummyUrl, dummyKey, {
      global: token ? {
        headers: { Authorization: `Bearer ${token}` },
      } : undefined,
      db: {
        timeout: 1000, // Short timeout for placeholder
      },
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
    db: {
      timeout: 60000,
    },
    auth: {
      autoRefreshToken: true,
      persistSession: typeof window !== 'undefined', // Only persist in browser
      detectSessionInUrl: true,
    },
  });

  // Cache the default client (without custom token)
  if (!token && !cachedClient) {
    cachedClient = client;
  }

  return client;
}

// For server-side use only - fetches credentials from Coze workload identity
// Note: This function is deprecated. Use environment variables directly instead.
async function getSupabaseCredentialsFromCoze(): Promise<SupabaseCredentials> {
  // This function is no longer supported in the browser build
  // Use NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables
  console.warn('getSupabaseCredentialsFromCoze is deprecated. Use environment variables instead.');
  return getSupabaseCredentials();
}

export { getSupabaseCredentials, getSupabaseClient, getSupabaseCredentialsFromCoze, isSupabaseConfigured };
