interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

let SupabaseClientClass: any = null;
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

async function loadSupabaseModule() {
  if (SupabaseClientClass) return SupabaseClientClass;
  const mod = await import('@supabase/supabase-js');
  SupabaseClientClass = mod.createClient;
  return SupabaseClientClass;
}

function getSupabaseClient(token?: string) {
  if (cachedClient && !token) {
    return cachedClient;
  }

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

  if (typeof window !== 'undefined' && !cachedClient) {
    const lazyClient: any = {
      _realClient: null,
      _initPromise: null,
      _ensureClient: async function() {
        if (this._realClient) return this._realClient;
        if (this._initPromise) return this._initPromise;
        this._initPromise = loadSupabaseModule().then(createClient => {
          this._realClient = createClient(url, anonKey, {
            global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
            db: { timeout: 60000 },
            auth: {
              autoRefreshToken: true,
              persistSession: true,
              detectSessionInUrl: true,
            },
          });
          cachedClient = this._realClient;
          if (typeof window !== 'undefined') {
            (window as any).__supabaseClient = this._realClient;
          }
          return this._realClient;
        });
        return this._initPromise;
      },
      get auth() {
        const self = this;
        return new Proxy({}, {
          get(_, prop) {
            return async (...args: any[]) => {
              const client = await self._ensureClient();
              return client.auth[prop](...args);
            };
          }
        });
      },
      from(table: string) {
        const self = this;
        return new Proxy({}, {
          get(_, prop) {
            return async (...args: any[]) => {
              const client = await self._ensureClient();
              return client.from(table)[prop](...args);
            };
          }
        });
      },
    };
    return lazyClient;
  }

  return cachedClient;
}

export { getSupabaseCredentials, getSupabaseClient, isSupabaseConfigured };
