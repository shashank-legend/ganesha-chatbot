// App controller: wires the store, API client and UI components together.
import { ChatError, fetchConfig, streamChat } from "./api.js";
import { renderMarkdown } from "./markdown.js";
import { dictationSupported, readAloudSupported, startDictation, stopReadAloud, toggleReadAloud } from "./speech.js";
import { ConversationStore } from "./store.js";
import { copyText, createErrorNotice, createMessage, createTypingIndicator, setMessageContent } from "./ui/messages.js";
import { Sidebar } from "./ui/sidebar.js";
import { initTheme } from "./ui/theme.js";

const LANG_KEY = "ganesha-guide:language";

const SUGGESTIONS = [
  "I'm nervous about my exams. Any advice?",
  "Tell me the story of how you got your broken tusk",
  "I'm starting something new. How do I begin well?",
  "Why do you ride a little mouse?",
];

const $ = (sel) => document.querySelector(sel);
const dom = {
  thread: $("#thread"),
  scroller: $("#scroller"),
  form: $("#composer"),
  input: $("#composer-input"),
  send: $("#send-btn"),
  stop: $("#stop-btn"),
  mic: $("#mic-btn"),
  counter: $("#char-counter"),
  language: $("#language-select"),
  newChat: $("#new-chat-btn"),
  clearChat: $("#clear-chat-btn"),
  banner: $("#config-banner"),
  status: $("#sr-status"),
};

const state = {
  store: new ConversationStore(),
  convo: null,
  config: null,
  busy: false,
  abort: null,
  maxChars: 4000,
};

// ---------------------------------------------------------------- rendering

function scrollToBottom(force = false) {
  const s = dom.scroller;
  const nearBottom = s.scrollHeight - s.scrollTop - s.clientHeight < 120;
  if (force || nearBottom) s.scrollTop = s.scrollHeight;
}

function renderEmptyState() {
  const wrap = document.createElement("section");
  wrap.className = "empty";
  wrap.innerHTML = `
    <div class="empty__mark" aria-hidden="true">ॐ</div>
    <div class="empty__greeting markdown"></div>
    <p class="empty__hint">Try one of these, or write your own:</p>
    <div class="chips"></div>`;
  wrap.querySelector(".empty__greeting").innerHTML = renderMarkdown(state.config?.greeting || "Namaste!");
  const chips = wrap.querySelector(".chips");
  SUGGESTIONS.forEach((text) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = text;
    chip.addEventListener("click", () => sendMessage(text));
    chips.append(chip);
  });
  return wrap;
}

function renderThread() {
  dom.thread.innerHTML = "";
  const messages = state.convo?.messages || [];
  if (!messages.length) dom.thread.append(renderEmptyState());
  else messages.forEach((m) => dom.thread.append(createMessage(m, { readAloud: readAloudSupported })));
  dom.clearChat.disabled = !messages.length || state.busy;
  scrollToBottom(true);
}

function renderSidebar() {
  sidebar.render(state.store.list(), state.convo?.id);
}

function announce(text) {
  dom.status.textContent = text;
}

function setBusy(busy) {
  state.busy = busy;
  dom.send.hidden = busy;
  dom.stop.hidden = !busy;
  dom.clearChat.disabled = busy || !state.convo?.messages.length;
  dom.newChat.disabled = busy;
  updateSendState();
}

function updateSendState() {
  const length = dom.input.value.trim().length;
  dom.send.disabled = state.busy || length === 0 || dom.input.value.length > state.maxChars;
  const used = dom.input.value.length;
  dom.counter.hidden = used < state.maxChars * 0.8;
  dom.counter.textContent = `${used} / ${state.maxChars}`;
  dom.counter.classList.toggle("is-over", used > state.maxChars);
}

function autosize() {
  dom.input.style.height = "auto";
  dom.input.style.height = Math.min(dom.input.scrollHeight, 220) + "px";
}

