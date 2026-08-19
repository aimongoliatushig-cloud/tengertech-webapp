import { requireSession } from "@/lib/auth";
import CalculationClient from "./calculation-client";

export const dynamic = "force-dynamic";

export default async function CalculationPage() {
  const session = await requireSession();
  return <CalculationClient isAdmin={session.role === "system_admin"} />;
}

