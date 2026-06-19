import { NextRequest, NextResponse } from 'next/server';

const VERIFIED_ADMINS = new Set([
  'admin@126.com',
  'admin@clipop.ai',
]);

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payload.length % 4;
    if (pad) payload += '='.repeat(4 - pad);
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function hasAdminClaim(accessToken: string): boolean {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return false;

  const role = typeof payload.role === 'string' ? payload.role : '';
  if (role === 'admin') return true;

  const email = typeof payload.email === 'string' ? payload.email : '';
  if (email && VERIFIED_ADMINS.has(email.toLowerCase())) return true;

  if (payload.user_metadata && typeof payload.user_metadata === 'object') {
    const meta = payload.user_metadata as Record<string, unknown>;
    const metaEmail = typeof meta.email === 'string' ? meta.email : '';
    if (metaEmail && VERIFIED_ADMINS.has(metaEmail.toLowerCase())) return true;
  }

  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname === '/ax' || pathname.startsWith('/ax/');
  const isAdminLoginPage = pathname === '/ax/login';

  if (isAdminRoute && !isAdminLoginPage) {
    const authHeader = request.headers.get('authorization') || '';
    const cookieToken = request.cookies.get('clipop_access_token')?.value || '';

    const bearerMatch = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';

    const token = bearerMatch || cookieToken || '';

    if (!token) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/ax/login';
      return NextResponse.redirect(loginUrl);
    }

    if (!hasAdminClaim(token)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/ax/login';
      const res = NextResponse.redirect(loginUrl);
      res.cookies.delete('clipop_access_token');
      res.cookies.delete('clipop_refresh_token');
      return res;
    }
  }

  const isOldAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  if (isOldAdminRoute) {
    const newUrl = request.nextUrl.clone();
    newUrl.pathname = '/ax/login';
    return NextResponse.redirect(newUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/ax/:path*', '/admin/:path*'],
};
