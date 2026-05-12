import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function TodayRoutesPage() {
  redirect("/settings/garbage-transport#vehicles");
}
