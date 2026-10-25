import { AirSensorDetailView } from '@/components/air-sensor-detail-view';
import { ClientOnly } from '@/components/client-only';

export default function Page() {
  return (
    <ClientOnly>
      <AirSensorDetailView />
    </ClientOnly>
  );
}
