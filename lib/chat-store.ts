import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

export type ChatConversation = {
  id: string;
  type: "general" | "direct" | "group";
  name: string;
  description: string;
  createdBy: number;
  memberIds: number[];
  createdAt: string;
  updatedAt: string;
};

export type StoredChatMessage = {
  id: string;
  conversationId: string;
  authorId: number;
  author: string;
  roleLabel: string;
  body: string;
  sentAt: string;
  readBy: number[];
};

type ChatStore = { conversations: ChatConversation[]; messages: StoredChatMessage[]; presence: Record<string, string> };

const DATA_FILE = path.join(process.cwd(), "data", "chat-store.json");
let writeQueue = Promise.resolve();

function initialStore(): ChatStore {
  const timestamp = new Date().toISOString();
  return {
    conversations: [{
      id: "general",
      type: "general",
      name: "Бүх ажилтны чат",
      description: "Байгууллагын нийт ажилтны нэгдсэн харилцаа",
      createdBy: 0,
      memberIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    messages: [], presence: {},
  };
}

async function readStore(): Promise<ChatStore> {
  try {
    const value = JSON.parse(await fs.readFile(DATA_FILE, "utf8")) as Partial<ChatStore>;
    const base = initialStore();
    return {
      conversations: Array.isArray(value.conversations) && value.conversations.length
        ? value.conversations
        : base.conversations,
      messages: Array.isArray(value.messages) ? value.messages : [],
      presence: value.presence && typeof value.presence === "object" ? value.presence : {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return initialStore();
    throw error;
  }
}

async function writeStore(store: ChatStore) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const temporaryFile = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(temporaryFile, DATA_FILE);
}

async function mutate<T>(callback: (store: ChatStore) => T | Promise<T>) {
  let result!: T;
  writeQueue = writeQueue.then(async () => {
    const store = await readStore();
    result = await callback(store);
    await writeStore(store);
  });
  await writeQueue;
  return result;
}

function canAccess(conversation: ChatConversation, userId: number) {
  return conversation.type === "general" || conversation.memberIds.includes(userId);
}

export async function getChatSnapshot(userId: number) {
  const store = await readStore();
  const conversations = store.conversations.filter((item) => canAccess(item, userId));
  const ids = new Set(conversations.map((item) => item.id));
  return { conversations, messages: store.messages.filter((item) => ids.has(item.conversationId)), onlineUserIds: Object.entries(store.presence).filter(([, seen]) => Date.now() - new Date(seen).getTime() < 60_000).map(([id]) => Number(id)) };
}

export async function updateChatPresence(userId: number) {
  return mutate((store) => { store.presence[String(userId)] = new Date().toISOString(); return true; });
}

export async function createChatConversation(input: { userId: number; memberIds: number[]; name?: string }) {
  return mutate((store) => {
    const memberIds = Array.from(new Set([input.userId, ...input.memberIds.filter((id) => id > 0)]));
    if (memberIds.length < 2) throw new Error("CHAT_MEMBERS_REQUIRED");
    const type = memberIds.length === 2 && !input.name?.trim() ? "direct" : "group";
    if (type === "direct") {
      const existing = store.conversations.find((item) => item.type === "direct" &&
        item.memberIds.length === 2 && memberIds.every((id) => item.memberIds.includes(id)));
      if (existing) return existing;
    }
    const timestamp = new Date().toISOString();
    const conversation: ChatConversation = {
      id: crypto.randomUUID(), type,
      name: input.name?.trim().slice(0, 80) || "Хувийн чат",
      description: type === "group" ? `${memberIds.length} гишүүнтэй групп` : "Хувийн харилцаа",
      createdBy: input.userId, memberIds, createdAt: timestamp, updatedAt: timestamp,
    };
    store.conversations.push(conversation);
    return conversation;
  });
}

export async function addChatMessage(input: { userId: number; author: string; roleLabel: string; conversationId: string; body: string }) {
  return mutate((store) => {
    const conversation = store.conversations.find((item) => item.id === input.conversationId);
    if (!conversation || !canAccess(conversation, input.userId)) throw new Error("CHAT_ACCESS_DENIED");
    const body = input.body.trim().slice(0, 4000);
    if (!body) throw new Error("CHAT_MESSAGE_REQUIRED");
    const sentAt = new Date().toISOString();
    const message: StoredChatMessage = {
      id: crypto.randomUUID(), conversationId: conversation.id, authorId: input.userId,
      author: input.author, roleLabel: input.roleLabel, body, sentAt, readBy: [input.userId],
    };
    store.messages.push(message);
    conversation.updatedAt = sentAt;
    return message;
  });
}

export async function markChatRead(userId: number, conversationId: string) {
  return mutate((store) => {
    const conversation = store.conversations.find((item) => item.id === conversationId);
    if (!conversation || !canAccess(conversation, userId)) throw new Error("CHAT_ACCESS_DENIED");
    store.messages.forEach((message) => {
      if (message.conversationId === conversationId && !message.readBy.includes(userId)) message.readBy.push(userId);
    });
    return true;
  });
}
