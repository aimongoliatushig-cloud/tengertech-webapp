import { requireSession } from "@/lib/auth";
import CalculationClient from "./calculation-client";

export const dynamic = "force-dynamic";

export default async function CalculationPage() {
  const session = await requireSession();
  const canManageMaterials =
    ["system_admin", "director", "general_manager", "project_manager"].includes(
      session.role,
    ) || Boolean(session.groupFlags?.improvementManager);
  return (
    <CalculationClient
      isAdmin={session.role === "system_admin"}
      canManageMaterials={canManageMaterials}
    />
  );
}
