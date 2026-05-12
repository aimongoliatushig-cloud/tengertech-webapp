import { GarbageRoutePage } from "../_components/garbage-route-page";

export const dynamic = "force-dynamic";

export default function WeeklyPlanPage() {
  return (
    <GarbageRoutePage
      title="Долоо хоногийн төлөвлөгөө"
      eyebrow="Төлөвлөлт"
      description="Хог тээврийн баг, машин, маршрутын долоо хоногийн төлөвлөгөөг удирдах хэсэг."
      isAllowed={(permissions) => permissions.weekly_create || permissions.weekly_edit}
    />
  );
}
