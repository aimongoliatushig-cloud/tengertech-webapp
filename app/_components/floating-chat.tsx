"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { MessageSquare, X } from "lucide-react";
import { usePathname } from "next/navigation";
import styles from "./floating-chat.module.css";

export function FloatingChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number; width: number; height: number } | null>(null);
  const suppressClickRef = useRef(false);
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

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("floating-chat-position");
      if (!stored) return;
      const value = JSON.parse(stored) as { x?: number; y?: number };
      if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
        setPosition({
          x: Math.max(8, Math.min(Number(value.x), window.innerWidth - 72)),
          y: Math.max(8, Math.min(Number(value.y), window.innerHeight - 56)),
        });
      }
    } catch {}
  }, []);

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.hypot(deltaX, deltaY) > 5) suppressClickRef.current = true;
    setPosition({
      x: Math.max(8, Math.min(drag.left + deltaX, window.innerWidth - drag.width - 8)),
      y: Math.max(8, Math.min(drag.top + deltaY, window.innerHeight - drag.height - 8)),
    });
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const rect = event.currentTarget.getBoundingClientRect();
    const finalPosition = { x: Math.round(rect.left), y: Math.round(rect.top) };
    setPosition(finalPosition);
    try { window.localStorage.setItem("floating-chat-position", JSON.stringify(finalPosition)); } catch {}
  }

  function toggleChat() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen((value) => !value);
  }

  if (hidden) return null;
  return <>
    {open ? <button type="button" className={styles.backdrop} aria-label="Чат хаах" onClick={() => setOpen(false)}/> : null}
    <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`} aria-hidden={!open}>
      <header><strong>Чат</strong><button type="button" onClick={() => setOpen(false)} aria-label="Чат хаах"><X/></button></header>
      {open ? <iframe src="/chat?embedded=1" title="Байгууллагын чат" allow="camera; microphone"/> : null}
    </aside>
    <button
      type="button"
      className={styles.launcher}
      style={position ? ({ left: position.x, top: position.y, bottom: "auto" } as CSSProperties) : undefined}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={toggleChat}
      aria-label={open ? "Чат хаах" : "Чат нээх"}
      title="Чат нээх эсвэл чирж зөөх"
    >
      {open ? <X/> : <MessageSquare/>}<span>Чат</span>{unread > 0 ? <b>{unread > 99 ? "99+" : unread}</b> : null}
    </button>
  </>;
}
