import { ClientOnly } from '@/components/client-only';
import { ParkingDetailView } from '@/components/parking-detail-view';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('parking');

export default function Page() {
  return (
    <ClientOnly>
      <ParkingDetailView />
    </ClientOnly>
  );
}
