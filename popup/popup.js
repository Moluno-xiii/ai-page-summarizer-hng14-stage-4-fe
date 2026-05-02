const THEME_KEY = "theme";
const BREVITY_KEY = "brevity";
const COPY_FEEDBACK_MS = 1500;

const storedTheme = localStorage.getItem(THEME_KEY);
if (storedTheme === "light" || storedTheme === "dark") {
  document.documentElement.setAttribute("data-theme", storedTheme);
}

const STATES = ["idle", "loading", "success", "error"];

const elements = {
  pageTitle: document.getElementById("pageTitle"),
  summarizeBtn: document.getElementById("summarizeBtn"),
  resetBtn: document.getElementById("resetBtn"),
  output: document.getElementById("output"),
  errorMsg: document.getElementById("errorMsg"),
  bullets: document.getElementById("bullets"),
  insights: document.getElementById("insights"),
  readingTime: document.getElementById("readingTime"),
  wordCount: document.getElementById("wordCount"),
  themeToggle: document.getElementById("themeToggle"),
  briefMode: document.getElementById("briefMode"),
  copyBtn: document.getElementById("copyBtn"),
};

let lastSummary = null;
let copyResetTimer = null;

const getCurrentTheme = () => {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const updateThemeToggleAria = (theme) => {
  elements.themeToggle.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
  );
};

const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  updateThemeToggleAria(theme);
};

const handleThemeToggle = () => {
  const next = getCurrentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
};

let activeTab = null;

const setState = (name) => {
  for (const s of STATES) {
    const el = document.getElementById(`state-${s}`);
    if (el) el.hidden = s !== name;
  }
  elements.output.setAttribute("aria-busy", String(name === "loading"));
  elements.summarizeBtn.disabled = name === "loading";
  elements.resetBtn.disabled = name === "idle" || name === "loading";
};

const renderSummary = (summary) => {
  lastSummary = summary;

  elements.readingTime.textContent = `${summary.readingTimeMinutes} min read`;
  elements.readingTime.hidden = false;

  if (Number.isFinite(summary.wordCount) && summary.wordCount > 0) {
    elements.wordCount.textContent = `${summary.wordCount.toLocaleString()} words`;
    elements.wordCount.hidden = false;
  } else {
    elements.wordCount.hidden = true;
  }

  elements.bullets.replaceChildren(
    ...summary.bullets.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );

  elements.insights.replaceChildren(
    ...summary.insights.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );
};

const formatSummaryForCopy = (summary) => {
  const lines = ["Summary:"];
  for (const b of summary.bullets) lines.push(`• ${b}`);
  if (Array.isArray(summary.insights) && summary.insights.length > 0) {
    lines.push("", "Key insights:");
    for (const i of summary.insights) lines.push(`• ${i}`);
  }
  return lines.join("\n");
};

const handleCopy = async () => {
  if (!lastSummary) return;
  try {
    await navigator.clipboard.writeText(formatSummaryForCopy(lastSummary));
    elements.copyBtn.classList.add("copy-btn--copied");
    elements.copyBtn.setAttribute("aria-label", "Copied");
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      elements.copyBtn.classList.remove("copy-btn--copied");
      elements.copyBtn.setAttribute("aria-label", "Copy summary");
    }, COPY_FEEDBACK_MS);
  } catch {
    console.error("clipboard copy failed");
  }
};

const renderError = (message) => {
  elements.errorMsg.textContent = message;
};

const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab;
};

const requestSummary = (tabId, brevity) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "SUMMARIZE_TAB", tabId, brevity },
      (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!res) {
          reject(new Error("No response from background worker"));
          return;
        }
        resolve(res);
      },
    );
  });

const getBrevity = () => (elements.briefMode.checked ? "brief" : "standard");

const handleBrevityChange = () => {
  localStorage.setItem(BREVITY_KEY, getBrevity());
};

const handleSummarize = async () => {
  setState("loading");

  if (!activeTab || !Number.isInteger(activeTab.id)) {
    renderError("Could not read the active tab.");
    setState("error");
    return;
  }

  try {
    const res = await requestSummary(activeTab.id, getBrevity());

    if (!res.ok) {
      renderError(res.error || "Request failed.");
      setState("error");
      return;
    }

    renderSummary(res.summary);
    setState("success");
  } catch (err) {
    renderError(err.message || "Unknown error");
    setState("error");
  }
};

const handleReset = () => {
  lastSummary = null;
  elements.bullets.replaceChildren();
  elements.insights.replaceChildren();
  elements.readingTime.hidden = true;
  elements.wordCount.hidden = true;
  renderError("We couldn't generate a summary. Please try again.");
  setState("idle");
  elements.summarizeBtn.focus();
};

const restoreBrevity = () => {
  const stored = localStorage.getItem(BREVITY_KEY);
  if (stored === "brief") elements.briefMode.checked = true;
};

const init = async () => {
  setState("idle");
  restoreBrevity();
  updateThemeToggleAria(getCurrentTheme());
  elements.themeToggle.addEventListener("click", handleThemeToggle);
  elements.summarizeBtn.addEventListener("click", handleSummarize);
  elements.resetBtn.addEventListener("click", handleReset);
  elements.briefMode.addEventListener("change", handleBrevityChange);
  elements.copyBtn.addEventListener("click", handleCopy);

  activeTab = await getActiveTab();
  elements.pageTitle.textContent =
    activeTab?.title || "(Could not read page title)";
};

document.addEventListener("DOMContentLoaded", init);
