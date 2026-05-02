"use strict";

const SAMPLE_ARTICLE = `How modern browsers render the web

When you open a web page, the browser performs a remarkable sequence of steps to turn raw bytes into the interface you see and interact with. Understanding this pipeline helps explain why some pages feel snappy while others stutter, and gives developers leverage for performance optimization.

The first step is parsing. As HTML bytes arrive over the network, the browser tokenizes them and assembles a Document Object Model — a tree of nodes representing every element on the page. The parser is greedy: it builds the DOM incrementally, even before the entire document has finished downloading. This is why content can appear progressively rather than all at once.

In parallel, the browser fetches and parses CSS files referenced from the HTML. Each stylesheet is converted into the CSS Object Model, or CSSOM. Unlike the DOM, the CSSOM blocks rendering by default — the browser cannot draw a single pixel until it knows what styles to apply. This is the reason CSS is called "render-blocking" and why minimizing critical CSS is such a common optimization.

JavaScript adds another wrinkle. When the parser encounters a synchronous <script> tag, it pauses HTML parsing entirely until the script downloads and executes. This is why placing scripts in the document head without async or defer can devastate page load times. The async attribute lets a script execute as soon as it arrives; defer waits until after parsing completes. Both attributes preserve interactivity but suit different use cases.

Once the DOM and CSSOM are ready, the browser combines them into a render tree, which represents only the visible elements with their computed styles. Display: none nodes are excluded, while pseudo-elements are inserted. The browser then performs layout, calculating the precise position and size of every box. Layout is expensive — touching certain CSS properties triggers a reflow that cascades through the entire tree.

Painting comes next. The browser walks the render tree and produces a series of draw calls, organized into layers. Layers are independent surfaces that can be moved, scaled, or composited without retouching their contents. Properties like transform and opacity are cheap precisely because they only affect compositing, not layout or paint.

Finally, the compositor thread reassembles the layers on the GPU. This thread runs independently of the main thread, which is why scrolling and CSS animations can remain smooth even when JavaScript is busy. Skilled developers exploit this by promoting frequently-animated elements to their own layer with will-change, though over-using this hint can balloon GPU memory consumption.

Performance, then, is largely a story of avoiding work in the wrong place at the wrong time. Reduce render-blocking resources, batch DOM reads and writes to avoid layout thrashing, and lean on the compositor where you can. The pipeline rewards developers who understand it.`;

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
  elements.readingTime.textContent = `${summary.readingTimeMinutes} min read`;

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

const renderError = (message) => {
  elements.errorMsg.textContent = message;
};

const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab || null;
};

const requestSummary = ({ url, content }) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "SUMMARIZE", url, content }, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!res) {
        reject(new Error("No response from background worker"));
        return;
      }
      resolve(res);
    });
  });

const handleSummarize = async () => {
  setState("loading");

  if (!activeTab || !activeTab.url) {
    renderError("Could not read the active tab.");
    setState("error");
    return;
  }

  try {
    const res = await requestSummary({
      url: activeTab.url,
      content: SAMPLE_ARTICLE,
    });

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
  elements.bullets.replaceChildren();
  elements.insights.replaceChildren();
  renderError("We couldn't generate a summary. Please try again.");
  setState("idle");
  elements.summarizeBtn.focus();
};

const init = async () => {
  setState("idle");
  elements.summarizeBtn.addEventListener("click", handleSummarize);
  elements.resetBtn.addEventListener("click", handleReset);

  activeTab = await getActiveTab();
  elements.pageTitle.textContent =
    activeTab?.title || "(Could not read page title)";
};

document.addEventListener("DOMContentLoaded", init);
