import { NextRequest } from 'next/server';

const CREEM_API_BASE = 'https://api.creem.io/v1';
const CREEM_TEST_API_BASE = 'https://test-api.creem.io/v1';

function getApiBase(apiKey: string) {
  if (apiKey.startsWith('creem_test_')) return CREEM_TEST_API_BASE;
  return CREEM_API_BASE;
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

  try {
    const apiBase = getApiBase(apiKey);

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

    console.log('[Creem] Creating checkout:', {
      apiBase,
      productId,
      planId,
      userId: userId || 'none',
    });

    const res = await fetch(`${apiBase}/checkouts`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(checkoutBody),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[Creem] API error:', res.status, data);
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
    });

    return Response.json({
      checkoutUrl,
      sessionId: data.id,
      demo: false,
    });
  } catch (err) {
    console.error('[Creem] Request failed:', err);
    return Response.json({
      error: 'Failed to connect to Creem, please try again',
    }, { status: 500 });
  }
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

  try {
    const apiBase = getApiBase(apiKey);

    const res = await fetch(`${apiBase}/checkouts?checkout_id=${sessionId}`, {
      headers: {
        'x-api-key': apiKey,
      },
    });
    const data = await res.json();
    return Response.json({
      status: data.status,
      paid: data.status === 'completed',
    });
  } catch (err) {
    console.error('[Creem] Status check failed:', err);
    return Response.json({ status: 'unknown', paid: false });
  }
}
