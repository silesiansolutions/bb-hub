import { AirView } from '@/components/air-view';
import { ClientOnly } from '@/components/client-only';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('air');

export default function Page() {
  return (
    <ClientOnly>
      <AirView />
    </ClientOnly>
  );
}
