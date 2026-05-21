import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function createSupabaseServerClient(request?: NextRequest) {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.COZE_SUPABASE_URL ||
    '';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.COZE_SUPABASE_ANON_KEY ||
    '';

  if (!url || !anonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  let response = NextResponse.next({
    request: request ? { headers: request.headers } : undefined,
  });

  const cookieStore = await cookies();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      },
    },
  });

  return { supabase, response };
}

export async function createSupabaseServerClientForMiddleware(request: NextRequest) {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.COZE_SUPABASE_URL ||
    '';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.COZE_SUPABASE_ANON_KEY ||
    '';

  if (!url || !anonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  return { supabase, response };
}
