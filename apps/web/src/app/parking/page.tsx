import { ClientOnly } from '@/components/client-only';
import { ParkingDetailView } from '@/components/parking-detail-view';

export default function Page() {
  return (
    <ClientOnly>
      <ParkingDetailView />
    </ClientOnly>
  );
}
