/**
 * Babel config — dev-only @react-dev-inspector plugin.
 *
 * Production builds (next build --webpack) temporarily move this file aside
 * via prepare-runner.js so that Next.js uses SWC (faster Rust compiler).
 * SWC natively handles Unicode property escapes (\p{Emoji}, \p{L}) which
 * Babel cannot parse (linkifyjs/dist/linkify.mjs uses them).
 */
module.exports = function (api) {
  const isDev = api.env('development');
  if (!isDev) {
    return { presets: ['next/babel'] };
  }
  return {
    presets: ['next/babel'],
    plugins: ['@react-dev-inspector/babel-plugin'],
  };
};
