import { Suspense } from 'react';
import DesktopCallbackClient from './client';

export default function DesktopCallbackPage() {
  return (
    <Suspense>
      <DesktopCallbackClient />
    </Suspense>
  );
}
