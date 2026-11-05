import { RouteLoading } from '@/components/RouteLoading';

/** Inside the dashboard frame: the sidebar stays, only the page area waits. */
export default function Loading() {
  return <RouteLoading tone="light" fill="area" />;
}
