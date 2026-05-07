import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../../hr-section-nav";
import { PdfViewer } from "../pdf-viewer";
import styles from "../../hr.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ attachmentId: string }>;
};

export default async function HrAttachmentViewerPage({ params }: PageProps) {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }

  const { attachmentId } = await params;
  const numericId = Number(attachmentId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    notFound();
  }

  const attachmentUrl = `/api/odoo/attachments/${numericId}`;

  return (
    <>
      <WorkspaceHeader
        title="Хавсралт харах"
        subtitle="Тойрох хуудас болон хүний нөөцийн бүртгэлийн хавсралтыг дэлгэрэнгүй харна."
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Хавсралтын дэлгэрэнгүй"
      />
      <HrSectionNav mode={access.isHr ? "hr" : "department"} />

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <h2>Хавсралт #{numericId}</h2>
          <div className={styles.recordActions}>
            <Link className={styles.secondaryButton} href="/hr/clearance">
              Буцах
            </Link>
            <a className={styles.secondaryButton} href={`${attachmentUrl}?download=1`}>
              Татах
            </a>
            <a className={styles.primaryButton} href={attachmentUrl} target="_blank">
              Шинэ цонх
            </a>
          </div>
        </div>

        <PdfViewer src={attachmentUrl} />
      </section>
    </>
  );
}
