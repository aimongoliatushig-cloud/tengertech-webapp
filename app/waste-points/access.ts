import { redirect } from "next/navigation";

import { canAccessAutoBaseOverview, requireSession } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";

// Хогийн цэг нь "Авто бааз, хог тээвэрлэлтийн хэлтэс"-ийн дэд хэсэг тул авто
// баазын самбар үзэх эрхтэй хэрэглэгчид нээгдэнэ.
export async function requireWasteAccess() {
  const session = await requireSession();
  const scopedDepartmentName = await loadSessionDepartmentName(session);
  if (!canAccessAutoBaseOverview(session, scopedDepartmentName)) {
    redirect("/");
  }
  return { session, scopedDepartmentName };
}
