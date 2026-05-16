'use client';

/**
 * DevInspector — Client-only wrapper for react-dev-inspector.
 *
 * Why this wrapper exists:
 * layout.tsx is a Server Component.  `next/dynamic` with `ssr: false` is only
 * allowed inside Client Components.  Without this wrapper the Inspector was
 * imported directly, which caused it to SSR on the server (where
 * COZE_PROJECT_ENV is available) but not on the client (where non-NEXT_PUBLIC_
 * env vars are undefined).  The mismatch in rendering caused Radix UI's
 * internal ID counter to diverge between server and client, producing hydration
 * errors in <Navbar />.
 *
 * With ssr: false the server always renders null here, and the client lazy-loads
 * Inspector after hydration — keeping the Radix ID counter identical on both
 * sides.
 */

import dynamic from 'next/dynamic';

const Inspector = dynamic(
  () => import('react-dev-inspector').then((m) => ({ default: m.Inspector })),
  { ssr: false },
);

export function DevInspector() {
  return <Inspector />;
}
