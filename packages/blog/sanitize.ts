/**
 * @clipop/blog - HTML sanitization and CSS scope isolation
 *
 * `sanitizeHtmlContent(html)` strips dangerous elements (script, iframe,
 * embed, object, link, meta, base, title), removes on* event handlers, and
 * removes javascript: URLs. The <body> contents are extracted when present.
 *
 * `scopeCssSelectors(html, scopeClass)` rewrites all CSS selectors inside
 * <style> blocks to be prefixed with `.{scopeClass}`, preventing styles from
 * leaking outside the article container. @keyframes / @font-face are skipped.
 */

/**
 * Sanitize raw HTML to make it safe for inline rendering.
 *
 * Operations performed (in order):
 *   1. Extract <body>...</body> contents if present
 *   2. Remove <script>, <iframe>, <object>, <embed>, <noscript> elements
 *   3. Remove <link>, <meta>, <base>, <title> elements
 *   4. Remove all on* event handler attributes (e.g. onclick, onload)
 *   5. Remove href/src/action="javascript:..." attributes
 *
 * <style> blocks are preserved (callers may run scopeCssSelectors on them).
 *
 * @returns the cleaned HTML string.
 */
export function sanitizeHtmlContent(html: string): string {
  if (!html) return '';

  // 1. Extract body
  let body = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    body = bodyMatch[1];
  }

  // 2. Remove dangerous elements (with or without closing tags)
  let cleaned = body;
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<script\b[^>]*\/?\s*>/gi, '');
  cleaned = cleaned.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  cleaned = cleaned.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  cleaned = cleaned.replace(/<iframe\b[^>]*\/?\s*>/gi, '');
  cleaned = cleaned.replace(/<object[\s\S]*?<\/object>/gi, '');
  cleaned = cleaned.replace(/<embed[\s\S]*?<\/embed>/gi, '');
  cleaned = cleaned.replace(/<embed\b[^>]*\/?\s*>/gi, '');

  // 3. Remove head-style elements
  cleaned = cleaned.replace(/<link\b[^>]*\/?\s*>/gi, '');
  cleaned = cleaned.replace(/<meta\b[^>]*\/?\s*>/gi, '');
  cleaned = cleaned.replace(/<base\b[^>]*\/?\s*>/gi, '');
  cleaned = cleaned.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');

  // 4. Remove all on* event handler attributes
  // Matches: <tag ... onclick="..." ...> and <tag ... onerror='...' ...>
  cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*(["'])[^"']*\1/gi, '');
  cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '');

  // 5. Remove javascript: URLs in href / src / action
  cleaned = cleaned.replace(
    /\s+(?:href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\1/gi,
    '',
  );

  return cleaned.trim();
}

/**
 * Scope CSS selectors inside a stylesheet string.
 *
 * Each selector (comma-separated) gets prefixed with `.{scopeClass}` so
 * styles only apply inside the matching container.
 *
 * Rules:
 *   - body / html / :root → replaced with `.{scopeClass}`
 *   - body p → .{scopeClass} p
 *   - @media / @supports / @layer / @container: recursively scoped
 *   - @keyframes / @font-face: skipped (left unchanged)
 *
 * @param css raw CSS string (typically the contents of a <style> block)
 * @param scopeClass the scope class name (without leading dot)
 */
export function scopeCssSelectors(css: string, scopeClass: string): string {
  const scope = `.${scopeClass}`;
  if (!css || !scopeClass) return css;

  // Process @-rules with nested blocks (media, supports, layer, container).
  // @keyframes / @font-face are skipped.
  let result = css.replace(
    /(@(?:media|supports|layer|container)[^{]*)\{([\s\S]*?)\}\s*\}/gi,
    (match, atRule: string, innerContent: string) => {
      return `${atRule}{${scopeCssSelectors(innerContent, scopeClass)}}`;
    },
  );

  // Process top-level @keyframes / @font-face without modification.
  // The regex above already excluded them via the inner check — but since
  // keyframes blocks contain percentage selectors (0%, from, to), we don't
  // want to scope those. Match them explicitly and leave unchanged.
  result = result.replace(
    /(@(?:keyframes|font-face)[^{]*)\{([\s\S]*?)\}\s*\}/gi,
    (match, atRule: string, innerContent: string) => `${atRule}{${innerContent}}`,
  );

  // Process normal CSS rules: selector { declaration }
  result = result.replace(
    /([^{}@/]+)\{([^{}]*)\}/g,
    (match, selectors: string, declarations: string) => {
      if (!selectors.trim() || !declarations.trim()) return match;

      const scopedSelectors = selectors
        .split(',')
        .map((sel: string) => scopeSingleSelector(sel.trim(), scope))
        .join(', ');

      return `${scopedSelectors}{${declarations}}`;
    },
  );

  return result;
}

function scopeSingleSelector(selector: string, scope: string): string {
  if (!selector) return selector;

  // Replace body/html/:root entirely with scope
  if (/^(body|html|:root)$/i.test(selector)) {
    return scope;
  }

  // Replace body/html/:root prefixes (e.g. "body p" → "{scope} p")
  let s = selector.replace(/^(body|html|:root)\s+/gi, '');

  return `${scope} ${s}`;
}

/**
 * Convenience: sanitize and scope a complete HTML fragment in one pass.
 *
 * - Extracts body
 * - Removes dangerous elements and attributes
 * - For each <style> block, scopes all selectors with the given class
 */
export function sanitizeAndScopeHtml(html: string, scopeClass: string = 'blog-article-scope'): string {
  const sanitized = sanitizeHtmlContent(html);
  return sanitized.replace(
    /<style([^>]*)>([\s\S]*?)<\/style>/gi,
    (_match, attrs: string, cssContent: string) => {
      const scoped = scopeCssSelectors(cssContent, scopeClass);
      return `<style${attrs}>${scoped}</style>`;
    },
  );
}
