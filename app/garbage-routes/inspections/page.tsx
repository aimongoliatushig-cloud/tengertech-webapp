import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function GarbageRouteInspectionsPage() {
  redirect("/settings/garbage-transport#vehicles");
}
