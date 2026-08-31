"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, FileText, MessageCirclePlus, Mic, Paperclip, Search, Square, Trash2, Users, X } from "lucide-react";
import styles from "./chat.module.css";

type Employee = { id: number; name: string; department: string; jobTitle: string; photoUrl: string };
type Conversation = { id: string; type: "general" | "direct" | "group"; name: string; description: string; memberIds: number[]; updatedAt: string };
type Attachment = { id: string; name: string; mimeType: string; size: number };
type ChatMessage = { id: string; conversationId: string; authorId: number; author: string; roleLabel: string; body: string; sentAt: string; readBy: number[]; attachment?: Attachment };
type Snapshot = { conversations: Conversation[]; messages: ChatMessage[]; employees: Employee[]; currentUserId: number; onlineUserIds: number[] };

export function ChatClient() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ conversations: [], messages: [], employees: [], currentUserId: 0, onlineUserIds: [] });
  const [sidebarTab, setSidebarTab] = useState<"employees" | "groups">("employees");
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const load = useCallback(async () => {
    const response = await fetch("/api/chat?view=snapshot", { cache: "no-store" });
    if (!response.ok) return;
    const value = await response.json() as Omit<Snapshot, "employees">;
    setSnapshot((current) => ({ ...current, ...value }));
    setActiveId((current) => current || value.conversations[0]?.id || "");
  }, []);

  const loadDirectory = useCallback(async () => {
    const response = await fetch("/api/chat?view=directory");
    if (!response.ok) return;
    const value = await response.json() as Pick<Snapshot, "employees" | "currentUserId">;
    setSnapshot((current) => ({ ...current, ...value }));
    try { window.sessionStorage.setItem("chat-employee-directory", JSON.stringify(value)); } catch {}
  }, []);

  useEffect(() => {
    try {
      const cached = window.sessionStorage.getItem("chat-employee-directory");
      if (cached) setSnapshot((current) => ({ ...current, ...JSON.parse(cached) as Pick<Snapshot, "employees" | "currentUserId"> }));
    } catch {}
    void load();
    void loadDirectory();
    const heartbeat = () => void fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "presence" }) });
    heartbeat();
    const presenceTimer = window.setInterval(heartbeat, 25_000);
    const events = new EventSource("/api/chat/events");
    events.addEventListener("chat", () => void load());
    return () => { events.close(); window.clearInterval(presenceTimer); };
  }, [load, loadDirectory]);

  const active = snapshot.conversations.find((item) => item.id === activeId) ?? snapshot.conversations[0];
  const messages = useMemo(() => snapshot.messages.filter((item) => item.conversationId === active?.id), [snapshot.messages, active?.id]);
  const filteredEmployees = useMemo(
    () => snapshot.employees.filter(
      (item) =>
        item.id !== snapshot.currentUserId &&
        `${item.name} ${item.department} ${item.jobTitle}`.toLowerCase().includes(search.toLowerCase()),
    ),
    [search, snapshot.currentUserId, snapshot.employees],
  );
  const filteredEmployeeIds = useMemo(
    () => filteredEmployees.map((employee) => employee.id),
    [filteredEmployees],
  );
  const allFilteredEmployeesSelected =
    filteredEmployeeIds.length > 0 && filteredEmployeeIds.every((employeeId) => selected.includes(employeeId));
  const groupedEmployees = useMemo(() => Object.entries(filteredEmployees.reduce<Record<string, Employee[]>>((groups, employee) => { const key = employee.department || "Бусад"; (groups[key] ||= []).push(employee); return groups; }, {})), [filteredEmployees]);

  function toggleAllFilteredEmployees() {
    setSelected((current) => {
      if (filteredEmployeeIds.length > 0 && filteredEmployeeIds.every((employeeId) => current.includes(employeeId))) {
        const filteredIdSet = new Set(filteredEmployeeIds);
        return current.filter((employeeId) => !filteredIdSet.has(employeeId));
      }
      return Array.from(new Set([...current, ...filteredEmployeeIds]));
    });
  }

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
    if ((!draft.trim() && !pendingFile) || !active || sending) return;
    setSending(true); setError("");
    try {
      if (pendingFile) { const form = new FormData(); form.set("file", pendingFile); form.set("conversationId", active.id); form.set("body", draft); const response = await fetch("/api/chat/upload", { method: "POST", body: form }); if (!response.ok) throw new Error((await response.json()).error); }
      else await post({ action: "message", conversationId: active.id, body: draft });
      setDraft(""); setPendingFile(null); await load();
    }
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

  async function removeMessage(messageId: string) {
    if (!window.confirm("Энэ зурвасыг устгах уу?")) return;
    setError("");
    try { await post({ action: "delete", messageId }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Зурвас устгаж чадсангүй."); }
  }

  function conversationName(item: Conversation) {
    if (item.type !== "direct") return item.name;
    return snapshot.employees.find((employee) => item.memberIds.includes(employee.id) && employee.id !== snapshot.currentUserId)?.name || item.name;
  }

  async function openEmployee(employeeId: number) {
    try { const value = await post({ action: "conversation", memberIds: [employeeId], name: "" }); await load(); setActiveId(value.conversation.id); setMobileConversationOpen(true); }
    catch { setError("Хувийн чат нээж чадсангүй."); }
  }

  async function toggleRecording() {
    if (recording) { recorderRef.current?.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream); chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => { const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }); setPendingFile(new File([blob], `voice-${Date.now()}.webm`, { type: blob.type })); stream.getTracks().forEach((track) => track.stop()); };
      recorder.start(); recorderRef.current = recorder; setRecording(true);
    } catch { setError("Микрофон ашиглах зөвшөөрөл шаардлагатай."); }
  }

  function attachmentView(attachment: Attachment) {
    const url = `/api/chat/media/${attachment.id}`;
    if (attachment.mimeType.startsWith("image/")) return <a href={url} target="_blank"><img className={styles.chatImage} src={url} alt={attachment.name}/></a>;
    if (attachment.mimeType.startsWith("audio/")) return <audio className={styles.chatAudio} controls preload="metadata" src={url}/>;
    return <a className={styles.fileAttachment} href={url} target="_blank"><FileText/><span><strong>{attachment.name}</strong><small>{Math.ceil(attachment.size / 1024)} KB</small></span></a>;
  }

  return <section className={styles.chatShell}>
    <aside className={`${styles.conversationPanel} ${mobileConversationOpen ? styles.mobileListHidden : ""}`}>
      <div className={styles.directoryTabs}><button type="button" className={sidebarTab === "employees" ? styles.directoryTabActive : ""} onClick={() => setSidebarTab("employees")}>Албан хаагч</button><button type="button" className={sidebarTab === "groups" ? styles.directoryTabActive : ""} onClick={() => setSidebarTab("groups")}>Бүлэг</button></div>
      <label className={styles.directorySearch}><Search/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Хайх..."/></label>
      <div className={styles.directoryStats}><span>Нийт: <strong>{filteredEmployees.length}</strong></span><span>Идэвхтэй: <strong>{snapshot.onlineUserIds.filter((id) => id !== snapshot.currentUserId).length}</strong></span>{sidebarTab === "groups" ? <button type="button" onClick={() => setShowCreate(true)}><MessageCirclePlus/> Бүлэг үүсгэх</button> : null}</div>
      {sidebarTab === "employees" ? <div className={styles.employeeDirectory}>{groupedEmployees.map(([department, employees]) => <section key={department}><h3>{department}</h3>{employees.map((employee) => <button key={employee.id} type="button" className={styles.directoryEmployee} onClick={() => void openEmployee(employee.id)}><span className={styles.directoryAvatar}>{employee.photoUrl ? <img src={employee.photoUrl} alt=""/> : employee.name.split(" ").map((part) => part[0]).join("").slice(-2)}<i className={snapshot.onlineUserIds.includes(employee.id) ? styles.onlineDot : styles.offlineDot}/></span><span><strong>{employee.name}</strong><small>{employee.jobTitle || "Ажилтан"}</small></span></button>)}</section>)}</div> :
      <div className={styles.conversationList}>{snapshot.conversations.map((item) => {
        const last = snapshot.messages.filter((message) => message.conversationId === item.id).at(-1);
        const unread = snapshot.messages.filter((message) => message.conversationId === item.id && !message.readBy.includes(snapshot.currentUserId)).length;
        return <button key={item.id} type="button" className={`${styles.conversationButton} ${item.id === active?.id ? styles.conversationButtonActive : ""}`} onClick={() => { setActiveId(item.id); setMobileConversationOpen(true); }}>
          <span className={styles.conversationAvatar}>{item.type === "group" || item.type === "general" ? <Users /> : conversationName(item).slice(0, 1)}</span>
          <span className={styles.conversationCopy}><strong>{conversationName(item)}</strong><small>{last?.body || item.description}</small></span>
          {unread > 0 ? <span className={styles.conversationCount}>{unread}</span> : null}
        </button>;
      })}</div>}
    </aside>
    <div className={`${styles.messagePanel} ${mobileConversationOpen ? styles.mobileMessageOpen : ""}`}>
      <header className={styles.messageHeader}><button type="button" className={styles.mobileBackButton} onClick={() => setMobileConversationOpen(false)} aria-label="Чатын жагсаалт руу буцах"><ArrowLeft /></button><div><span>{active?.description || "Чат сонгоно уу"}</span><h2>{active ? conversationName(active) : "Харилцаа холбоо"}</h2></div><strong>{messages.length} зурвас</strong></header>
      <div className={styles.messageList}>{messages.map((message) => {
        const author = snapshot.employees.find((employee) => employee.id === message.authorId);
        const own = message.authorId === snapshot.currentUserId;
        return <div key={message.id} className={`${styles.messageRow} ${own ? styles.messageRowOwn : ""}`}>
          <span className={styles.messageAvatar}>{author?.photoUrl ? <img src={author.photoUrl} alt=""/> : null}</span>
          <article className={`${styles.messageBubble} ${own ? styles.messageBubbleOwn : ""}`}>
            {own ? <button type="button" className={styles.deleteMessageButton} onClick={() => void removeMessage(message.id)} aria-label="Зурвас устгах" title="Устгах"><Trash2/></button> : null}
            {message.attachment ? attachmentView(message.attachment) : null}{message.body ? <p>{message.body}</p> : null}
          </article>
        </div>;
      })}</div>
      {error ? <p className={styles.chatError}>{error}</p> : null}
      <form className={styles.composer} onSubmit={send}>{pendingFile ? <div className={styles.pendingFile}><span>{pendingFile.type.startsWith("audio/") ? "Voice: " : "Файл: "}{pendingFile.name}</span><button type="button" onClick={() => setPendingFile(null)}><X/></button></div> : null}<div className={styles.composerRow}><div className={styles.mediaActions}><label title="Зураг эсвэл файл"><Paperclip/><input type="file" accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(event) => setPendingFile(event.target.files?.[0] || null)}/></label><label title="Камераар зураг авах"><Camera/><input type="file" accept="image/*" capture="environment" onChange={(event) => setPendingFile(event.target.files?.[0] || null)}/></label><button type="button" className={recording ? styles.recordingButton : ""} onClick={() => void toggleRecording()} title="Voice бичих">{recording ? <Square/> : <Mic/>}</button></div><textarea id="chat_message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={recording ? "Voice бичиж байна..." : "Зурвасаа бичнэ үү"} rows={2}/><button type="submit" disabled={(!draft.trim() && !pendingFile) || sending}>{sending ? "Илгээж байна..." : "Илгээх"}</button></div></form>
    </div>
    {showCreate ? <div className={styles.modalBackdrop}><div className={styles.chatModal} role="dialog" aria-modal="true" aria-label="Шинэ чат"><div className={styles.modalHeader}><div><strong>Шинэ чат эсвэл групп</strong><span>Ажилтнуудаа сонгоно уу</span></div><button type="button" className={styles.iconButton} onClick={() => setShowCreate(false)}><X /></button></div>
      <label className={styles.searchBox}><Search/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Нэр, хэлтэс, албан тушаал..."/></label>
      {selected.length > 1 ? <input className={styles.groupNameInput} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Группийн нэр"/> : null}
      <div className={styles.selectAllRow}>
        <label>
          <input type="checkbox" checked={allFilteredEmployeesSelected} disabled={!filteredEmployeeIds.length} onChange={toggleAllFilteredEmployees}/>
          <span><strong>Бүгдийг сонгох</strong><small>Харагдаж буй {filteredEmployeeIds.length} ажилтан</small></span>
        </label>
        <strong>{selected.length} сонгосон</strong>
      </div>
      <div className={styles.employeeList}>{filteredEmployees.map((employee) => <label key={employee.id} className={styles.employeeOption}><input type="checkbox" checked={selected.includes(employee.id)} onChange={() => setSelected((items) => items.includes(employee.id) ? items.filter((id) => id !== employee.id) : [...items, employee.id])}/><span className={styles.conversationAvatar}>{employee.name.slice(0, 1)}</span><span><strong>{employee.name}</strong><small>{employee.jobTitle} · {employee.department}</small></span></label>)}</div>
      <button type="button" className={styles.createChatButton} disabled={!selected.length || sending || (selected.length > 1 && !groupName.trim())} onClick={createConversation}>{selected.length > 1 ? "Групп үүсгэх" : "Чат эхлүүлэх"}</button>
    </div></div> : null}
  </section>;
}
