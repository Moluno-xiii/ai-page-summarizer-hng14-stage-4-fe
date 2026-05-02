# AI Page Summarizer HNG 14 Stage 4a Frontend task

A Chrome extension (Manifest V3) that extracts the main article from any webpage, summarizes it with **Google Gemini**, and highlights the key sentences in-page.

The extension talks to a hosted proxy server to avoid leaking sensitive data

## Features

- Bullet-point summary of the article (4–6 bullets, or 3 in Brief mode)
- Key insights, non-obvious takeaways, separate from the bullets
- Estimated reading time and word count of the generated summary
- In-page highlighting of the most important sentences via yellow marks
- Brief mode toggle for tighter summaries (3 bullets, 1 insight)
- Copy-to-clipboard button for the formatted summary
- Light / dark theme toggle, persisted across sessions
- Per-URL + per-brevity cache — already-summarized pages return instantly with no API call
- Heuristic article extraction: tries semantic selectors (`<article>`, `<main>`, `[role="main"]`, common content classes), falling back to a stripped `<body>` with nav, header, footer, aside, scripts, and iframes removed

## Installation

This extension is not published to the Chrome Web Store. To install it from source:

1. Clone the repository:
   ```bash
   git clone https://github.com/Moluno-xiii/ai-page-summarizer-hng14-stage-4-fe.git
   cd ai-page-summarizer-hng14-stage-4-fe
   ```
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the cloned folder (the one containing `manifest.json`).
5. The "AI Page Summarizer" icon appears in the toolbar, pin it from the chrome extensions icon for easy access.

After editing source files, click the reload icon on the extension's card at `chrome://extensions`.

## Usage

1. Open any article-like webpage.
2. Click the extension icon.
3. Click **Summarize Page**.
4. Within a few seconds the popup shows the bullet summary, key insights, reading time, and word count, and the article page is annotated with yellow highlights on the key sentences.
5. Toggle **Brief summary (3 bullets)** before clicking Summarize for a tighter version (cached separately from the standard one).
6. Click the copy icon to copy the summary as plain text.
7. Click **Clear** to reset back to the idle state (without summarized text).

## How it works

When you click Summarize:

1. The popup sends the active tab's ID to the background service worker.
2. The background script injects the content script into the page via `chrome.scripting.executeScript`.
3. The content script extracts the article by first trying semantic selectors, then falling back to a cleaned-up `<body>`.
4. The background script POSTs the extracted text + brevity (where necessary ) to the hosted proxy.
5. The proxy calls Gemini (`gemini-2.5-flash`) with a structured-output schema and returns parsed JSON: `{ bullets, insights, readingTimeMinutes, keySentences }`.
6. The background caches the result in `chrome.storage.local` keyed by `URL + brevity`.
7. The content script wraps each `keySentence` in `<mark class="ai-summarizer-hl">` for in-page highlighting.
8. The popup renders the summary.

Subsequent clicks on the same URL + brevity will hit the cache, to save resources.

## Proxy server

The Gemini API key lives on a small NestJS proxy, not in the extension. Source and deployment instructions:

**[github.com/Moluno-xiii/ai-page-summarizer-api-proxy](https://github.com/Moluno-xiii/ai-page-summarizer-api-proxy)**

## Permissions

- `storage` — per-URL summary cache and theme / brevity preference
- `activeTab` — read the current tab's URL/title and inject the extractor (only after the user clicks the extension)
- `scripting` — inject the content script on demand
- `host_permissions` — makes sure i can `fetch` to the proxy server only

## Trade-offs

**Heuristic extraction over Mozilla Readability.**
The content script uses a small heuristic (semantic selectors + fallback to a stripped `<body>`) instead of Mozilla's Readability.js (~1500 lines). Readability is more accurate on messier layouts, but the heuristic is ~30 lines and Gemini handles messy input well, so the cost/benefit didn't justify the dependency. If extraction quality becomes an issue on a specific class of sites, i'll swap in favour of Readability.

**Hosted proxy over user-supplied API key.**
The Gemini key lives on a hosted NestJS proxy. This means zero setup for users but server may have cold boots. The alternative (each user pastes their own key into an Options page) is more secure but adds another unnecessary local setup step.

**Brevity included in the cache key.**
Standard and brief summaries for the same URL are cached as separate entries (`summary:standard:URL` and `summary:brief:URL`). This means up to two Gemini calls per page, but the user can toggle between brevities without losing either result.

## Notes

- All in-page DOM mutations use `textContent` and `Range.surroundContents()` — no `innerHTML`, so highlight injection is XSS-safe.
- Pages on `chrome://`, `chrome-extension://`, and the Chrome Web Store cannot be scripted by extensions; the popup shows a friendly error on those URLs.
- If a page has fewer than 200 characters of extractable content, the extension reports "Couldn't find enough readable article text on this page" rather than calling the API.
