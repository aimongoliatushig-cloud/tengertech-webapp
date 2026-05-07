"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import styles from "./chat.module.css";

type Conversation = {
  id: string;
  name: string;
  description: string;
};

type ChatMessage = {
  id: string;
  conversationId: string;
  author: string;
  roleLabel: string;
  body: string;
  sentAt: string;
  own: boolean;
};

const STORAGE_KEY = "municipal-ops-chat-v1";
const SEED_TIMESTAMP = "2026-04-25T00:00:00.000Z";

const CONVERSATIONS: Conversation[] = [
  {
    id: "operations",
    name: "Ерөнхий чат",
    description: "Өдрийн шуурхай мэдээлэл",
  },
  {
    id: "field",
    name: "Талбайн баг",
    description: "Маршрут, гүйцэтгэл",
  },
  {
    id: "support",
    name: "Дэмжлэг",
    description: "Техник, системийн тусламж",
  },
];

const INITIAL_MESSAGES: Record<string, ChatMessage[]> = {
  operations: [
    {
      id: "seed-operations-1",
      conversationId: "operations",
      author: "Систем",
      roleLabel: "Мэдэгдэл",
      body: "Өдрийн мэдээллээ энд солилцоно.",
      sentAt: SEED_TIMESTAMP,
      own: false,
    },
  ],
  field: [
    {
      id: "seed-field-1",
      conversationId: "field",
      author: "Систем",
      roleLabel: "Мэдэгдэл",
      body: "Талбайн багийн шуурхай зурвас энд харагдана.",
      sentAt: SEED_TIMESTAMP,
      own: false,
    },
  ],
  support: [
    {
      id: "seed-support-1",
      conversationId: "support",
      author: "Систем",
      roleLabel: "Мэдэгдэл",
      body: "Систем болон техникийн тусламжийн хүсэлтээ энд бичнэ.",
      sentAt: SEED_TIMESTAMP,
      own: false,
    },
  ],
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ulaanbaatar",
  }).format(date);
}

function formatConversationPreview(message: ChatMessage | undefined, fallback: string) {
  if (!message) {
    return fallback;
  }

  const timestamp = formatDateTime(message.sentAt);
  const meta = [message.author, timestamp].filter(Boolean).join(" - ");
  return meta ? `${meta}: ${message.body}` : message.body;
}

function buildEmptyMessageMap() {
  return CONVERSATIONS.reduce<Record<string, ChatMessage[]>>((messages, conversation) => {
    messages[conversation.id] = INITIAL_MESSAGES[conversation.id] ?? [];
    return messages;
  }, {});
}

export function ChatClient({
  userName,
  roleLabel,
}: {
  userName: string;
  roleLabel: string;
}) {
  const [activeConversationId, setActiveConversationId] = useState(CONVERSATIONS[0].id);
  const [messagesByConversation, setMessagesByConversation] = useState(buildEmptyMessageMap);
  const [draft, setDraft] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(STORAGE_KEY);
      if (storedValue) {
        const parsedValue = JSON.parse(storedValue) as Record<string, ChatMessage[]>;
        setMessagesByConversation({
          ...buildEmptyMessageMap(),
          ...parsedValue,
        });
      }
    } catch {
      setMessagesByConversation(buildEmptyMessageMap());
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messagesByConversation));
  }, [isHydrated, messagesByConversation]);

  const activeConversation = useMemo(
    () =>
      CONVERSATIONS.find((conversation) => conversation.id === activeConversationId) ??
      CONVERSATIONS[0],
    [activeConversationId],
  );
  const activeMessages = messagesByConversation[activeConversation.id] ?? [];
  const totalMessageCount = Object.values(messagesByConversation).reduce(
    (sum, messages) => sum + messages.length,
    0,
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const body = draft.trim();
    if (!body) {
      return;
    }

    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      conversationId: activeConversation.id,
      author: userName,
      roleLabel,
      body,
      sentAt: new Date().toISOString(),
      own: true,
    };

    setMessagesByConversation((currentMessages) => ({
      ...currentMessages,
      [activeConversation.id]: [...(currentMessages[activeConversation.id] ?? []), message],
    }));
    setDraft("");
  };

  return (
    <section className={styles.chatShell}>
      <aside className={styles.conversationPanel}>
        <div className={styles.panelHeader}>
          <span>Суваг</span>
          <strong>{totalMessageCount}</strong>
        </div>

        <div className={styles.conversationList}>
          {CONVERSATIONS.map((conversation) => {
            const messages = messagesByConversation[conversation.id] ?? [];
            const lastMessage = messages[messages.length - 1];
            const isActive = conversation.id === activeConversation.id;

            return (
              <button
                key={conversation.id}
                type="button"
                className={`${styles.conversationButton} ${
                  isActive ? styles.conversationButtonActive : ""
                }`}
                onClick={() => setActiveConversationId(conversation.id)}
              >
                <span className={styles.conversationAvatar}>
                  {conversation.name.slice(0, 1)}
                </span>
                <span className={styles.conversationCopy}>
                  <strong>{conversation.name}</strong>
                  <small>{formatConversationPreview(lastMessage, conversation.description)}</small>
                </span>
                <span className={styles.conversationCount}>{messages.length}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className={styles.messagePanel}>
        <header className={styles.messageHeader}>
          <div>
            <span>{activeConversation.description}</span>
            <h2>{activeConversation.name}</h2>
          </div>
          <strong>{activeMessages.length} зурвас</strong>
        </header>

        <div className={styles.messageList}>
          {activeMessages.map((message) => (
            <article
              key={message.id}
              className={`${styles.messageBubble} ${message.own ? styles.messageBubbleOwn : ""}`}
            >
              <div className={styles.messageMeta}>
                <div className={styles.messageAuthor}>
                  <strong>{message.author}</strong>
                  <span>{message.roleLabel}</span>
                </div>
                <time dateTime={message.sentAt}>{formatDateTime(message.sentAt)}</time>
              </div>
              <p>{message.body}</p>
            </article>
          ))}
        </div>

        <form className={styles.composer} onSubmit={handleSubmit}>
          <label htmlFor="chat_message">Зурвас</label>
          <div className={styles.composerRow}>
            <textarea
              id="chat_message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Зурвасаа бичнэ үү"
              rows={2}
            />
            <button type="submit" disabled={!draft.trim()}>
              Илгээх
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
