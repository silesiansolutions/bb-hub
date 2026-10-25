import { ClientOnly } from '@/components/client-only';
import { DashboardView } from '@/components/dashboard-view';

export default function Page() {
  return (
    <ClientOnly>
      <DashboardView />
    </ClientOnly>
  );
}
