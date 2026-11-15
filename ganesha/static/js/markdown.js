// Minimal, dependency-free Markdown renderer for chat replies.
//
// Security model: every piece of text is HTML-escaped *before* any Markdown
// formatting is applied, and links are restricted to http(s)/mailto. The
// output can therefore be assigned to innerHTML without allowing script
// injection from model output.
//
// Supported: fenced code blocks, inline code, headings (#-###), bold, italic,
// links, unordered/ordered lists, blockquotes, horizontal rules, paragraphs.

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function safeUrl(url) {
  const trimmed = url.trim();
  return /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : null;
}

function renderInline(text) {
  // Pull out inline code first so its contents are not formatted.
  const codeSpans = [];
  let out = text.replace(/`([^`\n]+)`/g, (_, code) => {
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });

  out = escapeHtml(out);

  // Links: [label](url) — the URL was escaped above, so unescape &amp; for the check only.
  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label, rawUrl) => {
    const url = safeUrl(rawUrl.replace(/&amp;/g, "&"));
    if (!url) return label;
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  out = out
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => codeSpans[Number(i)]);
}

function renderCodeBlock(lang, code) {
  const label = lang ? escapeHtml(lang) : "code";
  return (
    `<div class="code-block"><div class="code-block__bar"><span>${label}</span>` +
    `<button type="button" class="code-block__copy" data-copy-code>Copy</button></div>` +
    `<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre></div>`
  );
}

function renderBlocks(text) {
  const lines = text.split("\n");
  const html = [];
  let paragraph = [];
  let list = null; // { type: "ul" | "ol", items: [] }
  let quote = [];

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.type}>${list.items.map((i) => `<li>${renderInline(i)}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) html.push(`<blockquote>${quote.map(renderInline).join("<br>")}</blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const quoted = line.match(/^>\s?(.*)$/);

    if (!line.trim()) {
      flushAll();
    } else if (/^\s*(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line)) {
      flushAll();
      html.push("<hr>");
    } else if (heading) {
      flushAll();
      const level = Math.min(heading[1].length + 2, 6); // keep headings small inside bubbles
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
    } else if (bullet || ordered) {
      flushParagraph();
      flushQuote();
      const type = bullet ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((bullet || ordered)[1]);
    } else if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1]);
    } else if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += " " + line.trim(); // continuation of a list item
    } else {
      flushList();
      flushQuote();
      paragraph.push(line);
    }
  }
  flushAll();
  return html.join("");
}

export function renderMarkdown(source) {
  const text = String(source ?? "").replace(/\r\n?/g, "\n");
  const parts = [];
  const fence = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let match;
  while ((match = fence.exec(text)) !== null) {
    parts.push(renderBlocks(text.slice(last, match.index)));
    parts.push(renderCodeBlock(match[1], match[2]));
    last = fence.lastIndex;
  }
  parts.push(renderBlocks(text.slice(last)));
  return parts.join("");
}
