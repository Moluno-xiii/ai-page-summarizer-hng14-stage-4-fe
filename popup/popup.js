"use strict";

const dummyPageSummary = {
  readingTimeMinutes: 5,
  bullets: [
    "Modern browsers parse HTML into a DOM tree while concurrently fetching linked stylesheets and scripts.",
    "The CSSOM and DOM are combined into a render tree, which the browser uses to compute layout.",
    "Painting is split into layers; the compositor thread reassembles them on the GPU for smooth scrolling.",
    "JavaScript can block parsing unless marked async or defer, so script placement materially affects load time.",
  ],
  insights: [
    "Reducing render-blocking resources is usually the highest-leverage performance win.",
    "Layout thrashing happens when reads and writes to the DOM are interleaved within the same frame.",
    "Using will-change sparingly hints to the compositor without bloating GPU memory.",
  ],
};

const dummyPageTitle = "Sample article: How modern browsers render the web";

const STATES = ["idle", "loading", "success", "error"];

const elements = {
  pageTitle: document.getElementById("pageTitle"),
  summarizeBtn: document.getElementById("summarizeBtn"),
  resetBtn: document.getElementById("resetBtn"),
  output: document.getElementById("output"),
  errorToggle: document.getElementById("errorToggle"),
  errorMsg: document.getElementById("errorMsg"),
  bullets: document.getElementById("bullets"),
  insights: document.getElementById("insights"),
  readingTime: document.getElementById("readingTime"),
};
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
const fakeSummarize = ({ shouldFail }) => {
  return new Promise((resolve, reject) => {
    const delay = 900;
    setTimeout(() => {
      if (shouldFail) {
        reject(new Error("An error occured, try again."));
      } else {
        resolve(dummyPageSummary);
      }
    }, delay);
  });
};

const handleSummarize = async () => {
  setState("loading");
  try {
    const summary = await fakeSummarize({
      shouldFail: elements.errorToggle.checked,
    });
    renderSummary(summary);
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
const init = () => {
  elements.pageTitle.textContent = dummyPageTitle;
  setState("idle");
  elements.summarizeBtn.addEventListener("click", handleSummarize);
  elements.resetBtn.addEventListener("click", handleReset);
};

document.addEventListener("DOMContentLoaded", init);
