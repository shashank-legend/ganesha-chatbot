// Conversation persistence in the browser (localStorage).
// Conversations never leave the user's device except when sent to the API
// to generate a reply.

const STORAGE_KEY = "ganesha-guide:conversations:v1";
const MAX_CONVERSATIONS = 30;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class ConversationStore {
  constructor() {
    this.conversations = readAll();
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  save() {
    // Keep only conversations with messages, newest first, capped in size.
    this.conversations = this.conversations
      .filter((c) => c.messages.length)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CONVERSATIONS);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.conversations));
    } catch {
      /* storage full or unavailable (private mode): keep working in memory */
    }
    this.listeners.forEach((fn) => fn());
  }

  list() {
    return this.conversations.filter((c) => c.messages.length);
  }

  get(id) {
    return this.conversations.find((c) => c.id === id) || null;
  }

  create() {
    const now = Date.now();
    const convo = { id: uid(), title: "New conversation", messages: [], createdAt: now, updatedAt: now };
    this.conversations.unshift(convo);
    return convo;
  }

  addMessage(convo, role, content) {
    const message = { id: uid(), role, content, createdAt: Date.now() };
    convo.messages.push(message);
    if (role === "user" && convo.title === "New conversation") {
      convo.title = content.replace(/\s+/g, " ").slice(0, 60);
    }
    convo.updatedAt = Date.now();
    return message;
  }

  clearMessages(convo) {
    convo.messages = [];
    convo.title = "New conversation";
    this.save();
  }

  remove(id) {
    this.conversations = this.conversations.filter((c) => c.id !== id);
    this.save();
  }
}
