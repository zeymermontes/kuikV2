import { MenuScreen } from '@/components/menu/MenuScreen';

type Params = { tenant: string; branch: string };

export const revalidate = 60;

// A specific branch's menu (e.g. tacos.kuik.mx/b/centro).
export default async function BranchMenuPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { tenant, branch } = await params;
  return <MenuScreen hostKey={decodeURIComponent(tenant)} branchSlug={decodeURIComponent(branch)} />;
}
