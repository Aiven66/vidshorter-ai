import { NextRequest } from 'next/server';

const CREEM_API_BASE = 'https://api.creem.io/v1';
const CREEM_TEST_API_BASE = 'https://test-api.creem.io/v1';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { planId, userId } = body as {
    planId?: string;
    userId?: string;
  };

  if (!planId) {
    return Response.json({ error: 'planId is required' }, { status: 400 });
  }

  const apiKey = process.env.CREEM_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const productId = process.env.CREEM_PRODUCT_IDS
    ? JSON.parse(process.env.CREEM_PRODUCT_IDS)[planId]
    : undefined;

  if (!apiKey) {
    console.log('[Creem] Running in demo mode (CREEM_API_KEY not set)');
    const demoUrl = `${appUrl}/dashboard?payment=success&plan=${planId}&demo=true`;
    return Response.json({ checkoutUrl: demoUrl, demo: true, sessionId: `demo_${Date.now()}` });
  }

  try {
    const isTest = apiKey.startsWith('creem_test_');
    const apiBase = isTest ? CREEM_TEST_API_BASE : CREEM_API_BASE;

    const checkoutBody: Record<string, unknown> = {
      success_url: `${appUrl}/dashboard?payment=success&plan=${planId}`,
      metadata: {
        plan_id: planId,
        user_id: userId || '',
        source: 'vidshorter_ai',
      },
    };

    if (productId) {
      checkoutBody.product_id = productId;
    } else {
      console.warn('[Creem] No product ID mapping found for plan:', planId, '. Using product_id from env or fallback.');
      checkoutBody.product_id = planId;
    }

    if (userId) {
      checkoutBody.request_id = `vids_${userId}_${Date.now()}`;
    }

    const res = await fetch(`${apiBase}/checkouts`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(checkoutBody),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[Creem] API error:', data);
      return Response.json({
        checkoutUrl: `${appUrl}/pricing?payment=error`,
        demo: false,
        apiError: data,
      }, { status: 200 });
    }

    const checkoutUrl = data.checkout_url || data.url;
    if (!checkoutUrl) {
      console.error('[Creem] No checkout URL in response:', data);
      return Response.json({
        checkoutUrl: `${appUrl}/pricing?payment=error`,
        demo: false,
      });
    }

    return Response.json({
      checkoutUrl,
      sessionId: data.id,
      demo: false,
    });
  } catch (err) {
    console.error('[Creem] Request failed:', err);
    return Response.json({
      checkoutUrl: `${appUrl}/pricing?payment=error`,
      demo: true,
    });
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
    const isTest = apiKey.startsWith('creem_test_');
    const apiBase = isTest ? CREEM_TEST_API_BASE : CREEM_API_BASE;

    const res = await fetch(`${apiBase}/checkouts/${sessionId}`, {
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
      },
    });
    const data = await res.json();
    return Response.json({
      status: data.status,
      paid: data.status === 'completed' || data.paid === true,
    });
  } catch (err) {
    console.error('[Creem] Status check failed:', err);
    return Response.json({ status: 'unknown', paid: false });
  }
}
