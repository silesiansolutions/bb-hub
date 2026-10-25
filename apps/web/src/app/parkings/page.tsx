import { ClientOnly } from '@/components/client-only';
import { ParkingsView } from '@/components/parkings-view';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('parkings');

export default function Page() {
  return (
    <ClientOnly>
      <ParkingsView />
    </ClientOnly>
  );
}
