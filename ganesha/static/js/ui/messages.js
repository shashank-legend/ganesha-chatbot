// Rendering of chat message bubbles, typing indicator and error notices.
import { renderMarkdown } from "../markdown.js";
import { icon } from "./icons.js";

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function formatTime(timestamp) {
  return timeFormat.format(new Date(timestamp));
}

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

function actionButton(name, label, iconName) {
  const btn = el("button", "msg__action", { type: "button", "data-action": name, "aria-label": label, title: label });
  btn.innerHTML = icon(iconName);
  return btn;
}

function avatar() {
  const a = el("div", "msg__avatar", { "aria-hidden": "true" });
  a.textContent = "ॐ";
  return a;
}

/** Create a message element. Assistant messages render Markdown. */
export function createMessage(message, { readAloud = false } = {}) {
  const isUser = message.role === "user";
  const article = el("article", `msg msg--${isUser ? "user" : "assistant"}`, {
    "data-id": message.id,
    "aria-label": isUser ? "You said" : "Ganesha replied",
  });

  if (!isUser) article.append(avatar());

  const body = el("div", "msg__body");
  const bubble = el("div", "msg__bubble");
  const content = el("div", isUser ? "msg__text" : "msg__text markdown");
  bubble.append(content);
  body.append(bubble);

  const meta = el("div", "msg__meta");
  const time = el("time", "msg__time", { datetime: new Date(message.createdAt).toISOString() });
  time.textContent = formatTime(message.createdAt);
  meta.append(time, actionButton("copy", "Copy message", "copy"));
  if (!isUser && readAloud) meta.append(actionButton("speak", "Read aloud", "volume"));
  body.append(meta);

  article.append(body);
  setMessageContent(article, message.content, message.role);
  return article;
}

export function setMessageContent(article, text, role = "assistant") {
  const content = article.querySelector(".msg__text");
  if (role === "user") content.textContent = text;
  else content.innerHTML = renderMarkdown(text);
}

export function createTypingIndicator() {
  const article = el("article", "msg msg--assistant msg--typing", { "aria-label": "Ganesha is typing" });
  article.append(avatar());
  const bubble = el("div", "msg__bubble");
  bubble.innerHTML = '<span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">Ganesha is thinking…</span>';
  const body = el("div", "msg__body");
  body.append(bubble);
  article.append(body);
  return article;
}

export function createErrorNotice(message, { retryable = true, retryAfter } = {}) {
  const box = el("div", "notice notice--error", { role: "alert" });
  const text = el("p");
  text.textContent = message;
  box.append(text);
  if (retryable) {
    const retry = el("button", "btn btn--ghost btn--sm", { type: "button", "data-action": "retry" });
    retry.innerHTML = `${icon("refresh")}<span>Try again</span>`;
    if (retryAfter) {
      retry.disabled = true;
      let remaining = retryAfter;
      const label = retry.querySelector("span");
      label.textContent = `Try again in ${remaining}s`;
      const timer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(timer);
          retry.disabled = false;
          label.textContent = "Try again";
        } else {
          label.textContent = `Try again in ${remaining}s`;
        }
      }, 1000);
    }
    box.append(retry);
  }
  return box;
}

export async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    if (button) {
      const original = button.innerHTML;
      button.innerHTML = icon("check");
      button.classList.add("is-done");
      setTimeout(() => {
        button.innerHTML = original;
        button.classList.remove("is-done");
      }, 1500);
    }
    return true;
  } catch {
    return false;
  }
}
