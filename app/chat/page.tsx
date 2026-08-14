import Link from "next/link";
import { ArrowLeft, Bell, MessageCircle } from "lucide-react";

import { getSessionRoleLabel, requireSession } from "@/lib/auth";
import { ChatClient } from "./chat-client";
import styles from "./chat.module.css";

export const dynamic = "force-dynamic";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ embedded?: string }> }) {
  const session = await requireSession();
  const roleLabel = getSessionRoleLabel(session);
  const embedded = (await searchParams).embedded === "1";

  return (
    <main className={`${styles.standalonePage} ${embedded ? styles.embeddedPage : ""}`}>
      {!embedded ? <header className={styles.standaloneHeader}>
        <div className={styles.headerBrand}>
          <Link href="/" className={styles.erpBackLink}>
            <ArrowLeft aria-hidden />
            <span>ERP рүү буцах</span>
          </Link>
          <span className={styles.headerDivider} />
          <div className={styles.chatBrand}>
            <span className={styles.brandIcon}><MessageCircle aria-hidden /></span>
            <div><strong>Харилцаа холбоо</strong><small>Байгууллагын дотоод чат</small></div>
          </div>
        </div>
        <div className={styles.headerUser}>
          <Link href="/notifications" className={styles.notificationLink} aria-label="Мэдэгдэл"><Bell aria-hidden /></Link>
          <span className={styles.userAvatar}>{session.name.slice(0, 1).toUpperCase()}</span>
          <div><strong>{session.name}</strong><small>{roleLabel}</small></div>
        </div>
      </header> : null}
      <div className={styles.standaloneContent}><ChatClient /></div>
    </main>
  );
}
