import { NextRequest, NextResponse } from 'next/server';
import { fetchPage, parseProduct, parseAmazonProduct, isAmazonUrl } from '@/lib/url-extract/fetcher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * locale → Accept-Language（抓取对应语言版本的电商页面，让卖点语言匹配用户 UI 语言）
 */
function localeToAcceptLanguage(locale: string | undefined): string | undefined {
  if (!locale) return undefined;
  const l = locale.trim();
  if (!l) return undefined;
  if (/^zh$/i.test(l)) return 'zh-CN,zh;q=0.9,en;q=0.8';
  if (/^zh-(tw|hk|hant)/i.test(l)) return 'zh-TW,zh;q=0.9,en;q=0.8';
  if (/^([a-z]{2,3})(-[A-Za-z]{2,4})?$/.test(l)) {
    return `${l},${l.split('-')[0]};q=0.9,en;q=0.8`;
  }
  return undefined;
}

/**
 * Amazon 反爬判定：被 TLS 指纹拦截时返回的挑战页标题为 "Amazon.com"，
 * 无 productTitle / 无主图。此时结果不可用，需要走桌面端 Chromium 代理重试。
 */
function looksLikeAmazonBlock(product: { name?: string; image?: string } | null): boolean {
  if (!product) return true;
  const name = (product.name || '').trim();
  if (!name || name === 'Unknown Product') return true;
  if (/^amazon(\.com)?$/i.test(name)) return true;
  if (!product.image) return true;
  return false;
}

/**
 * POST /api/extract-product
 * body: { url: string, locale?: string, desktopProxy?: string }
 *
 * 抓取商品页面并返回商品名、价格、图片、描述、品牌、卖点、评分。
 * desktopProxy：桌面端媒体服务器地址（Electron 主进程）。Amazon 等
 * 按 TLS 指纹反爬的站点会 100% 拦截 Node 请求并返回挑战页，此时通过
 * 桌面代理（Chromium 网络栈）重新抓取。
 */
export async function POST(request: NextRequest) {
  let body: { url?: string; locale?: string; desktopProxy?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: 'url must start with http:// or https://' },
      { status: 400 },
    );
  }

  const desktopProxy =
    typeof body.desktopProxy === 'string' && /^https?:\/\//i.test(body.desktopProxy)
      ? body.desktopProxy.replace(/\/+$/, '')
      : '';
  const amazon = isAmazonUrl(url);

  try {
    const acceptLanguage = localeToAcceptLanguage(body.locale);

    let product: { name?: string; image?: string } | null = null;
    let fetchError: string | null = null;
    try {
      const page = await fetchPage(url, 20000, acceptLanguage ? { acceptLanguage } : undefined);
      // Amazon 页面无 JSON-LD / og meta，走专用 DOM 解析器
      product = amazon
        ? parseAmazonProduct(page.html, page.finalUrl)
        : parseProduct(page.html, page.finalUrl);
    } catch (error) {
      fetchError = error instanceof Error ? error.message : 'fetch failed';
    }

    // Amazon TLS 指纹被拦截（挑战页 / 503）→ 桌面端走 Chromium 网络栈重试
    // 超时 90s：代理端包含「预热首页建立 cookies + 重试」的多级递进流程
    if (amazon && looksLikeAmazonBlock(product) && desktopProxy) {
      try {
        const proxyResp = await fetch(`${desktopProxy}/api/proxy-fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, acceptLanguage: acceptLanguage || undefined }),
          signal: AbortSignal.timeout(90000),
        });
        const data = (await proxyResp.json()) as { ok?: boolean; html?: string; finalUrl?: string };
        if (proxyResp.ok && data.ok && typeof data.html === 'string' && data.html.length > 5000) {
          const retried = parseAmazonProduct(data.html, data.finalUrl || url);
          if (!looksLikeAmazonBlock(retried)) {
            product = retried;
            fetchError = null;
          }
        }
      } catch {
        // 代理不可用时保持原始结果，走下面的兜底报错
      }
    }

    if (fetchError && !product) {
      return NextResponse.json(
        { error: `Failed to fetch product: ${fetchError}` },
        { status: 502 },
      );
    }

    if (!product || !product.name || product.name === 'Unknown Product') {
      return NextResponse.json(
        { error: 'Could not extract product information from this URL' },
        { status: 422 },
      );
    }

    // 数字人带货必须拿到商品主图；Amazon 被拦截时宁可失败也不返回无图商品
    if (amazon && !product.image) {
      return NextResponse.json(
        { error: 'Could not extract the product image from this Amazon page' },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, product });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown fetch error';
    console.error('[extract-product] failed for', url, message);
    return NextResponse.json(
      { error: `Failed to fetch product: ${message}` },
      { status: 502 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
