(() => {
  if (window.__aiSummarizerInjected) return;
  window.__aiSummarizerInjected = true;

  const HIGHLIGHT_CLASS = "ai-summarizer-hl";
  const HIGHLIGHT_STYLE_ID = "ai-summarizer-hl-style";
  const MIN_SENTENCE_LENGTH = 10;
  const MIN_ARTICLE_LENGTH = 500;

  const SEMANTIC_SELECTORS = [
    "article",
    '[role="main"]',
    "main",
    ".article-body",
    ".post-content",
    ".entry-content",
    "#content article",
  ];

  const extractArticle = () => {
    for (const sel of SEMANTIC_SELECTORS) {
      const el = document.querySelector(sel);
      const text = el?.innerText?.trim();
      if (text && text.length > MIN_ARTICLE_LENGTH) {
        return { title: document.title, content: text };
      }
    }

    const clone = document.body.cloneNode(true);
    for (const tag of [
      "nav",
      "header",
      "footer",
      "aside",
      "script",
      "style",
      "noscript",
      "iframe",
    ]) {
      clone.querySelectorAll(tag).forEach((el) => el.remove());
    }
    return { title: document.title, content: clone.innerText.trim() };
  };

  const ensureHighlightStyle = () => {
    if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HIGHLIGHT_STYLE_ID;
    style.textContent = `mark.${HIGHLIGHT_CLASS} {
      background: rgba(255, 220, 0, 0.45);
      color: inherit;
      padding: 0 2px;
      border-radius: 2px;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }`;
    document.head.appendChild(style);
  };

  const removeExistingHighlights = () => {
    const marks = document.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`);
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    }
  };

  const collectTextNodeMatches = (sentence) => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest(`mark.${HIGHLIGHT_CLASS}`)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    const matches = [];
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.nodeValue.indexOf(sentence);
      if (idx !== -1) matches.push({ node, idx });
    }
    return matches;
  };

  const highlightSentence = (sentence) => {
    if (typeof sentence !== "string" || sentence.length < MIN_SENTENCE_LENGTH) {
      return 0;
    }
    const matches = collectTextNodeMatches(sentence);
    let count = 0;
    for (const { node, idx } of matches) {
      if (!node.parentNode) continue;
      const range = document.createRange();
      try {
        range.setStart(node, idx);
        range.setEnd(node, idx + sentence.length);
        const mark = document.createElement("mark");
        mark.className = HIGHLIGHT_CLASS;
        range.surroundContents(mark);
        count++;
      } catch {}
    }
    return count;
  };

  const highlight = (sentences) => {
    if (!Array.isArray(sentences)) return 0;
    ensureHighlightStyle();
    removeExistingHighlights();
    let total = 0;
    for (const s of sentences) total += highlightSentence(s);
    return total;
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== "object") return false;
    if (msg.type === "EXTRACT") {
      try {
        sendResponse({ ok: true, ...extractArticle() });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
      return false;
    }
    if (msg.type === "HIGHLIGHT") {
      try {
        const count = highlight(msg.sentences);
        sendResponse({ ok: true, count });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
      return false;
    }
    return false;
  });
})();
