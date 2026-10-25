import { NotFoundView } from '@/components/not-found-view';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('notFound');

export default function NotFound() {
  return <NotFoundView />;
}
