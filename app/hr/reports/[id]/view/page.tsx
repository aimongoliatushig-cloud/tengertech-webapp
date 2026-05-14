import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { requireHrSpecialistAccess } from "@/lib/hr";

import styles from "../../../hr.module.css";
import { HrReportPdfViewer } from "./viewer-client";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ fallback?: string | string[] }>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function HrReportViewPage({ params, searchParams }: PageProps) {
  const session = await requireSession();
  await requireHrSpecialistAccess(session);
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const fallback = firstParam(query.fallback);
  const downloadUrl = `/api/hr/reports/${id}/download${fallback ? `?fallback=${encodeURIComponent(fallback)}` : ""}`;

  return (
    <>
      <WorkspaceHeader
        title="HR PDF тайлан"
        subtitle="PDF тайлан app дотор нээгдэж, архивт хадгалагдсан хэвээр байна."
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="HR тайлан"
      />
      <section className={styles.panel}>
        <HrReportPdfViewer downloadUrl={downloadUrl} reportsUrl="/hr/reports" />
      </section>
    </>
  );
}
