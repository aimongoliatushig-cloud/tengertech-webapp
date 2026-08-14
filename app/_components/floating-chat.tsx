"use client";

import { useEffect, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { usePathname } from "next/navigation";
import styles from "./floating-chat.module.css";

export function FloatingChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const hidden = pathname === "/chat" || pathname.startsWith("/auth/") || pathname === "/login";

  useEffect(() => {
    if (hidden) return;
    const refresh = async () => {
      const response = await fetch("/api/chat/unread", { cache: "no-store" }).catch(() => null);
      if (response?.ok) setUnread(Math.max(0, Number((await response.json()).unread) || 0));
    };
    void refresh();
    const events = new EventSource("/api/chat/events");
    events.addEventListener("chat", () => void refresh());
    return () => events.close();
  }, [hidden]);

  if (hidden) return null;
  return <>
    {open ? <button type="button" className={styles.backdrop} aria-label="Чат хаах" onClick={() => setOpen(false)}/> : null}
    <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`} aria-hidden={!open}>
      <header><strong>Чат</strong><button type="button" onClick={() => setOpen(false)} aria-label="Чат хаах"><X/></button></header>
      {open ? <iframe src="/chat?embedded=1" title="Байгууллагын чат" allow="camera; microphone"/> : null}
    </aside>
    <button type="button" className={styles.launcher} onClick={() => setOpen((value) => !value)} aria-label={open ? "Чат хаах" : "Чат нээх"}>
      {open ? <X/> : <MessageSquare/>}<span>Чат</span>{unread > 0 ? <b>{unread > 99 ? "99+" : unread}</b> : null}
    </button>
  </>;
}
