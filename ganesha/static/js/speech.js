// Voice features using the browser's built-in Web Speech API.
// This keeps the "speak to Ganesha" spirit of the original voice booth without
// shipping heavy server-side speech models or extra paid API keys.

const SPEECH_LANG = { en: "en-IN", hi: "hi-IN", mr: "mr-IN", ta: "ta-IN" };

export function speechLang(code) {
  return SPEECH_LANG[code] || navigator.language || "en-IN";
}

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const dictationSupported = Boolean(Recognition);
export const readAloudSupported = "speechSynthesis" in window;

/** Start dictation; returns a stop function. */
export function startDictation({ lang, onText, onEnd, onError }) {
  const rec = new Recognition();
  rec.lang = speechLang(lang);
  rec.interimResults = true;
  rec.continuous = false;

  rec.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((r) => r[0].transcript)
      .join("");
    onText(transcript, event.results[event.results.length - 1].isFinal);
  };
  rec.onerror = (event) => onError?.(event.error);
  rec.onend = () => onEnd?.();
  rec.start();
  return () => rec.stop();
}

function plainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " (code omitted) ")
    .replace(/[*_`#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

let activeUtterance = null;

/** Read text aloud; calling again on the same text stops it. Returns true if now speaking. */
export function toggleReadAloud(text, lang, onEnd) {
  const synth = window.speechSynthesis;
  if (synth.speaking) {
    synth.cancel();
    const wasSame = activeUtterance?.sourceText === text;
    activeUtterance = null;
    if (wasSame) return false;
  }
  const utterance = new SpeechSynthesisUtterance(plainText(text));
  utterance.sourceText = text;
  utterance.lang = speechLang(lang);
  utterance.rate = 0.95;
  const voice = synth.getVoices().find((v) => v.lang === utterance.lang);
  if (voice) utterance.voice = voice;
  utterance.onend = utterance.onerror = () => {
    if (activeUtterance === utterance) activeUtterance = null;
    onEnd?.();
  };
  activeUtterance = utterance;
  synth.speak(utterance);
  return true;
}

export function stopReadAloud() {
  if (readAloudSupported) window.speechSynthesis.cancel();
  activeUtterance = null;
}
