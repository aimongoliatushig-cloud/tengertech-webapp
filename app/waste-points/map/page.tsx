import { getAllWastePointsFiltered } from "@/lib/waste-points/service";

import { requireWasteAccess } from "../access";
import { WasteApiError } from "../api-error";
import { WasteMap } from "../waste-map";
import { WasteShell } from "../waste-shell";
import { WasteSubNav } from "../waste-sub-nav";
import styles from "../waste-points.module.css";

export const dynamic = "force-dynamic";

export default async function WastePointsMapPage() {
  const { session, scopedDepartmentName } = await requireWasteAccess();

  let points: Awaited<ReturnType<typeof getAllWastePointsFiltered>>;
  try {
    points = await getAllWastePointsFiltered({});
  } catch (error) {
    return (
      <WasteShell
        session={session}
        scopedDepartmentName={scopedDepartmentName}
        title="Хогийн цэгийн газрын зураг"
        subtitle="Бүх хогийн цэг газрын зураг дээр"
      >
        <div className={styles.page}>
          <WasteSubNav active="map" />
          <WasteApiError error={error} retryHref="/waste-points/map" />
        </div>
      </WasteShell>
    );
  }

  return (
    <WasteShell
      session={session}
      scopedDepartmentName={scopedDepartmentName}
      title="Хогийн цэгийн газрын зураг"
      subtitle={`${points.length} цэг · төрлөөр өнгөөр ялгасан · цэг дээр дарж ажил үүсгэнэ`}
    >
      <div className={styles.page}>
        <WasteSubNav active="map" />
        <WasteMap points={points} />
      </div>
    </WasteShell>
  );
}
