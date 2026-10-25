import { AirSensorDetailView } from '@/components/air-sensor-detail-view';
import { ClientOnly } from '@/components/client-only';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('airSensor');

export default function Page() {
  return (
    <ClientOnly>
      <AirSensorDetailView />
    </ClientOnly>
  );
}
