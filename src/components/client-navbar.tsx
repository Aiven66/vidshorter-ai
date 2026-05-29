'use client';

import dynamic from 'next/dynamic';

const Navbar = dynamic(
  () => import('@/components/navbar').then(m => ({ default: m.Navbar })),
  { ssr: false }
);

export default function ClientNavbar() {
  return <Navbar />;
}
