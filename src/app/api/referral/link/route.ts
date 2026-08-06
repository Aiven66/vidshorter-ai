import { NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

// Force dynamic — prevents Next.js from trying to statically generate this API route at build time.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/referral/link
 *
 * Returns the caller's referral link (built from their user id) and a count of
 * successful referrals. The link is generated client-side in the dialog, but
 * this endpoint also exposes stats so the dialog can show "X friends invited".
 *
 * Auth: requires a valid Supabase access token (validated via anon-key client).
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: 'Database not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const client = getSupabaseClient(token);
    const { data: { user }, error } = await client.auth.getUser(token);

    if (error || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      || (request.headers.get('host') ? `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}` : 'https://www.clipopai.com');

    const referralLink = `${appUrl}/register?ref=${user.id}`;

    // Count successful referrals
    const { count } = await client
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', user.id)
      .eq('status', 'completed');

    return Response.json({
      referralLink,
      referralCode: user.id,
      referralCount: count || 0,
      rewardPerReferral: 100,
    });
  } catch (err) {
    console.error('[Referral Link] Failed:', err);
    return Response.json({ error: 'Failed to fetch referral link' }, { status: 500 });
  }
}
