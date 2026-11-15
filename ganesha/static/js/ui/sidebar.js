// Conversation history sidebar (a drawer on small screens).
import { icon } from "./icons.js";

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export class Sidebar {
  constructor({ root, list, toggle, overlay, onSelect, onDelete }) {
    this.root = root;
    this.list = list;
    this.toggleBtn = toggle;
    this.overlay = overlay;
    this.onSelect = onSelect;
    this.onDelete = onDelete;

    this.toggleBtn.addEventListener("click", () => this.setOpen(!this.root.classList.contains("is-open")));
    this.overlay.addEventListener("click", () => this.setOpen(false));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.root.classList.contains("is-open")) this.setOpen(false);
    });

    this.list.addEventListener("click", (e) => {
      const item = e.target.closest("[data-id]");
      if (!item) return;
      if (e.target.closest("[data-action='delete']")) this.onDelete(item.dataset.id);
      else {
        this.onSelect(item.dataset.id);
        this.setOpen(false);
      }
    });
  }

  setOpen(open) {
    this.root.classList.toggle("is-open", open);
    this.overlay.hidden = !open;
    this.toggleBtn.setAttribute("aria-expanded", String(open));
  }

  render(conversations, activeId) {
    if (!conversations.length) {
      this.list.innerHTML = '<li class="history__empty">Your conversations will appear here.</li>';
      return;
    }
    this.list.innerHTML = "";
    for (const convo of conversations) {
      const li = document.createElement("li");
      li.className = "history__item" + (convo.id === activeId ? " is-active" : "");
      li.dataset.id = convo.id;

      const open = document.createElement("button");
      open.type = "button";
      open.className = "history__open";
      if (convo.id === activeId) open.setAttribute("aria-current", "true");
      open.innerHTML = `${icon("chat")}<span class="history__title"></span><span class="history__date"></span>`;
      open.querySelector(".history__title").textContent = convo.title;
      open.querySelector(".history__date").textContent = dateFormat.format(new Date(convo.updatedAt));

      const del = document.createElement("button");
      del.type = "button";
      del.className = "history__delete";
      del.dataset.action = "delete";
      del.setAttribute("aria-label", `Delete conversation: ${convo.title}`);
      del.innerHTML = icon("trash");

      li.append(open, del);
      this.list.append(li);
    }
  }
}
