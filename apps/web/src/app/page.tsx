import { ClientOnly } from '@/components/client-only';
import { DashboardView } from '@/components/dashboard-view';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('dashboard');

export default function Page() {
  return (
    <ClientOnly>
      <DashboardView />
    </ClientOnly>
  );
}
