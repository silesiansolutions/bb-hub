import { ClientOnly } from '@/components/client-only';
import { ParkingsView } from '@/components/parkings-view';

export default function Page() {
  return (
    <ClientOnly>
      <ParkingsView />
    </ClientOnly>
  );
}
