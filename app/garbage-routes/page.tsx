import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function GarbageRoutesIndexPage() {
  redirect("/settings/garbage-transport#vehicles");
}
