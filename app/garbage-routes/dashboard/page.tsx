import { GarbageRoutePage } from "../_components/garbage-route-page";

export const dynamic = "force-dynamic";

export default function GarbageRouteDashboardPage() {
  return (
    <GarbageRoutePage
      title="Маршрутын самбар"
      eyebrow="Самбар"
      description="Хог тээврийн маршрутын төлөв, гүйцэтгэл, хяналтын нэгтгэл."
      isAllowed={(permissions) => permissions.dashboard_view}
    />
  );
}
