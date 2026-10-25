import { ClientOnly } from '@/components/client-only';
import { StatsView } from '@/components/stats-view';

export default function Page() {
  return (
    <ClientOnly>
      <StatsView />
    </ClientOnly>
  );
}
