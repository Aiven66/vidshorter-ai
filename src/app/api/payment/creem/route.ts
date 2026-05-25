import { NextRequest } from 'next/server';

const CREEM_API_BASE = 'https://api.creem.io/v1';
const CREEM_TEST_API_BASE = 'https://test-api.creem.io/v1';

function getApiBase(apiKey: string) {
  if (apiKey.startsWith('creem_test_')) return CREEM_TEST_API_BASE;
  return CREEM_API_BASE;
}

async function createCheckout(apiBase: string, apiKey: string, checkoutBody: Record<string, unknown>) {
  const res = await fetch(`${apiBase}/checkouts`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(checkoutBody),
  });
  const data = await res.json();
  return { res, data };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { planId, userId, userEmail } = body as {
    planId?: string;
    userId?: string;
    userEmail?: string;
  };

  if (!planId) {
    return Response.json({ error: 'planId is required' }, { status: 400 });
  }

  const apiKey = process.env.CREEM_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const productIdsRaw = process.env.CREEM_PRODUCT_IDS;

  let productId: string | undefined;
  try {
    if (productIdsRaw) {
      const mapping = JSON.parse(productIdsRaw);
      productId = mapping[planId];
    }
  } catch {
    console.warn('[Creem] Failed to parse CREEM_PRODUCT_IDS');
  }

  if (!apiKey) {
    console.log('[Creem] Running in demo mode (CREEM_API_KEY not set)');
    const demoUrl = `${appUrl}/dashboard?payment=success&plan=${planId}&demo=true`;
    return Response.json({ checkoutUrl: demoUrl, demo: true, sessionId: `demo_${Date.now()}` });
  }

  if (!productId) {
    console.error('[Creem] No product ID mapping found for plan:', planId);
    return Response.json({ error: `No product ID configured for plan: ${planId}` }, { status: 400 });
  }

  const checkoutBody: Record<string, unknown> = {
    product_id: productId,
    success_url: `${appUrl}/dashboard?payment=success&plan=${planId}`,
    metadata: {
      plan_id: planId,
      user_id: userId || '',
      source: 'clipop_ai',
    },
  };

  if (userId) {
    checkoutBody.request_id = `clipop_${userId}_${Date.now()}`;
  }

  if (userEmail) {
    checkoutBody.customer = { email: userEmail };
  }

  const primaryBase = getApiBase(apiKey);
  const fallbackBase = primaryBase === CREEM_API_BASE ? CREEM_TEST_API_BASE : CREEM_API_BASE;

  const apiBases = [primaryBase];
  if (primaryBase !== fallbackBase) {
    apiBases.push(fallbackBase);
  }

  for (const apiBase of apiBases) {
    try {
      console.log('[Creem] Trying checkout:', { apiBase, productId, planId });

      const { res, data } = await createCheckout(apiBase, apiKey, checkoutBody);

      if (!res.ok) {
        const isAuthError = res.status === 401;
        console.error('[Creem] API error:', res.status, data, { apiBase });

        if (isAuthError && apiBases.indexOf(apiBase) < apiBases.length - 1) {
          console.log('[Creem] Auth failed on', apiBase, ', trying fallback...');
          continue;
        }

        return Response.json({
          error: data.message || data.error || `Creem API error: ${res.status}`,
          apiError: data,
        }, { status: 400 });
      }

      const checkoutUrl = data.checkout_url;
      if (!checkoutUrl) {
        console.error('[Creem] No checkout URL in response:', data);
        return Response.json({
          error: 'No checkout URL returned from Creem',
          apiResponse: data,
        }, { status: 500 });
      }

      console.log('[Creem] Checkout created:', {
        id: data.id,
        status: data.status,
        checkoutUrl,
        apiBase,
      });

      return Response.json({
        checkoutUrl,
        sessionId: data.id,
        demo: false,
      });
    } catch (err) {
      console.error('[Creem] Request failed on', apiBase, ':', err);
      if (apiBases.indexOf(apiBase) < apiBases.length - 1) {
        continue;
      }
      return Response.json({
        error: 'Failed to connect to Creem, please try again',
      }, { status: 500 });
    }
  }

  return Response.json({ error: 'All Creem API endpoints failed' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return Response.json({ error: 'session_id is required' }, { status: 400 });
  }

  const apiKey = process.env.CREEM_API_KEY;
  if (!apiKey) {
    return Response.json({ status: 'demo', paid: false });
  }

  const primaryBase = getApiBase(apiKey);
  const fallbackBase = primaryBase === CREEM_API_BASE ? CREEM_TEST_API_BASE : CREEM_API_BASE;
  const apiBases = [primaryBase];
  if (primaryBase !== fallbackBase) {
    apiBases.push(fallbackBase);
  }

  for (const apiBase of apiBases) {
    try {
      const res = await fetch(`${apiBase}/checkouts?checkout_id=${sessionId}`, {
        headers: { 'x-api-key': apiKey },
      });
      const data = await res.json();

      if (res.status === 401 && apiBases.indexOf(apiBase) < apiBases.length - 1) {
        continue;
      }

      return Response.json({
        status: data.status,
        paid: data.status === 'completed',
      });
    } catch (err) {
      console.error('[Creem] Status check failed on', apiBase, ':', err);
      if (apiBases.indexOf(apiBase) < apiBases.length - 1) {
        continue;
      }
    }
  }

  return Response.json({ status: 'unknown', paid: false });
}
