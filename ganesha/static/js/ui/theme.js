// Light / dark theme toggle. Defaults to the OS preference.
const KEY = "ganesha-guide:theme";

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function initTheme(button) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const current = () => read() || (media.matches ? "dark" : "light");

  const apply = () => {
    const theme = current();
    document.documentElement.dataset.theme = theme;
    button.setAttribute("aria-pressed", String(theme === "dark"));
    button.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  };

  button.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    apply();
  });
  media.addEventListener("change", apply);
  apply();
}
