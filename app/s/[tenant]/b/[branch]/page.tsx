import { MenuScreen } from '@/components/menu/MenuScreen';

type Params = { tenant: string; branch: string };

export const revalidate = 60;

// The [branch] segment needs its own generateStaticParams — the one on the
// tenant layout only covers [tenant] — or this route falls back to rendering
// every request (see app/s/[tenant]/layout.tsx for the full story).
export const dynamicParams = true;
export async function generateStaticParams(): Promise<Params[]> {
  return [];
}

// A specific branch's menu (e.g. tacos.kuik.mx/b/centro).
export default async function BranchMenuPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { tenant, branch } = await params;
  return <MenuScreen hostKey={decodeURIComponent(tenant)} branchSlug={decodeURIComponent(branch)} />;
}
