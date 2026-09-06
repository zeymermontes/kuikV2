import type { Metadata } from 'next';
import { FeaturePage, featureMetadata } from '@/components/landing/FeaturePage';
import { featurePage } from '@/lib/landing/features';

const page = featurePage('punto-de-venta')!;

export const metadata: Metadata = featureMetadata(page);

export default function Page() {
  return <FeaturePage page={page} />;
}