// ---------------------------------------------------------------- chat flow

function ensureConversation() {
  if (!state.convo) state.convo = state.store.create();
  return state.convo;
}

function apiMessages(convo) {
  return convo.messages.map(({ role, content }) => ({ role, content }));
}

async function sendMessage(text) {
  const content = text.trim();
  if (!content || state.busy) return;
  if (content.length > state.maxChars) return;

  const convo = ensureConversation();
  state.store.addMessage(convo, "user", content);
  state.store.save();
  dom.input.value = "";
  autosize();
  renderThread();
  renderSidebar();
  await requestReply(convo);
}

async function requestReply(convo) {
  setBusy(true);
  stopReadAloud();
  document.querySelectorAll(".notice--error").forEach((n) => n.remove());

  const typing = createTypingIndicator();
  dom.thread.append(typing);
  scrollToBottom(true);
  announce("Ganesha is thinking");

  const controller = new AbortController();
  state.abort = controller;
  let reply = "";
  let bubble = null;
  let frame = 0;

  const flush = () => {
    frame = 0;
    if (bubble) setMessageContent(bubble, reply);
    scrollToBottom();
  };

  try {
    await streamChat(
      { messages: apiMessages(convo), language: dom.language.value },
      {
        signal: controller.signal,
        onDelta: (text) => {
          reply += text;
          if (!bubble) {
            bubble = createMessage({ id: "streaming", role: "assistant", content: "", createdAt: Date.now() });
            bubble.classList.add("is-streaming");
            typing.replaceWith(bubble);
          }
          if (!frame) frame = requestAnimationFrame(flush);
        },
      }
    );
    finishReply(convo, reply);
    announce("Ganesha replied");
  } catch (err) {
    typing.remove();
    if (err.name === "AbortError") {
      if (reply) finishReply(convo, reply + "\n\n_(stopped)_");
      else renderThread();
      announce("Reply stopped");
    } else {
      if (reply) finishReply(convo, reply);
      else bubble?.remove();
      const error = err instanceof ChatError ? err : new ChatError("unknown", "Something went wrong.");
      console.warn("Chat request failed:", error.code, error.message);
      const notice = createErrorNotice(error.message, {
        retryable: !["not_configured", "auth", "invalid_request"].includes(error.code),
        retryAfter: error.retryAfter,
      });
      dom.thread.append(notice);
      notice.scrollIntoView({ block: "end" });
      announce(error.message);
    }
  } finally {
    if (frame) cancelAnimationFrame(frame);
    state.abort = null;
    setBusy(false);
    dom.input.focus();
  }
}

function finishReply(convo, text) {
  state.store.addMessage(convo, "assistant", text);
  state.store.save();
  if (state.convo === convo) renderThread();
  renderSidebar();
}

function retryLast() {
  const convo = state.convo;
  if (!convo || state.busy) return;
  const last = convo.messages[convo.messages.length - 1];
  if (last?.role === "user") requestReply(convo);
}

// ---------------------------------------------------------------- actions

function newConversation() {
  if (state.busy) return;
  state.convo = null;
  renderThread();
  renderSidebar();
  dom.input.focus();
}

function selectConversation(id) {
  if (state.busy) return;
  state.convo = state.store.get(id);
  renderThread();
  renderSidebar();
}

function deleteConversation(id) {
  if (state.busy) return;
  const convo = state.store.get(id);
  if (!convo || !confirm(`Delete "${convo.title}"? This cannot be undone.`)) return;
  state.store.remove(id);
  if (state.convo?.id === id) state.convo = null;
  renderThread();
  renderSidebar();
}

function clearChat() {
  if (!state.convo?.messages.length || state.busy) return;
  if (!confirm("Clear all messages in this conversation?")) return;
  stopReadAloud();
  state.store.clearMessages(state.convo);
  renderThread();
  renderSidebar();
}

