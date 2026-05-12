import { GarbageRoutePage } from "../_components/garbage-route-page";

export const dynamic = "force-dynamic";

export default function TodayRoutesPage() {
  return (
    <GarbageRoutePage
      title="Өнөөдрийн маршрут"
      eyebrow="Өнөөдөр"
      description="Өнөөдрийн хог тээврийн маршрут, явц, хуваарилалтыг харах хэсэг."
      isAllowed={(permissions) => permissions.today_view}
    />
  );
}
