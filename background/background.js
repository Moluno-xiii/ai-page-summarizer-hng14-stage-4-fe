const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const CACHE_PREFIX = "summary:";
const MAX_CONTENT_LENGTH = 50_000;

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    bullets: { type: "array", items: { type: "string" } },
    insights: { type: "array", items: { type: "string" } },
    readingTimeMinutes: { type: "integer" },
    keySentences: { type: "array", items: { type: "string" } },
  },
  required: ["bullets", "insights", "readingTimeMinutes", "keySentences"],
};

const PROMPT = `You are a concise article summarizer. Given the article below, produce:
- bullets: 4-6 short bullet points capturing the key arguments
- insights: 2-4 non-obvious takeaways or implications
- readingTimeMinutes: estimated reading time at 150 words/minute, rounded to the nearest minute
- keySentences: 4-6 verbatim sentences from the article that capture the most important points (copy exactly, these will be highlighted in-page)

Respond as JSON only.

Article:
`;

const getApiKey = async () => {
  const { geminiApiKey } = await chrome.storage.local.get("geminiApiKey");
  return typeof geminiApiKey === "string" && geminiApiKey.trim()
    ? geminiApiKey.trim()
    : null;
};

const cacheKey = (url) => `${CACHE_PREFIX}${url}`;

const getCachedSummary = async (url) => {
  const key = cacheKey(url);
  const data = await chrome.storage.local.get(key);
  return data[key] || null;
};

const setCachedSummary = async (url, summary) => {
  await chrome.storage.local.set({ [cacheKey(url)]: summary });
};

const callGemini = async (apiKey, content) => {
  const res = await fetch(
    `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT + content }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SUMMARY_SCHEMA,
          temperature: 0.4,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Gemini API ${res.status}: ${body.slice(0, 200)}`);
    err.code = res.status === 429 ? "RATE_LIMIT" : "API_ERROR";
    throw err;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const err = new Error("Empty response from Gemini");
    err.code = "PARSE_ERROR";
    throw err;
  }

  try {
    return JSON.parse(text);
  } catch {
    const err = new Error("Gemini returned invalid JSON");
    err.code = "PARSE_ERROR";
    throw err;
  }
};

const validateMessage = (msg) => {
  if (!msg || typeof msg !== "object") return "Invalid message";
  if (msg.type !== "SUMMARIZE") return "Unknown message type";
  if (typeof msg.url !== "string" || !msg.url) return "Missing url";
  if (typeof msg.content !== "string" || !msg.content.trim())
    return "Missing content";
  if (msg.content.length > MAX_CONTENT_LENGTH)
    return `Content too long (>${MAX_CONTENT_LENGTH} chars)`;
  return null;
};

const handleSummarize = async ({ url, content }) => {
  const cached = await getCachedSummary(url);
  if (cached) {
    return { ok: true, summary: cached, cached: true };
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      code: "NO_KEY",
      error:
        "Gemini API key not set. Open the service worker DevTools and run: chrome.storage.local.set({geminiApiKey: 'YOUR_KEY'})",
    };
  }

  try {
    const summary = await callGemini(apiKey, content);
    await setCachedSummary(url, summary);
    return { ok: true, summary, cached: false };
  } catch (e) {
    return {
      ok: false,
      code: e.code || "API_ERROR",
      error: e.message || "Unknown error",
    };
  }
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const validationError = validateMessage(msg);
  if (validationError) {
    sendResponse({ ok: false, code: "BAD_REQUEST", error: validationError });
    return false;
  }

  handleSummarize(msg).then(sendResponse);
  return true;
});
