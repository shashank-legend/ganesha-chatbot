// Run with: node --test tests/js
import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml, renderMarkdown } from "../../ganesha/static/js/markdown.js";

test("escapes raw HTML so model output cannot inject markup", () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)"> <script>alert(1)</script>');
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("formats bold, italic and inline code", () => {
  const html = renderMarkdown("**big ears**, *small mouth* and `modak()`");
  assert.equal(html, "<p><strong>big ears</strong>, <em>small mouth</em> and <code>modak()</code></p>");
});

test("does not format inside inline code", () => {
  assert.equal(renderMarkdown("`**x**`"), "<p><code>**x**</code></p>");
});

test("renders fenced code blocks with escaped content and copy button", () => {
  const html = renderMarkdown("Look:\n```python\nprint('<hi>')\n```\nDone");
  assert.match(html, /<span>python<\/span>/);
  assert.match(html, /data-copy-code/);
  assert.match(html, /print\(&#39;&lt;hi&gt;&#39;\)/);
  assert.match(html, /<p>Done<\/p>$/);
});

test("handles an unterminated code fence while streaming", () => {
  const html = renderMarkdown("```js\nconst a = 1;");
  assert.match(html, /<pre><code>const a = 1;<\/code><\/pre>/);
});

test("renders lists, headings, quotes and rules", () => {
  const html = renderMarkdown("# Title\n- one\n- two\n\n1. first\n2. second\n\n> wise words\n\n---");
  assert.match(html, /<h3>Title<\/h3>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(html, /<blockquote>wise words<\/blockquote>/);
  assert.match(html, /<hr>/);
});

test("allows only safe link protocols", () => {
  const safe = renderMarkdown("[Docs](https://example.com/a?b=1&c=2)");
  assert.match(safe, /<a href="https:\/\/example.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">Docs<\/a>/);
  const unsafe = renderMarkdown("[click](javascript:alert(1))");
  assert.ok(!unsafe.includes("<a"));
  assert.ok(!unsafe.includes('href="javascript'));
});

test("keeps single line breaks inside a paragraph", () => {
  assert.equal(renderMarkdown("line one\nline two"), "<p>line one<br>line two</p>");
});

test("escapeHtml escapes quotes", () => {
  assert.equal(escapeHtml(`"'&`), "&quot;&#39;&amp;");
});