let stopDictation = null;
function toggleDictation() {
  if (stopDictation) {
    stopDictation();
    return;
  }
  const prefix = dom.input.value ? dom.input.value.replace(/\s*$/, " ") : "";
  dom.mic.classList.add("is-recording");
  dom.mic.setAttribute("aria-pressed", "true");
  announce("Listening");
  stopDictation = startDictation({
    lang: dom.language.value,
    onText: (text) => {
      dom.input.value = prefix + text;
      autosize();
      updateSendState();
    },
    onError: (code) => {
      const msg = code === "not-allowed" ? "Microphone access was blocked." : "Voice input stopped unexpectedly.";
      announce(msg);
      if (code !== "no-speech" && code !== "aborted") alert(msg);
    },
    onEnd: () => {
      stopDictation = null;
      dom.mic.classList.remove("is-recording");
      dom.mic.setAttribute("aria-pressed", "false");
      dom.input.focus();
    },
  });
}

// ---------------------------------------------------------------- wiring

const sidebar = new Sidebar({
  root: $("#sidebar"),
  list: $("#history-list"),
  toggle: $("#sidebar-toggle"),
  overlay: $("#sidebar-overlay"),
  onSelect: selectConversation,
  onDelete: deleteConversation,
});

dom.form.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(dom.input.value);
});

dom.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage(dom.input.value);
  }
});
dom.input.addEventListener("input", () => {
  autosize();
  updateSendState();
});

dom.stop.addEventListener("click", () => state.abort?.abort());
dom.newChat.addEventListener("click", newConversation);
dom.clearChat.addEventListener("click", clearChat);
dom.language.addEventListener("change", () => {
  try {
    localStorage.setItem(LANG_KEY, dom.language.value);
  } catch {
    /* ignore */
  }
});

dom.thread.addEventListener("click", (e) => {
  const action = e.target.closest("[data-action], [data-copy-code]");
  if (!action) return;
  if (action.hasAttribute("data-copy-code")) {
    const code = action.closest(".code-block").querySelector("code").textContent;
    copyText(code).then((ok) => {
      action.textContent = ok ? "Copied" : "Copy failed";
      setTimeout(() => (action.textContent = "Copy"), 1500);
    });
    return;
  }
  if (action.dataset.action === "retry") return retryLast();

  const id = action.closest(".msg")?.dataset.id;
  const message = state.convo?.messages.find((m) => m.id === id);
  if (!message) return;
  if (action.dataset.action === "copy") copyText(message.content, action);
  if (action.dataset.action === "speak") {
    document.querySelectorAll(".msg__action.is-speaking").forEach((b) => b.classList.remove("is-speaking"));
    const speaking = toggleReadAloud(message.content, dom.language.value, () => action.classList.remove("is-speaking"));
    action.classList.toggle("is-speaking", speaking);
  }
});

if (dictationSupported) {
  dom.mic.hidden = false;
  dom.mic.addEventListener("click", toggleDictation);
}

async function init() {
  initTheme($("#theme-toggle"));
  try {
    state.config = await fetchConfig();
    state.maxChars = state.config.maxMessageChars || state.maxChars;
    dom.language.innerHTML = "";
    Object.entries(state.config.languages).forEach(([code, label]) => {
      dom.language.append(new Option(label, code));
    });
    let saved = null;
    try {
      saved = localStorage.getItem(LANG_KEY);
    } catch {
      /* ignore */
    }
    if (saved && state.config.languages[saved]) dom.language.value = saved;
    if (!state.config.provider.configured) dom.banner.hidden = false;
  } catch (err) {
    console.warn(err);
    dom.banner.hidden = false;
    dom.banner.querySelector("p").textContent = "Could not reach the server. Make sure the Flask app is running.";
  }
  const [latest] = state.store.list();
  state.convo = latest || null;
  renderThread();
  renderSidebar();
  updateSendState();
  dom.input.focus();
}

init();
