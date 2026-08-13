"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MessageCirclePlus, Search, Users, X } from "lucide-react";
import styles from "./chat.module.css";

type Employee = { id: number; name: string; department: string; jobTitle: string; photoUrl: string };
type Conversation = { id: string; type: "general" | "direct" | "group"; name: string; description: string; memberIds: number[]; updatedAt: string };
type ChatMessage = { id: string; conversationId: string; authorId: number; author: string; roleLabel: string; body: string; sentAt: string; readBy: number[] };
type Snapshot = { conversations: Conversation[]; messages: ChatMessage[]; employees: Employee[]; currentUserId: number };

function formatTime(value: string) {
  return new Intl.DateTimeFormat("mn-MN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function ChatClient() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ conversations: [], messages: [], employees: [], currentUserId: 0 });
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/chat", { cache: "no-store" });
    if (!response.ok) return;
    const value = await response.json() as Snapshot;
    setSnapshot(value);
    setActiveId((current) => current || value.conversations[0]?.id || "");
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const active = snapshot.conversations.find((item) => item.id === activeId) ?? snapshot.conversations[0];
  const messages = useMemo(() => snapshot.messages.filter((item) => item.conversationId === active?.id), [snapshot.messages, active?.id]);
  const filteredEmployees = snapshot.employees.filter((item) => item.id !== snapshot.currentUserId && `${item.name} ${item.department} ${item.jobTitle}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (!active?.id) return;
    void fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", conversationId: active.id }) });
  }, [active?.id, messages.length]);

  async function post(payload: object) {
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "Алдаа гарлаа.");
    return value;
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !active || sending) return;
    setSending(true); setError("");
    try { await post({ action: "message", conversationId: active.id, body: draft }); setDraft(""); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Зурвас илгээж чадсангүй."); }
    finally { setSending(false); }
  }

  async function createConversation() {
    if (!selected.length) return;
    setSending(true); setError("");
    try {
      const value = await post({ action: "conversation", memberIds: selected, name: selected.length > 1 ? groupName : "" });
      setShowCreate(false); setSelected([]); setGroupName(""); await load(); setActiveId(value.conversation.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Чат үүсгэж чадсангүй."); }
    finally { setSending(false); }
  }

  function conversationName(item: Conversation) {
    if (item.type !== "direct") return item.name;
    return snapshot.employees.find((employee) => item.memberIds.includes(employee.id) && employee.id !== snapshot.currentUserId)?.name || item.name;
  }

  return <section className={styles.chatShell}>
    <aside className={styles.conversationPanel}>
      <div className={styles.panelHeader}><span>Харилцан яриа</span><button type="button" className={styles.iconButton} onClick={() => setShowCreate(true)} title="Шинэ чат"><MessageCirclePlus /></button></div>
      <div className={styles.conversationList}>{snapshot.conversations.map((item) => {
        const last = snapshot.messages.filter((message) => message.conversationId === item.id).at(-1);
        const unread = snapshot.messages.filter((message) => message.conversationId === item.id && !message.readBy.includes(snapshot.currentUserId)).length;
        return <button key={item.id} type="button" className={`${styles.conversationButton} ${item.id === active?.id ? styles.conversationButtonActive : ""}`} onClick={() => setActiveId(item.id)}>
          <span className={styles.conversationAvatar}>{item.type === "group" || item.type === "general" ? <Users /> : conversationName(item).slice(0, 1)}</span>
          <span className={styles.conversationCopy}><strong>{conversationName(item)}</strong><small>{last?.body || item.description}</small></span>
          {unread > 0 ? <span className={styles.conversationCount}>{unread}</span> : null}
        </button>;
      })}</div>
    </aside>
    <div className={styles.messagePanel}>
      <header className={styles.messageHeader}><div><span>{active?.description || "Чат сонгоно уу"}</span><h2>{active ? conversationName(active) : "Харилцаа холбоо"}</h2></div><strong>{messages.length} зурвас</strong></header>
      <div className={styles.messageList}>{messages.map((message) => <article key={message.id} className={`${styles.messageBubble} ${message.authorId === snapshot.currentUserId ? styles.messageBubbleOwn : ""}`}>
        <div className={styles.messageMeta}><strong>{message.author}</strong><span>{message.roleLabel}</span><time>{formatTime(message.sentAt)}</time></div><p>{message.body}</p>
      </article>)}</div>
      {error ? <p className={styles.chatError}>{error}</p> : null}
      <form className={styles.composer} onSubmit={send}><label htmlFor="chat_message">Зурвас</label><div className={styles.composerRow}><textarea id="chat_message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Зурвасаа бичнэ үү" rows={2}/><button type="submit" disabled={!draft.trim() || sending}>{sending ? "Илгээж байна..." : "Илгээх"}</button></div></form>
    </div>
    {showCreate ? <div className={styles.modalBackdrop}><div className={styles.chatModal} role="dialog" aria-modal="true" aria-label="Шинэ чат"><div className={styles.modalHeader}><div><strong>Шинэ чат эсвэл групп</strong><span>Ажилтнуудаа сонгоно уу</span></div><button type="button" className={styles.iconButton} onClick={() => setShowCreate(false)}><X /></button></div>
      <label className={styles.searchBox}><Search/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Нэр, хэлтэс, албан тушаал..."/></label>
      {selected.length > 1 ? <input className={styles.groupNameInput} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Группийн нэр"/> : null}
      <div className={styles.employeeList}>{filteredEmployees.map((employee) => <label key={employee.id} className={styles.employeeOption}><input type="checkbox" checked={selected.includes(employee.id)} onChange={() => setSelected((items) => items.includes(employee.id) ? items.filter((id) => id !== employee.id) : [...items, employee.id])}/><span className={styles.conversationAvatar}>{employee.name.slice(0, 1)}</span><span><strong>{employee.name}</strong><small>{employee.jobTitle} · {employee.department}</small></span></label>)}</div>
      <button type="button" className={styles.createChatButton} disabled={!selected.length || sending || (selected.length > 1 && !groupName.trim())} onClick={createConversation}>{selected.length > 1 ? "Групп үүсгэх" : "Чат эхлүүлэх"}</button>
    </div></div> : null}
  </section>;
}
