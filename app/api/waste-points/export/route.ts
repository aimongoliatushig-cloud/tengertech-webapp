import { canAccessAutoBaseOverview, getSession } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { buildReportWorkbook, type XlsxSection } from "@/lib/report-xlsx";
import { getAllWastePointsFiltered, type WastePointSort } from "@/lib/waste-points/service";
import {
  WASTE_STATUS_LABELS,
  WASTE_TYPE_LABELS,
  formatGps,
  type WastePointStatus,
  type WastePointType,
} from "@/lib/waste-points/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getParam(sp: URLSearchParams, key: string) {
  return sp.get(key)?.trim() ?? "";
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }
  const scopedDepartmentName = await loadSessionDepartmentName(session);
  if (!canAccessAutoBaseOverview(session, scopedDepartmentName)) {
    return Response.json({ error: "Эрх хүрэлцэхгүй байна." }, { status: 403 });
  }

  const sp = new URL(request.url).searchParams;
  const points = await getAllWastePointsFiltered({
    search: getParam(sp, "q"),
    type: (getParam(sp, "type") || "all") as WastePointType | "all",
    khoroo: getParam(sp, "khoroo") || "all",
    status: (getParam(sp, "status") || "all") as WastePointStatus | "all",
    sort: (getParam(sp, "sort") || "code") as WastePointSort,
  });

  const sections: XlsxSection[] = [
    {
      caption: "Хогийн цэгийн жагсаалт",
      headers: [
        "№",
        "Код",
        "Нэр",
        "Дүүрэг",
        "Хороо",
        "Хаяг",
        "Төрөл",
        "GPS",
        "Савны төрөл",
        "Савны тоо",
        "Багтаамж (л)",
        "Дүүргэлт (%)",
        "Статус",
        "Хариуцагч байгууллага",
        "Үүсгэсэн",
        "Шинэчилсэн",
      ],
      rows: points.map((p, index) => [
        index + 1,
        p.code,
        p.name,
        p.districtName,
        p.khorooName,
        p.address,
        WASTE_TYPE_LABELS[p.type],
        formatGps(p.latitude, p.longitude),
        p.containerType,
        p.containerCount,
        p.capacity,
        p.currentFillLevel,
        WASTE_STATUS_LABELS[p.currentStatus],
        p.assignedCompany,
        p.createdAt.slice(0, 10),
        p.updatedAt.slice(0, 10),
      ]),
      columnWidths: [4, 12, 30, 16, 12, 34, 18, 22, 20, 10, 12, 12, 12, 30, 12, 12],
    },
  ];

  const buffer = await buildReportWorkbook({
    title: "Хогийн цэгийн тайлан",
    meta: [
      { label: "Нийт цэг", value: String(points.length) },
      { label: "Дүүрэг", value: "Хан-Уул дүүрэг" },
    ],
    sections,
    sheetName: "Хогийн цэг",
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Disposition": `attachment; filename="hogiin-tseg.xlsx"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
