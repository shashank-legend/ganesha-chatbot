// HTTP client for the Flask API. Handles NDJSON streaming, timeouts and
// translating failures into friendly, typed errors.

const FRIENDLY_MESSAGES = {
  rate_limited: "Ganesha is receiving many prayers right now. Please wait a moment and try again.",
  not_configured: "The AI provider is not configured yet. Add an API key to the server's .env file.",
  auth: "The server's AI API key was rejected. Please check the configuration.",
  timeout: "The reply took too long. Please try again.",
  network: "Could not reach the AI service. Check your connection and try again.",
  offline: "You appear to be offline. Reconnect and try again.",
};

export class ChatError extends Error {
  constructor(code, message, retryAfter) {
    super(FRIENDLY_MESSAGES[code] || message || "Something went wrong.");
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export async function fetchConfig() {
  const res = await fetch("/api/config");
  if (!res.ok) throw new ChatError("config", "Could not load app configuration.");
  return res.json();
}

/**
 * Send the conversation and stream the reply.
 * @param {{messages: {role: string, content: string}[], language: string}} body
 * @param {{signal: AbortSignal, onDelta: (text: string) => void}} handlers
 */
export async function streamChat(body, { signal, onDelta }) {
  if (!navigator.onLine) throw new ChatError("offline");

  let res;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ChatError("network", "Could not reach the server.");
  }

  if (!res.ok) {
    let payload = {};
    try {
      payload = (await res.json()).error || {};
    } catch {
      /* non-JSON error body */
    }
    throw new ChatError(payload.code || `http_${res.status}`, payload.message, payload.retryAfter);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const handleLine = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "delta") onDelta(event.text);
    else if (event.type === "done") finished = true;
    else if (event.type === "error") throw new ChatError(event.code, event.message);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    lines.forEach(handleLine);
  }
  handleLine(buffer);

  if (!finished) throw new ChatError("network", "The reply was cut off. Please try again.");
}
