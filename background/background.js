const CACHE_PREFIX = "summary:";
const MAX_CONTENT_LENGTH = 50_000;
const MIN_CONTENT_LENGTH = 200;
const API_URL =
  "https://ai-page-summarizer-api-proxy-production.up.railway.app/summarize";

const countWords = (text) => {
  if (typeof text !== "string") return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
};

const normalizeBrevity = (value) => (value === "brief" ? "brief" : "standard");

const cacheKey = (url, brevity) => `${CACHE_PREFIX}${brevity}:${url}`;

const getCachedSummary = async (url, brevity) => {
  const key = cacheKey(url, brevity);
  const data = await chrome.storage.local.get(key);
  return data[key] || null;
};

const setCachedSummary = async (url, brevity, summary) => {
  await chrome.storage.local.set({ [cacheKey(url, brevity)]: summary });
};

const isScriptableUrl = (url) => {
  if (typeof url !== "string") return false;
  if (!/^https?:\/\//.test(url)) return false;
  if (url.startsWith("https://chrome.google.com/webstore")) return false;
  if (url.startsWith("https://chromewebstore.google.com/")) return false;
  return true;
};

const querySummarizer = async (content, brevity) => {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content, brevity }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(
      `Failed to summarize ${res.status}: ${body.slice(0, 200)}`,
    );
    err.code = res.status;
    throw err;
  }

  const data = await res.json();
  if (!data.success) throw new Error(data.message);
  return data.data;
};

const injectContentScript = async (tabId) => {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/content.js"],
  });
};

const sendToTab = (tabId, message) =>
  new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });

const applyHighlights = async (tabId, sentences) => {
  if (!Array.isArray(sentences) || sentences.length === 0) return;
  try {
    await sendToTab(tabId, { type: "HIGHLIGHT", sentences });
  } catch {}
};

const summarizeTab = async (tabId, brevity) => {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return { ok: false, code: "NO_TAB", error: "Tab not found." };
  }

  if (!isScriptableUrl(tab.url)) {
    return {
      ok: false,
      code: "UNSUPPORTED_PAGE",
      error:
        "This page can't be summarized. Browser internal pages and the Chrome Web Store aren't accessible to extensions.",
    };
  }

  try {
    await injectContentScript(tabId);
  } catch (e) {
    return {
      ok: false,
      code: "INJECT_FAILED",
      error: `Couldn't inject extractor: ${e.message}`,
    };
  }

  const cached = await getCachedSummary(tab.url, brevity);
  if (cached) {
    await applyHighlights(tabId, cached.keySentences);
    return { ok: true, summary: cached, cached: true };
  }

  let extracted;
  try {
    extracted = await sendToTab(tabId, { type: "EXTRACT" });
  } catch (e) {
    return {
      ok: false,
      code: "EXTRACT_FAILED",
      error: `Couldn't reach the page extractor: ${e.message}`,
    };
  }

  if (!extracted?.ok) {
    return {
      ok: false,
      code: "EXTRACT_FAILED",
      error: extracted?.error || "Page extraction failed.",
    };
  }

  const content = (extracted.content || "").trim();
  if (content.length < MIN_CONTENT_LENGTH) {
    return {
      ok: false,
      code: "NO_CONTENT",
      error: "Couldn't find enough readable article text on this page.",
    };
  }

  const trimmed =
    content.length > MAX_CONTENT_LENGTH
      ? content.slice(0, MAX_CONTENT_LENGTH)
      : content;

  let summary;
  try {
    summary = await querySummarizer(trimmed, brevity);
  } catch (e) {
    return {
      ok: false,
      code: e.code || "API_ERROR",
      error: e.message || "Unknown error",
    };
  }

  const summaryText = [...summary.bullets, ...summary.insights].join(" ");
  summary.wordCount = countWords(summaryText);
  summary.readingTimeMinutes = Math.max(1, Math.round(summary.wordCount / 180));

  await setCachedSummary(tab.url, brevity, summary);
  await applyHighlights(tabId, summary.keySentences);

  return { ok: true, summary, cached: false };
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (
    msg?.type === "SUMMARIZE_TAB" &&
    Number.isInteger(msg.tabId) &&
    msg.tabId >= 0
  ) {
    summarizeTab(msg.tabId, normalizeBrevity(msg.brevity)).then(sendResponse);
    return true;
  }

  sendResponse({
    ok: false,
    code: "BAD_REQUEST",
    error: "Unknown or invalid message.",
  });
  return false;
});
