import { ClientOnly } from '@/components/client-only';
import { StatsView } from '@/components/stats-view';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('stats');

export default function Page() {
  return (
    <ClientOnly>
      <StatsView />
    </ClientOnly>
  );
}
