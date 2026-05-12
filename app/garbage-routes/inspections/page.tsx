import { GarbageRoutePage } from "../_components/garbage-route-page";

export const dynamic = "force-dynamic";

export default function GarbageRouteInspectionsPage() {
  return (
    <GarbageRoutePage
      title="Хяналтын тайлан"
      eyebrow="Хяналт"
      description="Хог тээврийн маршрутын хяналт, шалгалт, тайлангийн мэдээлэл."
      isAllowed={(permissions) => permissions.all_view || permissions.inspection_write}
    />
  );
}
