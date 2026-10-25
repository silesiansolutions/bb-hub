import { AirView } from '@/components/air-view';
import { ClientOnly } from '@/components/client-only';

export default function Page() {
  return (
    <ClientOnly>
      <AirView />
    </ClientOnly>
  );
}
