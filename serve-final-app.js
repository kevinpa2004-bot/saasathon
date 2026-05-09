const http = require("http");
const fs = require("fs");

const filePath = process.argv[2];
const port = Number(process.argv[3] || 8765);

if (!filePath) {
  console.error("Usage: node serve-final-app.js <path-to-html-file> [port]");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.url === "/api/report-assist" && req.method === "POST") {
    readJsonBody(req, async (err, body) => {
      if (err) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Invalid request body" }));
        return;
      }

      try {
        const payload = await generateReportSuggestions(body || {});
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(payload));
      } catch (apiErr) {
        res.writeHead(500, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify({
          error: apiErr.message || "Could not generate report suggestions",
        }));
      }
    });
    return;
  }

  if (req.url !== "/" && req.url !== "/index.html") {
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }

  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Could not read app file: ${err.message}`);
      return;
    }

    html = applyProductivityReportMode(html);
    html = applyAssistScribeBrand(html);
    html = injectLoginAndDrive(html);
    html = injectLoginKeyboard(html);
    html = injectReportAssistant(html);
    html = injectLibraryShortcuts(html);
    html = injectNeuralTrainer(html);
    html = injectAdaptivePredictions(html);
    html = injectNumberKeyboardRow(html);
    html = injectPolishedTheme(html);

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(html);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Final App is running at http://127.0.0.1:${port}/`);
});

function readJsonBody(req, cb) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 80_000) {
      req.destroy();
    }
  });
  req.on("end", () => {
    try {
      cb(null, raw ? JSON.parse(raw) : {});
    } catch (err) {
      cb(err);
    }
  });
  req.on("error", cb);
}

async function generateReportSuggestions(body) {
  const section = cleanText(body.section || "Report section");
  const reportTitle = cleanText(body.title || "Report");
  const rawIdeas = cleanText(body.ideas || body.text || "");
  const ideas = extractIdeas(rawIdeas);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set on the local server.");
  }

  if (!ideas.length) {
    throw new Error("Add bullet points before asking for report suggestions.");
  }

  const result = await callOpenAIForReportSuggestions({
    apiKey,
    model: process.env.OPENAI_MODEL || "gpt-5.2",
    reportTitle,
    section,
    ideas,
  });

  return {
    suggestions: normalizeSuggestions(result),
  };
}

async function callOpenAIForReportSuggestions({ apiKey, model, reportTitle, section, ideas }) {
  const prompt = {
    task: "Turn the user's bullet points into three different report-ready paragraph options.",
    reportTitle,
    currentSection: section,
    userBulletPoints: ideas,
    requiredOutput: [
      "Return only valid JSON.",
      "Use exactly this shape: {\"suggestions\":[{\"id\":\"formal\",\"label\":\"Formal Paragraph\",\"angle\":\"Polished report wording\",\"text\":\"...\"},{\"id\":\"summary\",\"label\":\"Short Summary\",\"angle\":\"Short and direct\",\"text\":\"...\"},{\"id\":\"action\",\"label\":\"Action / Next Steps\",\"angle\":\"What to do or recommend next\",\"text\":\"...\"}]}",
      "Each text value must be one paragraph only.",
      "Do not invent measurements, dates, names, results, or facts not present in the bullet points.",
      "Preserve the user's meaning and make the wording easier to use in a report.",
    ],
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        "You are an assistive report-writing helper for people who type slowly or use accessible input. Convert rough bullet points into clear report text. Keep the user's meaning, do not add unsupported facts, and return only valid JSON.",
      input: JSON.stringify(prompt),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error && data.error.message ? data.error.message : `OpenAI API request failed (${response.status})`;
    throw new Error(message);
  }

  const text = data.output_text || collectResponseText(data);
  if (!text) throw new Error("OpenAI response did not include text output.");

  return parseSuggestionsJson(text);
}

function collectResponseText(data) {
  const parts = [];
  const output = Array.isArray(data.output) ? data.output : [];
  output.forEach((item) => {
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach((part) => {
      if (part && typeof part.text === "string") parts.push(part.text);
    });
  });
  return parts.join("\n").trim();
}

function parseSuggestionsJson(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw err;
  }
}

function normalizeSuggestions(result) {
  const raw = result && Array.isArray(result.suggestions) ? result.suggestions : [];
  const fallbackLabels = [
    ["formal", "Formal Paragraph", "Polished report wording"],
    ["summary", "Short Summary", "Short and direct"],
    ["action", "Action / Next Steps", "What to do or recommend next"],
  ];

  return fallbackLabels.map(([id, label, angle], index) => {
    const item = raw[index] || {};
    return {
      id,
      label,
      angle,
      text: cleanText(item.text || ""),
    };
  }).filter((item) => item.text);
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 5000);
}

function extractIdeas(text) {
  return String(text || "")
    .split(/\n|•|- |\* |\d+\.\s/g)
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, 9);
}


function injectNeuralTrainer(html) {
  const injection = String.raw`
<style>
  .nn-trainer {
    position: fixed;
    left: 10px;
    bottom: 42px;
    width: 178px;
    z-index: 120;
    background: var(--panel);
    border: 1.5px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--shadow);
    padding: 8px 9px;
    color: var(--ink);
    font-family: var(--mono);
    font-size: 10px;
  }
  .nn-trainer__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }
  .nn-trainer__title {
    font-weight: 500;
    color: var(--b700);
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .dark .nn-trainer__title { color: var(--b900); }
  .nn-trainer__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 0 0 rgba(26,158,92,.45);
  }
  .nn-trainer.training .nn-trainer__dot {
    animation: nnPulse .8s ease-out;
  }
  @keyframes nnPulse {
    0% { box-shadow: 0 0 0 0 rgba(26,158,92,.52); }
    100% { box-shadow: 0 0 0 9px rgba(26,158,92,0); }
  }
  .nn-trainer__bar {
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--border-soft);
    margin-bottom: 6px;
  }
  .nn-trainer__fill {
    width: 0%;
    height: 100%;
    border-radius: inherit;
    background: var(--b700);
    transition: width .18s ease;
  }
  .nn-trainer__row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: var(--ink-soft);
    line-height: 1.6;
  }
  @media (max-width: 720px) {
    .nn-trainer {
      width: 132px;
      left: 7px;
      bottom: 38px;
      padding: 7px;
      font-size: 9px;
    }
  }
</style>
<div class="nn-trainer" id="nn-trainer" aria-live="polite">
  <div class="nn-trainer__top">
    <span class="nn-trainer__title">Neural layer</span>
    <span class="nn-trainer__dot"></span>
  </div>
  <div class="nn-trainer__bar"><div class="nn-trainer__fill" id="nn-fill"></div></div>
  <div class="nn-trainer__row"><span>updates</span><span id="nn-updates">0</span></div>
  <div class="nn-trainer__row"><span>words</span><span id="nn-words">0</span></div>
  <div class="nn-trainer__row"><span>state</span><span id="nn-state">watching</span></div>
</div>
<script>
(function () {
  "use strict";

  const KEY = "nw_tiny_neural_layer_v1";
  const HIDDEN = 8;
  const LR = 0.045;
  const NEGATIVE_SAMPLES = 5;
  const WORD_RE = /[a-zA-Z']+/g;

  const model = loadModel();
  let lastText = "";
  let lastWordCount = 0;
  let trainedWordCount = 0;
  let lastTrainAt = 0;

  function loadModel() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.out && parsed.vocab) return parsed;
      }
    } catch (e) {}
    return { updates: 0, vocab: {}, out: {}, seen: [] };
  }

  function saveModelSoon() {
    clearTimeout(saveModelSoon.timer);
    saveModelSoon.timer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(model)); } catch (e) {}
    }, 220);
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function featureVector(words) {
    const prev1 = words[words.length - 2] || "<start>";
    const prev2 = words[words.length - 3] || "<start>";
    const bits = ["bias", "p1:" + prev1, "p2:" + prev2, "pair:" + prev2 + "_" + prev1];
    const x = new Array(HIDDEN).fill(0);

    bits.forEach((bit) => {
      const h = hash(bit);
      const idx = h % HIDDEN;
      x[idx] += (h & 1) ? 1 : -1;
    });

    return x.map((v) => Math.tanh(v));
  }

  function ensureWord(word) {
    word = normalizeWord(word);
    if (!word) return null;
    if (!model.out[word]) model.out[word] = new Array(HIDDEN).fill(0);
    if (!model.vocab[word]) {
      model.vocab[word] = 0;
      model.seen.push(word);
    }
    model.vocab[word]++;
    return word;
  }

  function normalizeWord(word) {
    return String(word || "").toLowerCase().replace(/[^a-z']/g, "").slice(0, 24);
  }

  function sigmoid(v) {
    return 1 / (1 + Math.exp(-Math.max(-16, Math.min(16, v))));
  }

  function score(word, x) {
    const w = model.out[word] || [];
    let sum = 0;
    for (let i = 0; i < HIDDEN; i++) sum += (w[i] || 0) * x[i];
    return sum;
  }

  function trainOne(words, targetWord) {
    const target = ensureWord(targetWord);
    if (!target || words.length < 1) return;

    const x = featureVector(words);
    const samples = [target].concat(sampleNegatives(target));

    samples.forEach((word) => {
      const weights = model.out[word] || (model.out[word] = new Array(HIDDEN).fill(0));
      const y = word === target ? 1 : 0;
      const err = y - sigmoid(score(word, x));
      for (let i = 0; i < HIDDEN; i++) weights[i] += LR * err * x[i];
    });

    model.updates++;
    lastTrainAt = Date.now();
    saveModelSoon();
    renderStatus(true);
  }

  function sampleNegatives(target) {
    const source = model.seen.filter((word) => word !== target);
    const negatives = [];
    for (let i = 0; i < source.length && negatives.length < NEGATIVE_SAMPLES; i++) {
      const word = source[(hash(target + ":" + model.updates + ":" + i) + i) % source.length];
      if (word && word !== target && !negatives.includes(word)) negatives.push(word);
    }
    return negatives;
  }

  function wordsFromText(text) {
    return (text.match(WORD_RE) || []).map(normalizeWord).filter(Boolean);
  }

  function readEditorText() {
    const display = document.getElementById("tdisplay");
    if (!display) return "";
    return display.textContent || "";
  }

  function observeEditor() {
    const root = document.getElementById("editor");
    if (!root) return;

    const observer = new MutationObserver(() => {
      const text = readEditorText();
      if (text === lastText) return;

      const words = wordsFromText(text);
      if (words.length < trainedWordCount) trainedWordCount = words.length;
      if (words.length > trainedWordCount && /[\s\n]$/.test(text)) {
        trainOne(words, words[words.length - 1]);
        trainedWordCount = words.length;
      }

      lastText = text;
      lastWordCount = words.length;
    });

    observer.observe(root, { childList: true, subtree: true, characterData: true });
    lastText = readEditorText();
    lastWordCount = wordsFromText(lastText).length;
    trainedWordCount = lastWordCount;
  }

  function listenForPredictionClicks() {
    document.addEventListener("click", (event) => {
      const button = event.target && event.target.closest ? event.target.closest(".pb:not(.empty)") : null;
      if (!button) return;

      const chosen = normalizeWord(button.textContent);
      if (!chosen) return;

      const contextWords = wordsFromText(readEditorText() + " " + chosen);
      trainOne(contextWords, chosen);
    }, true);
  }

  function renderStatus(training) {
    const panel = document.getElementById("nn-trainer");
    const updates = document.getElementById("nn-updates");
    const words = document.getElementById("nn-words");
    const state = document.getElementById("nn-state");
    const fill = document.getElementById("nn-fill");
    if (!panel || !updates || !words || !state || !fill) return;

    updates.textContent = String(model.updates);
    words.textContent = String(model.seen.length);
    state.textContent = training ? "training" : (model.updates ? "ready" : "watching");
    fill.style.width = Math.min(100, (model.updates % 24) * 4.2) + "%";

    panel.classList.toggle("training", !!training);
    if (training) {
      clearTimeout(renderStatus.timer);
      renderStatus.timer = setTimeout(() => renderStatus(false), 700);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    observeEditor();
    listenForPredictionClicks();
    renderStatus(false);
    setInterval(() => {
      if (Date.now() - lastTrainAt > 900) renderStatus(false);
    }, 1200);
  });
})();
</script>
`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${injection}\n</body>`);
  }
  return `${html}\n${injection}`;
}

function applyProductivityReportMode(html) {
  const reportTemplates = `const TEMPLATES = {
  quick: {
    label: 'Blank Report',
    desc: 'Start with one open section and build your own structure.',
    sections: ['Report notes']
  },
  formal: {
    label: 'Formal Report',
    desc: 'A structured report with professional sections.',
    sections: ['Title and purpose', 'Background', 'Key information', 'Findings', 'Discussion', 'Recommendations', 'Conclusion']
  },
  notes: {
    label: 'Notes',
    desc: 'Capture rough ideas before turning them into report text.',
    sections: ['Main notes', 'Important details', 'Questions', 'Follow-up']
  },
  todo: {
    label: 'To Do',
    desc: 'Organise tasks and next actions.',
    sections: ['Today', 'This week', 'Waiting on', 'Completed', 'Extra notes']
  },
  goals: {
    label: 'Goal',
    desc: 'Plan one goal and the steps needed to reach it.',
    sections: ['Goal statement', 'Why it matters', 'Steps to take', 'Support needed', 'Progress check']
  },
  weekly: {
    label: 'Weekly Review',
    desc: 'Review work completed, challenges, and next week.',
    sections: ['Summary of the week', 'Work completed', 'Challenges', 'What I learned', 'Next week priorities']
  }
};`;
  const reportComposerFlow = `function confirmSection() {
  const sec = S.doc.sections.find(s => s.id === S.activeId);
  if (!sec) return;

  const added = S.editText.trim();
  if (!added) {
    toast('Nothing to add');
    return;
  }

  const existing = (sec.content || '').trim();
  sec.content = existing ? existing + '\\n' + added : added;
  S.editText = '';
  S.preds = getPredictions(S.editText);
  redrawText();
  redrawPreds();
  saveDoc();
  renderDocPanel();
  countWords();
  toast('✓ Added to report');
}`;
  const activateSectionFlow = `function activateSec(id) {
  if (S.activeId) {
    const cur = S.doc.sections.find(s => s.id===S.activeId);
    if (cur) {
      const draft = S.editText.trim();
      if (draft || !(cur.content || '').trim()) {
        cur.content = S.editText;
        saveDoc();
      }
    }
  }
  S.activeId = id;
  const sec = S.doc.sections.find(s => s.id===id);
  S.editText = sec ? sec.content : '';
  S.preds = getPredictions(S.editText);
  renderEditor();
  renderDocPanel();
  countWords();
}`;

  html = html.replace(/const TEMPLATES = \{[\s\S]*?\n\};/, reportTemplates);
  html = html.replace(/function confirmSection\(\) \{[\s\S]*?\n\}/, reportComposerFlow);
  html = html.replace(/function activateSec\(id\) \{[\s\S]*?\n\}/, activateSectionFlow);
  html = html
    .replace(/<title>Note Writer<\/title>/g, "<title>Assistive Report Writer</title>")
    .replace(/NOTE WRITER/g, "REPORT WRITER")
    .replace(/Note Writer/g, "Report Writer")
    .replace(/📄 My Notes/g, "REPORTS")
    .replace(/My Notes/g, "My Reports")
    .replace(/Send to Notes/g, "Add to Report")
    .replace(/Sent to notes/g, "Added to report")
    .replace(/Quick Note/g, "Blank Report")
    .replace(/Empty — click to edit/g, "Empty - click to write");

  return html;
}

function applyAssistScribeBrand(html) {
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="AssistScribe icon"><title>AssistScribe</title><rect x="0" y="0" width="120" height="120" rx="22" fill="#0d2d6b"/><text x="60" y="78" font-family="Georgia, 'Iowan Old Style', serif" font-weight="700" font-size="68" fill="#ffffff" text-anchor="middle" letter-spacing="-3">aS</text><circle cx="93" cy="32" r="6" fill="#8ed0f7"/></svg>`;
  const favicon = `data:image/svg+xml,${encodeURIComponent(logoSvg)}`;

  html = html
    .replace(/<title>.*?<\/title>/, `<title>AssistScribe</title><link rel="icon" type="image/svg+xml" href="${favicon}">`)
    .replace(/REPORT WRITER ACCESS/g, "ASSISTSCRIBE ACCESS")
    .replace(/REPORT WRITER/g, "AssistScribe")
    .replace(/Report Writer/g, "AssistScribe")
    .replace(/Assistive Report Writer/g, "AssistScribe")
    .replace(/Write reports with less effort/g, "Write with less effort")
    .replace(/Accessible report writing for people with limited mobility, powered by hover input, prediction, templates, and saved work\./g,
      "Accessible writing for people with limited mobility, powered by hover input, prediction, templates, and saved work.");

  return html;
}

function injectLoginKeyboard(html) {
  const injection = String.raw`
<style>
  .login-kb {
    position: fixed;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    z-index: 430;
    width: min(620px, calc(100vw - 24px));
    display: none;
    padding: 12px;
    border: 1px solid rgba(3,4,7,.16);
    border-radius: 20px;
    background: rgba(242,244,251,.95);
    box-shadow: 0 28px 90px rgba(3,4,7,.22);
    backdrop-filter: blur(18px);
  }
  body.auth-locked .login-kb.open { display: block; }
  .login-kb-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
    color: #030407;
    font-family: "Montserrat", Arial, sans-serif;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: .03em;
  }
  .login-kb-close {
    width: 30px;
    height: 30px;
    border: 1.5px solid #030407;
    border-radius: 10px;
    background: #fff;
    color: #030407;
    cursor: pointer;
    font-weight: 900;
  }
  .login-kb-row {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 6px;
    margin-bottom: 6px;
  }
  .login-kb-row.bottom {
    grid-template-columns: 1fr 1fr 4fr 1fr 1fr;
  }
  .login-kb button.key {
    height: 40px;
    min-width: 0;
    border: 1px solid rgba(3,4,7,.16);
    border-radius: 10px;
    background: #fff;
    color: #030407;
    cursor: pointer;
    font-family: "Montserrat", Arial, sans-serif;
    font-size: 13px;
    font-weight: 900;
    box-shadow: 0 2px 0 rgba(3,4,7,.10);
  }
  .login-kb button.key:hover {
    background: #e6f7ec;
    border-color: #8ed0f7;
  }
  .login-kb button.fn { font-size: 10px; }
  @media (max-width: 720px) {
    .login-kb {
      bottom: 8px;
      padding: 8px;
    }
    .login-kb button.key {
      height: 34px;
      font-size: 11px;
      border-radius: 8px;
    }
    .login-kb-head { font-size: 10px; }
  }
</style>
<div class="login-kb" id="login-kb" aria-label="Login keyboard">
  <div class="login-kb-head">
    <span>ON-SCREEN LOGIN KEYBOARD</span>
    <button class="login-kb-close" id="login-kb-close" aria-label="Close keyboard">x</button>
  </div>
  <div id="login-kb-keys"></div>
</div>
<script>
(function () {
  "use strict";

  let target = null;
  let caps = false;
  const rows = [
    ["q","w","e","r","t","y","u","i","o","p"],
    ["a","s","d","f","g","h","j","k","l","."],
    ["z","x","c","v","b","n","m","_","-","@"]
  ];

  function isLoginInput(el) {
    return el && (el.id === "auth-user" || el.id === "auth-pass");
  }

  function showKeyboard(input) {
    target = input;
    const kb = document.getElementById("login-kb");
    if (kb) kb.classList.add("open");
  }

  function hideKeyboard() {
    const kb = document.getElementById("login-kb");
    if (kb) kb.classList.remove("open");
  }

  function insert(text) {
    if (!target || !isLoginInput(target)) return;
    target.focus();
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    target.value = target.value.slice(0, start) + text + target.value.slice(end);
    const pos = start + text.length;
    target.selectionStart = pos;
    target.selectionEnd = pos;
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function backspace() {
    if (!target || !isLoginInput(target)) return;
    target.focus();
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    if (start === end && start > 0) {
      target.value = target.value.slice(0, start - 1) + target.value.slice(end);
      target.selectionStart = start - 1;
      target.selectionEnd = start - 1;
    } else {
      target.value = target.value.slice(0, start) + target.value.slice(end);
      target.selectionStart = start;
      target.selectionEnd = start;
    }
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function makeKey(label, action, fn) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "key" + (fn ? " fn" : "");
    btn.textContent = label;
    btn.addEventListener("mousedown", (event) => event.preventDefault());
    btn.addEventListener("click", action);
    return btn;
  }

  function renderKeys() {
    const wrap = document.getElementById("login-kb-keys");
    if (!wrap) return;
    wrap.innerHTML = "";
    rows.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "login-kb-row";
      row.forEach((key) => {
        rowEl.appendChild(makeKey(caps ? key.toUpperCase() : key, () => insert(caps ? key.toUpperCase() : key)));
      });
      wrap.appendChild(rowEl);
    });
    const bottom = document.createElement("div");
    bottom.className = "login-kb-row bottom";
    bottom.appendChild(makeKey("BACK", backspace, true));
    bottom.appendChild(makeKey("TAB", () => {
      const next = target && target.id === "auth-user" ? document.getElementById("auth-pass") : document.getElementById("auth-user");
      if (next) {
        next.focus();
        showKeyboard(next);
      }
    }, true));
    bottom.appendChild(makeKey("SPACE", () => insert(" "), true));
    bottom.appendChild(makeKey("CAPS", () => {
      caps = !caps;
      renderKeys();
    }, true));
    bottom.appendChild(makeKey("ENTER", () => {
      const form = document.getElementById("auth-form");
      if (form) form.requestSubmit();
    }, true));
    wrap.appendChild(bottom);
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderKeys();
    document.addEventListener("focusin", (event) => {
      if (isLoginInput(event.target)) showKeyboard(event.target);
    });
    const close = document.getElementById("login-kb-close");
    if (close) close.addEventListener("click", hideKeyboard);
  });
})();
</script>
`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${injection}\n</body>`);
  }
  return `${html}\n${injection}`;
}

function injectReportAssistant(html) {
  const injection = String.raw`
<style>
  .assist-overlay {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 360;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background: rgba(3,4,7,.64);
  }
  .assist-overlay.open { display: flex; }
  .assist-panel {
    width: min(860px, 100%);
    max-height: 84vh;
    display: grid;
    grid-template-columns: minmax(260px, .85fr) 1.15fr;
    background: var(--panel);
    color: var(--ink);
    border: 1.5px solid var(--border);
    border-radius: 22px;
    overflow: hidden;
    box-shadow: 0 34px 90px rgba(0,0,0,.28);
  }
  .assist-left,
  .assist-right {
    min-height: 0;
    padding: 18px;
  }
  .assist-left {
    border-right: 1px solid var(--border);
    background: var(--panel-alt);
  }
  .assist-head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 14px;
  }
  .assist-title { flex: 1; }
  .assist-title h2 {
    font-family: "Montserrat", Arial, sans-serif;
    font-size: 28px;
    line-height: .95;
    letter-spacing: -.04em;
    margin: 0 0 6px;
  }
  .assist-title p {
    margin: 0;
    color: var(--ink-soft);
    font-size: 13px;
    line-height: 1.35;
    font-weight: 600;
  }
  .assist-close {
    width: 32px;
    height: 32px;
    border: 1.5px solid var(--border);
    border-radius: 10px;
    background: var(--panel);
    color: var(--ink);
    cursor: pointer;
    font-weight: 900;
  }
  .assist-label {
    display: block;
    margin: 12px 0 6px;
    color: var(--ink-soft);
    font-family: "Montserrat", Arial, sans-serif;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: .06em;
    text-transform: uppercase;
  }
  .assist-ideas {
    width: 100%;
    min-height: 190px;
    resize: vertical;
    border: 1.5px solid var(--border);
    border-radius: 14px;
    padding: 12px;
    outline: none;
    background: var(--panel);
    color: var(--ink);
    font-family: "Montserrat", Arial, sans-serif;
    font-size: 14px;
    line-height: 1.45;
    font-weight: 600;
  }
  .assist-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 12px;
  }
  .assist-generate,
  .assist-use-current {
    height: 40px;
    border-radius: 12px;
    border: 1.5px solid var(--ink);
    font-family: "Montserrat", Arial, sans-serif;
    font-size: 12px;
    font-weight: 900;
    cursor: pointer;
  }
  .assist-generate {
    background: var(--ink);
    color: var(--panel);
  }
  .assist-use-current {
    background: var(--panel);
    color: var(--ink);
  }
  .assist-right { overflow-y: auto; }
  .assist-status {
    color: var(--ink-soft);
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 10px;
  }
  .assist-card {
    border: 1.5px solid var(--border);
    border-radius: 16px;
    padding: 13px;
    margin-bottom: 10px;
    background: var(--panel);
  }
  .assist-card h3 {
    margin: 0 0 3px;
    font-size: 16px;
    letter-spacing: -.025em;
  }
  .assist-card .angle {
    margin-bottom: 8px;
    color: var(--green);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .assist-card p {
    margin: 0 0 10px;
    color: var(--ink);
    font-size: 14px;
    line-height: 1.45;
    font-weight: 600;
  }
  .assist-card button,
  .assist-btn {
    border-radius: 10px;
    border: 1.5px solid var(--ink);
    background: var(--ink);
    color: var(--panel);
    cursor: pointer;
    font-family: "Montserrat", Arial, sans-serif;
    font-size: 12px;
    font-weight: 900;
  }
  .assist-card button {
    height: 34px;
    padding: 0 12px;
  }
  .assist-btn {
    height: 30px;
    padding: 0 13px;
    border-color: var(--green);
    background: var(--green);
    color: #fff;
    white-space: nowrap;
  }
  .dark .assist-panel,
  .dark .assist-card,
  .dark .assist-close,
  .dark .assist-use-current,
  .dark .assist-ideas {
    background: var(--panel) !important;
    color: var(--ink) !important;
    border-color: var(--border) !important;
  }
  .dark .assist-left {
    background: var(--panel-alt) !important;
    border-color: var(--border) !important;
  }
  .dark .assist-generate,
  .dark .assist-card button {
    background: var(--ink) !important;
    color: var(--panel) !important;
    border-color: var(--ink) !important;
  }
  @media (max-width: 720px) {
    .assist-panel {
      grid-template-columns: 1fr;
      max-height: 88vh;
    }
    .assist-left {
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
    .assist-ideas { min-height: 118px; }
  }
</style>
<div class="assist-overlay" id="assist-overlay">
  <section class="assist-panel" aria-label="AI report assistant">
    <div class="assist-left">
      <div class="assist-head">
        <div class="assist-title">
          <h2>Report Assist</h2>
          <p>Type rough bullets, then choose one of three ways to present them.</p>
        </div>
        <button class="assist-close" id="assist-close" aria-label="Close">x</button>
      </div>
      <label class="assist-label" for="assist-ideas">Ideas or bullet points</label>
      <textarea class="assist-ideas" id="assist-ideas" placeholder="- key result&#10;- what happened&#10;- issue or evidence&#10;- next action"></textarea>
      <div class="assist-actions">
        <button class="assist-generate" id="assist-generate">Generate drafts</button>
        <button class="assist-use-current" id="assist-use-current">Use section text</button>
      </div>
    </div>
    <div class="assist-right">
      <div class="assist-status" id="assist-status">Three presentation options will appear here.</div>
      <div id="assist-results"></div>
    </div>
  </section>
</div>
<script>
(function () {
  "use strict";

  function activeSectionName() {
    const el = document.querySelector(".elabel");
    return (el ? el.textContent : "Report section").replace(/^[-✏\s]+/, "").trim() || "Report section";
  }

  function reportTitle() {
    const title = document.getElementById("doc-title");
    return title && title.value ? title.value : "Report";
  }

  function currentSectionText() {
    const el = document.getElementById("tdisplay");
    return el ? (el.textContent || "").trim() : "";
  }

  function openAssist() {
    const overlay = document.getElementById("assist-overlay");
    const ideas = document.getElementById("assist-ideas");
    if (!overlay || !ideas) return;
    ideas.value = currentSectionText();
    overlay.classList.add("open");
    setTimeout(() => ideas.focus(), 30);
  }

  function closeAssist() {
    document.getElementById("assist-overlay").classList.remove("open");
  }

  function ensureAssistButton() {
    const top = document.querySelector(".etop");
    if (!top || document.getElementById("assist-open")) return;
    const btn = document.createElement("button");
    btn.className = "assist-btn";
    btn.id = "assist-open";
    btn.textContent = "AI Assist";
    btn.addEventListener("click", openAssist);
    const send = top.querySelector(".send");
    top.insertBefore(btn, send || null);
  }

  function observeEditor() {
    const editor = document.getElementById("editor");
    if (!editor) return;
    ensureAssistButton();
    new MutationObserver(ensureAssistButton).observe(editor, { childList: true, subtree: true });
  }

  async function generateDrafts() {
    const status = document.getElementById("assist-status");
    const results = document.getElementById("assist-results");
    const ideas = document.getElementById("assist-ideas");
    if (!status || !results || !ideas) return;

    const text = ideas.value.trim();
    if (!text) {
      status.textContent = "Add a few bullets or use the current section text first.";
      return;
    }

    status.textContent = "Creating three presentation options...";
    results.innerHTML = "";

    try {
      const response = await fetch("/api/report-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: reportTitle(),
          section: activeSectionName(),
          ideas: text
        })
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || "Could not generate drafts.");
      }
      renderSuggestions(data.suggestions || []);
    } catch (err) {
      status.textContent = err.message || "Could not generate drafts. Check the local server.";
    }
  }

  function renderSuggestions(suggestions) {
    const status = document.getElementById("assist-status");
    const results = document.getElementById("assist-results");
    results.innerHTML = "";

    if (!suggestions.length) {
      status.textContent = "No suggestions generated.";
      return;
    }

    status.textContent = "Choose how to present these ideas.";
    suggestions.forEach((item) => {
      const card = document.createElement("article");
      card.className = "assist-card";
      card.innerHTML = "<h3></h3><div class='angle'></div><p></p><button>Insert this draft</button>";
      card.querySelector("h3").textContent = item.label || "Draft";
      card.querySelector(".angle").textContent = item.angle || "Report option";
      card.querySelector("p").textContent = item.text || "";
      card.querySelector("button").addEventListener("click", () => insertDraft(item.text || ""));
      results.appendChild(card);
    });
  }

  function insertDraft(text) {
    if (!text) return;
    const current = currentSectionText();
    const prefix = current ? "\n\n" : "";
    closeAssist();
    (prefix + text).split("").forEach((ch) => {
      const key = ch === "\n" ? "Enter" : ch;
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true
      }));
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    observeEditor();
    const overlay = document.getElementById("assist-overlay");
    const close = document.getElementById("assist-close");
    const generate = document.getElementById("assist-generate");
    const useCurrent = document.getElementById("assist-use-current");
    if (close) close.addEventListener("click", closeAssist);
    if (overlay) overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeAssist();
    });
    if (generate) generate.addEventListener("click", generateDrafts);
    if (useCurrent) useCurrent.addEventListener("click", () => {
      document.getElementById("assist-ideas").value = currentSectionText();
    });
  });
})();
</script>
`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${injection}\n</body>`);
  }
  return `${html}\n${injection}`;
}

function injectAdaptivePredictions(html) {
  const injection = String.raw`
<script>
(function () {
  "use strict";

  const KEY = "arw_adaptive_predictions_v1";
  const WORD_RE = /[a-zA-Z][a-zA-Z']*/g;
  const CLEAN_FLAG = "arw_predictionary_cleaned_v1";
  const COMMON_WORDS = new Set((
    "a able about above accept action active activity add after again against aim all allow almost along already also although always am among an and another answer any appear apply are area around as ask at available away " +
    "back background be because become been before begin behaviour being below best better between big body both build but by call can care case cause change check clear close come common complete conclusion condition consider consistent content continue control could create current data date day decide decision describe design detail determine develop did different do does done down due during each early effect effort either end enough enter error evidence example explain export fact fall few field final find first focus follow following for form formal found from full further future " +
    "gave general get give given go goal good great group had has have happy he health help here high how however i idea if impact important improve in include increase information input into is issue it item its just keep key know large last later lead learn left less level like line list little local long look low made main make many may mean measure method might more most move much must need next no note now number objective observation of off often on once one only open option or order other out overall own page paragraph part past people person place plan point possible present problem process project provide purpose put question quick rather reach read real reason receive record reduce related report require result review right same save say section see select send sentence set should show simple since small so some stable start state step still structure study style submit summary support system take task template text than that the their them then there these they thing think this those through time title to today together tool topic total turn type under update up use used user using value very want was way we week well were what when where which while who why will with within word work would write writing year yes"
    + " accessibility accessible disabled disability productive productivity voltage current circuit wire loose measurement measured test testing equipment material materials method results discussion recommendation recommendations"
  ).split(/\s+/));
  const FALLBACK_WORDS = [
    "and", "the", "to", "of", "in", "for", "with", "report", "result", "results",
    "section", "information", "data", "method", "discussion", "conclusion",
    "recommendation", "action", "support", "progress", "summary", "important"
  ];
  let model = loadModel();
  let lastText = "";
  let learnedWordCount = 0;
  let livePrefix = "";

  cleanOldPredictionaryStore();

  function loadModel() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return cleanModel(JSON.parse(raw));
    } catch (e) {}
    return { words: {}, bigrams: {}, learned: 0 };
  }

  function cleanOldPredictionaryStore() {
    const hadUserDictionary = localStorage.getItem("nw_user_dict");
    localStorage.removeItem("nw_user_dict");
    localStorage.removeItem("nw_learned_count");
    try {
      const nativeSetItem = Storage.prototype.setItem;
      if (!Storage.prototype.__arwBlocksPredictionary) {
        Storage.prototype.setItem = function (key, value) {
          if (key === "nw_user_dict" || key === "nw_learned_count") return;
          return nativeSetItem.call(this, key, value);
        };
        Storage.prototype.__arwBlocksPredictionary = true;
      }
    } catch (e) {}
    if (hadUserDictionary && !sessionStorage.getItem(CLEAN_FLAG)) {
      sessionStorage.setItem(CLEAN_FLAG, "1");
      setTimeout(() => location.reload(), 30);
    }
  }

  function cleanModel(input) {
    const next = { words: {}, bigrams: {}, learned: Number(input.learned || 0) };
    Object.entries(input.words || {}).forEach(([word, count]) => {
      word = normalize(word);
      if (isRealEnglishWord(word)) next.words[word] = Number(count) || 1;
    });
    Object.entries(input.bigrams || {}).forEach(([prev, words]) => {
      const cleanPrev = prev === "<start>" ? prev : normalize(prev);
      if (cleanPrev !== "<start>" && !isRealEnglishWord(cleanPrev)) return;
      Object.entries(words || {}).forEach(([word, count]) => {
        word = normalize(word);
        if (!isRealEnglishWord(word)) return;
        next.bigrams[cleanPrev] = next.bigrams[cleanPrev] || {};
        next.bigrams[cleanPrev][word] = Number(count) || 1;
      });
    });
    return next;
  }

  function saveSoon() {
    clearTimeout(saveSoon.timer);
    saveSoon.timer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(model)); } catch (e) {}
    }, 180);
  }

  function normalize(word) {
    return String(word || "").toLowerCase().replace(/[^a-z']/g, "").slice(0, 28);
  }

  function isRealEnglishWord(word) {
    word = normalize(word);
    if (!word) return false;
    if (word === "a" || word === "i") return true;
    if (word.length < 2) return false;
    if (COMMON_WORDS.has(word)) return true;
    if (isProbablyEnglishWord(word)) return true;
    if (word.endsWith("'s") && COMMON_WORDS.has(word.slice(0, -2))) return true;
    if (word.endsWith("s") && COMMON_WORDS.has(word.slice(0, -1))) return true;
    if (word.endsWith("ed") && COMMON_WORDS.has(word.slice(0, -2))) return true;
    if (word.endsWith("ing") && COMMON_WORDS.has(word.slice(0, -3))) return true;
    return false;
  }

  function isProbablyEnglishWord(word) {
    if (!/^[a-z']{3,28}$/.test(word)) return false;
    if (/(.)\1\1/.test(word)) return false;
    if (!/[aeiouy]/.test(word)) return false;
    if (/[^aeiouy]{5,}/.test(word)) return false;
    if (/[aeiouy]{4,}/.test(word)) return false;
    const commonPairs = /(th|he|in|er|an|re|on|at|en|nd|ti|es|or|te|of|ed|is|it|al|ar|st|to|nt|ng|se|ha|as|ou|io|le|ve|co|me|de|hi|ri|ro|ic|ne|ea|ra|ce|li|ch|ll|be|ma|si|om|ur|ca|el|ta|la|ns|di|fo|ho|pe|ec|pr|no|ct|us|ac|ot|il|tr|ly|nc|et|ut|ss|so|rs|un|lo|wa|ge|ie|wh|ee|wi|em|ad|ol|rt|po|we|na|ul|ni|ts|mo|ow|pa|im|mi|ai|sh|ir|su|id|os|iv|ia|am|fi|ci|vi|pl|ig)/;
    return commonPairs.test(word);
  }

  function dispatchAppKey(key) {
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true
    }));
  }

  function wordsFrom(text) {
    return (String(text || "").match(WORD_RE) || []).map(normalize).filter(Boolean);
  }

  function readText() {
    const display = document.getElementById("tdisplay");
    return display ? (display.textContent || "") : "";
  }

  function currentPrefix(text) {
    const match = String(text || "").match(/[a-zA-Z']+$/);
    return match ? normalize(match[0]) : "";
  }

  function previousWord(words, hasPrefix) {
    if (!words.length) return "";
    return hasPrefix ? (words[words.length - 2] || "") : (words[words.length - 1] || "");
  }

  function learnCompletedText(text) {
    const words = wordsFrom(text);
    if (words.length < learnedWordCount) learnedWordCount = words.length;

    if (!/[\s\n.!?,;:]$/.test(text)) {
      return;
    }

    while (learnedWordCount < words.length) {
      const index = learnedWordCount;
      const word = words[index];
      const prev = words[index - 1] || "<start>";
      if (word && isRealEnglishWord(word)) {
        model.words[word] = (model.words[word] || 0) + 1;
        model.bigrams[prev] = model.bigrams[prev] || {};
        model.bigrams[prev][word] = (model.bigrams[prev][word] || 0) + 1;
        model.learned++;
      }
      learnedWordCount++;
    }

    updateLearnBadge();
    saveSoon();
  }

  function learnWord(word, prev) {
    word = normalize(word);
    prev = prev ? normalize(prev) : "<start>";
    if (!word || !isRealEnglishWord(word)) return false;
    model.words[word] = (model.words[word] || 0) + 1;
    model.bigrams[prev] = model.bigrams[prev] || {};
    model.bigrams[prev][word] = (model.bigrams[prev][word] || 0) + 1;
    model.learned++;
    updateLearnBadge();
    saveSoon();
    return true;
  }

  function updateLearnBadge() {
    const badge = document.getElementById("learn-badge");
    if (badge) badge.textContent = "Learned: " + model.learned;
    const nnUpdates = document.getElementById("nn-updates");
    const nnWords = document.getElementById("nn-words");
    const nnState = document.getElementById("nn-state");
    const nnPanel = document.getElementById("nn-trainer");
    if (nnUpdates) nnUpdates.textContent = String(model.learned);
    if (nnWords) nnWords.textContent = String(Object.keys(model.words).length);
    if (nnState) nnState.textContent = model.learned ? "ready" : "watching";
    if (nnPanel && model.learned) {
      nnPanel.classList.add("training");
      clearTimeout(updateLearnBadge.timer);
      updateLearnBadge.timer = setTimeout(() => nnPanel.classList.remove("training"), 650);
    }
  }

  function rankedCandidates(text) {
    const words = wordsFrom(text);
    const prefix = currentPrefix(text) || livePrefix;
    const prev = previousWord(words, !!prefix);
    const seen = new Set();
    const learnedEntries = Object.entries(model.words).map(([word, count]) => [word, Number(count) + 1000]);
    const fallbackEntries = FALLBACK_WORDS.map((word, index) => [word, Math.max(1, 50 - index)]);
    const entries = [...learnedEntries, ...fallbackEntries];

    return entries
      .filter(([word]) => isRealEnglishWord(word))
      .filter(([word]) => {
        word = normalize(word);
        if (seen.has(word)) return false;
        seen.add(word);
        return true;
      })
      .filter(([word]) => !prefix || word.startsWith(prefix))
      .filter(([word]) => word !== prefix)
      .map(([word, count]) => {
        const bigram = prev && model.bigrams[prev] ? (model.bigrams[prev][word] || 0) : 0;
        const exactBoost = prefix && word.startsWith(prefix) ? 500 : 0;
        return { word: normalize(word), score: bigram * 100 + count + exactBoost };
      })
      .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
      .slice(0, 4)
      .map((item) => item.word);
  }

  function enhanceButtons() {
    const buttons = Array.from(document.querySelectorAll(".pb"));
    if (!buttons.length) return;
    sanitizePredictionButtons(buttons);

    const text = readText();
    let candidates = rankedCandidates(text);
    if (!candidates.length) candidates = FALLBACK_WORDS.slice(0, 4);

    buttons.forEach((button, index) => {
      const word = candidates[index] || FALLBACK_WORDS[index] || "";
      const span = button.querySelector(".pb-text");
      if (!span) return;
      span.textContent = word;
      button.classList.toggle("empty", !word);
      button.dataset.adaptiveWord = word;
    });
  }

  function sanitizePredictionButtons(buttons) {
    buttons.forEach((button) => {
      const span = button.querySelector(".pb-text");
      const word = normalize(span ? span.textContent : button.textContent);
      if (!word || isRealEnglishWord(word)) return;
      if (span) span.textContent = "";
      button.classList.add("empty");
      delete button.dataset.adaptiveWord;
    });
  }

  function acceptAdaptiveWord(word) {
    word = normalize(word);
    if (!word || !isRealEnglishWord(word)) return;

    const text = readText();
    const prefix = currentPrefix(text);
    if (prefix) {
      for (let i = 0; i < prefix.length; i++) dispatchAppKey("Backspace");
    }
    (word + " ").split("").forEach((ch) => dispatchAppKey(ch));
    learnWord(word);
    livePrefix = "";
  }

  function trackKeyLabel(label) {
    label = String(label || "").trim();
    if (!label) return;
    if (/^[a-zA-Z]$/.test(label)) {
      livePrefix += label.toLowerCase();
      return;
    }
    if (/^[0-9]$/.test(label)) return;
    if (label === "⌫" || label === "BACK" || label === "Backspace") {
      livePrefix = livePrefix.slice(0, -1);
      return;
    }
    if (label === "SPACE" || label === "↵" || label === "ENTER" || /^[.,?!;:]$/.test(label)) {
      if (livePrefix) learnWord(livePrefix);
      livePrefix = "";
    }
  }

  function installAdaptiveClickHandler() {
    document.addEventListener("click", (event) => {
      const addButton = event.target && event.target.closest ? event.target.closest(".tbtn.send") : null;
      if (!addButton) return;
      const text = readText();
      if (!text.trim()) return;
      learnCompletedText(text + " ");
      setTimeout(enhanceButtons, 120);
    }, true);

    document.addEventListener("click", (event) => {
      const button = event.target && event.target.closest ? event.target.closest(".pb:not(.empty)") : null;
      if (!button) return;
      const visible = button.querySelector(".pb-text");
      const word = normalize(button.dataset.adaptiveWord || (visible ? visible.textContent : button.textContent));
      if (!word) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      acceptAdaptiveWord(word);
    }, true);

    document.addEventListener("click", (event) => {
      const key = event.target && event.target.closest ? event.target.closest(".kb .key") : null;
      if (!key) return;
      const labelEl = key.querySelector(".key-text");
      trackKeyLabel(labelEl ? labelEl.textContent : key.textContent);
      setTimeout(() => {
        learnCompletedText(readText());
        enhanceButtons();
      }, 60);
      setTimeout(() => {
        learnCompletedText(readText());
        enhanceButtons();
      }, 180);
    }, false);
  }

  function observeEditor() {
    const editor = document.getElementById("editor");
    if (!editor) return;

    const observer = new MutationObserver(() => {
      const text = readText();
      if (text === lastText) return;
      learnCompletedText(text);
      lastText = text;
      setTimeout(enhanceButtons, 0);
      setTimeout(enhanceButtons, 80);
    });

    observer.observe(editor, { childList: true, subtree: true, characterData: true });
    lastText = readText();
    learnedWordCount = wordsFrom(lastText).length;
    updateLearnBadge();
    setTimeout(enhanceButtons, 250);
  }

  document.addEventListener("DOMContentLoaded", () => {
    installAdaptiveClickHandler();
    observeEditor();
  });
})();
</script>
`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${injection}\n</body>`);
  }
  return `${html}\n${injection}`;
}

function injectLibraryShortcuts(html) {
  const injection = String.raw`
<style>
  .library-shortcuts {
    display: none;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    background: rgba(255,255,255,.72);
    backdrop-filter: blur(12px);
  }
  body:not(.auth-locked) .library-shortcuts {
    display: flex;
  }
  .library-shortcuts button {
    flex: 1;
    height: 38px;
    border: 1.5px solid var(--border);
    border-radius: 12px;
    background: var(--panel);
    color: var(--ink);
    cursor: pointer;
    font-family: "Montserrat", Arial, sans-serif;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: -.015em;
    box-shadow: 0 4px 16px rgba(3,4,7,.05);
  }
  .library-shortcuts button.primary {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--panel);
  }
  .library-shortcuts button:hover {
    border-color: var(--b500);
    background: var(--b100);
    color: var(--ink);
  }
  .library-shortcuts button.primary:hover {
    background: var(--ink);
    color: var(--panel);
  }
  .dark .library-shortcuts {
    background: rgba(16,24,17,.88);
    border-color: var(--border);
  }
  .dark .library-shortcuts button {
    background: var(--panel);
    color: var(--ink);
    border-color: var(--border);
  }
  .dark .library-shortcuts button.primary {
    background: var(--ink);
    color: var(--panel);
    border-color: var(--ink);
  }
</style>
<script>
(function () {
  "use strict";

  function addShortcuts() {
    const doc = document.querySelector(".doc");
    if (!doc || document.getElementById("library-shortcuts")) return;

    const bar = document.createElement("div");
    bar.className = "library-shortcuts";
    bar.id = "library-shortcuts";
    bar.innerHTML =
      '<button class="primary" id="open-library-shortcut" type="button">Saved Reports</button>' +
      '<button id="open-templates-shortcut" type="button">Templates</button>';

    const titleWrap = doc.querySelector(".doc-title-wrap");
    doc.insertBefore(bar, titleWrap || doc.firstChild);

    bar.querySelector("#open-library-shortcut").addEventListener("click", () => {
      const drive = document.getElementById("drive-btn");
      if (drive) drive.click();
    });

    bar.querySelector("#open-templates-shortcut").addEventListener("click", () => {
      const templates = document.getElementById("tpl-btn");
      if (templates) templates.click();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    addShortcuts();
    const split = document.querySelector(".split");
    if (split) new MutationObserver(addShortcuts).observe(split, { childList: true, subtree: true });
  });
})();
</script>
`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${injection}\n</body>`);
  }
  return `${html}\n${injection}`;
}

function injectNumberKeyboardRow(html) {
  const injection = String.raw`
<script>
(function () {
  "use strict";

  function dispatchKey(key) {
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true
    }));
  }

  function addNumberRow() {
    const keyboard = document.querySelector(".kb");
    if (!keyboard || keyboard.querySelector(".num-row")) return;

    const row = document.createElement("div");
    row.className = "krow num-row";
    row.style.gridTemplateColumns = "repeat(10, 1fr)";
    "1234567890".split("").forEach((num) => {
      const key = document.createElement("button");
      key.className = "key num-key";
      key.type = "button";
      key.innerHTML = '<span class="key-text">' + num + '</span><span class="dbar"></span>';
      key.addEventListener("click", () => dispatchKey(num));
      row.appendChild(key);
    });

    keyboard.insertBefore(row, keyboard.firstChild);
  }

  document.addEventListener("DOMContentLoaded", () => {
    addNumberRow();
    const editor = document.getElementById("editor");
    if (editor) new MutationObserver(addNumberRow).observe(editor, { childList: true, subtree: true });
  });
})();
</script>
`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${injection}\n</body>`);
  }
  return `${html}\n${injection}`;
}

function injectPolishedTheme(html) {
  const injection = String.raw`
<style>
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@500;700;800;900&display=swap');
  :root {
    --bg: #eef0f8 !important;
    --panel: #ffffff !important;
    --panel-alt: #f7f8fc !important;
    --border: #d7dbe8 !important;
    --border-soft: #e7eaf2 !important;
    --ink: #030407 !important;
    --ink-soft: #5b6070 !important;
    --b900: #17466f !important;
    --b700: #5aaee8 !important;
    --b500: #8ed0f7 !important;
    --b100: #e9f7ed !important;
    --green: #8ed0f7 !important;
    --r: 8px !important;
    --shadow: 0 10px 30px rgba(12, 59, 33, .08) !important;
  }
  body {
    background:
      radial-gradient(circle at 82% 20%, rgba(142,208,247,.24), transparent 28%),
      linear-gradient(180deg, #f2f4fb 0%, #e9ecf6 100%) !important;
    color: #030407 !important;
    font-family: "Montserrat", Arial, Helvetica, sans-serif !important;
  }
  .hdr {
    height: 64px !important;
    background: rgba(242,244,251,.92) !important;
    color: #030407 !important;
    border-bottom: 1px solid rgba(3,4,7,.08) !important;
    box-shadow: none !important;
    backdrop-filter: blur(14px);
  }
  .hdr-logo {
    color: #030407 !important;
    font-size: 18px !important;
    letter-spacing: .055em !important;
    font-family: "Montserrat", Arial, sans-serif !important;
    font-weight: 900 !important;
  }
  .hdr-logo::before {
    content: "aS";
    width: 25px;
    height: 25px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    background: #0d2d6b;
    color: #ffffff;
    font-family: Georgia, "Iowan Old Style", serif;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -.08em;
    box-shadow: 0 8px 18px rgba(90,174,232,.20);
  }
  .hdr-logo svg {
    display: none;
  }
  .hdr-sep {
    background: var(--border) !important;
  }
  .hbtn {
    background: #ffffff !important;
    color: #050806 !important;
    border-color: var(--border) !important;
    box-shadow: none;
    font-family: "Montserrat", Arial, sans-serif !important;
    font-weight: 800 !important;
    text-transform: none !important;
    letter-spacing: -.01em !important;
  }
  .hbtn:hover {
    background: var(--b100) !important;
    border-color: var(--b500) !important;
  }
  .hbtn#drive-btn,
  .hbtn#logout-btn {
    border-color: #050806 !important;
  }
  .hbtn#drive-btn {
    background: #050806 !important;
    color: #ffffff !important;
  }
  .split {
    background: var(--border) !important;
  }
  .doc,
  .editor,
  .pbar,
  .etop,
  .sfoot,
  .doc-foot {
    border-color: var(--border) !important;
  }
  .doc {
    border-right: 1px solid var(--border) !important;
  }
  .pbar,
  .etop,
  .sfoot {
    background: rgba(255,255,255,.86) !important;
  }
  .sec-card,
  .tdisplay,
  .pb,
  .key,
  .dfbtn,
  .tbtn {
    border-color: var(--border) !important;
    background: #ffffff !important;
    box-shadow: 0 7px 22px rgba(12,59,33,.05) !important;
  }
  .sec-card.active,
  .pb:not(.empty):hover,
  .key:hover {
    background: var(--b100) !important;
    border-color: var(--b500) !important;
  }
  .dfbtn.solid,
  .tbtn.send {
    background: #050806 !important;
    border-color: #050806 !important;
    color: #ffffff !important;
  }
  .key {
    box-shadow: 0 2px 0 var(--border), 0 8px 20px rgba(12,59,33,.04) !important;
  }
  .caret,
  .pb .dbar,
  .key .dbar,
  .nn-trainer__fill {
    background: var(--b700) !important;
  }
  .auth-screen {
    overflow: hidden;
    justify-content: flex-start !important;
    padding: clamp(22px, 4vw, 54px) !important;
    background:
      radial-gradient(circle at 74% 21%, rgba(142,208,247,.22), transparent 29%),
      linear-gradient(180deg, #f2f4fb 0%, #e9ecf6 100%) !important;
  }
  .auth-line-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    pointer-events: none;
  }
  .auth-screen::after {
    content: "Thoughts to text with less effort";
    position: absolute;
    left: auto;
    right: clamp(36px, 7vw, 96px);
    bottom: clamp(42px, 5vw, 72px);
    white-space: nowrap;
    color: #030407;
    font-weight: 700;
    font-family: "Montserrat", Arial, sans-serif;
    font-size: clamp(34px, 4.4vw, 64px);
    line-height: 1;
    letter-spacing: 0;
    z-index: 3;
    pointer-events: none;
    max-width: none;
    opacity: 1;
  }
  .auth-box {
    position: relative;
    z-index: 2;
    width: min(520px, 100%) !important;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: rgba(242,244,251,.70) !important;
    border-color: rgba(3,4,7,.08) !important;
    border-radius: 22px !important;
    box-shadow: 0 34px 90px rgba(3,4,7,.11) !important;
    backdrop-filter: blur(22px);
    padding: clamp(24px, 4vw, 42px) !important;
  }
  .auth-brand {
    position: relative;
    color: #030407 !important;
    font-size: 15px !important;
    letter-spacing: .05em !important;
    margin-bottom: 24px !important;
    padding-left: 42px;
  }
  .auth-brand::before {
    content: "aS";
    position: absolute;
    left: 0;
    top: 50%;
    width: 31px;
    height: 31px;
    transform: translateY(-50%);
    border-radius: 9px;
    background: #0d2d6b;
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: Georgia, "Iowan Old Style", serif;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -.08em;
    box-shadow: 0 12px 24px rgba(90,174,232,.20);
  }
  .auth-box h1 {
    font-family: "Montserrat", Arial, sans-serif !important;
    font-size: clamp(46px, 6.4vw, 88px) !important;
    line-height: .88 !important;
    letter-spacing: -.04em !important;
    max-width: 8.2em;
    font-weight: 900 !important;
    margin-bottom: 18px !important;
  }
  .auth-box p {
    max-width: 32em;
    color: #5b6070 !important;
    font-size: 15px !important;
    font-weight: 500 !important;
  }
  .auth-form {
    margin-top: 10px;
  }
  .auth-form label {
    color: #56655b !important;
  }
  .auth-form input {
    height: 46px !important;
    border-radius: 14px !important;
    background: rgba(255,255,255,.86) !important;
    border-color: rgba(3,4,7,.15) !important;
    color: #030407 !important;
    font-family: "Montserrat", Arial, sans-serif !important;
    font-weight: 700 !important;
  }
  .auth-primary,
  .auth-secondary {
    height: 44px !important;
    border-radius: 14px !important;
    font-family: "Montserrat", Arial, sans-serif !important;
    font-weight: 900 !important;
    letter-spacing: -.015em !important;
  }
  .auth-primary {
    background: #030407 !important;
    border-color: #030407 !important;
  }
  .auth-secondary {
    border-color: #030407 !important;
    color: #030407 !important;
  }
  .drive-panel,
  .modal,
  .nn-trainer {
    border-color: var(--border) !important;
    box-shadow: 0 24px 70px rgba(5,8,6,.12) !important;
  }
  .drive-head {
    background: #f7faf6 !important;
  }
  .drive-btn.primary {
    background: #050806 !important;
    border-color: #050806 !important;
  }
  .nn-trainer {
    bottom: 44px !important;
    background: rgba(255,255,255,.9) !important;
    backdrop-filter: blur(12px);
  }
  .split {
    position: relative;
    padding: 10px !important;
    gap: 10px !important;
    background:
      radial-gradient(circle at 86% 16%, rgba(142,208,247,.20), transparent 30%),
      linear-gradient(180deg, #f2f4fb 0%, #e9ecf6 100%) !important;
  }
  .split::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: .42;
    background:
      linear-gradient(90deg, transparent 0 74%, rgba(142,208,247,.16) 74% 74.25%, transparent 74.25%),
      linear-gradient(135deg, transparent 0 50%, rgba(142,208,247,.12) 50% 50.18%, transparent 50.18%);
  }
  .doc,
  .editor {
    position: relative;
    z-index: 1;
    border: 1.5px solid var(--border) !important;
    border-radius: 22px !important;
    overflow: hidden !important;
    box-shadow: 0 30px 80px rgba(3,4,7,.10) !important;
  }
  .doc {
    width: 38% !important;
  }
  .editor {
    border-left: 1.5px solid var(--border) !important;
  }
  .pbar,
  .etop,
  .sfoot,
  .doc-foot {
    background: rgba(255,255,255,.82) !important;
    backdrop-filter: blur(12px);
  }
  .sec-card,
  .tdisplay,
  .pb,
  .key {
    border-radius: 12px !important;
  }
  .tdisplay {
    background:
      linear-gradient(180deg, #ffffff, #f9fcf8) !important;
    font-family: "Montserrat", Arial, Helvetica, sans-serif !important;
    font-weight: 800 !important;
    letter-spacing: -.035em !important;
    min-height: 210px !important;
    max-height: none !important;
    flex: 1 1 auto !important;
    margin-bottom: auto !important;
  }
  .pb,
  .key {
    transition: border-color .14s, background .14s, transform .08s, box-shadow .14s !important;
    font-family: "Montserrat", Arial, Helvetica, sans-serif !important;
    font-weight: 800 !important;
    letter-spacing: -.025em !important;
  }
  .preds {
    padding: 3px 9px 3px !important;
    gap: 7px !important;
    margin-top: auto !important;
  }
  .pb {
    height: 58px !important;
    font-size: 15px !important;
  }
  .kb {
    padding: 2px 9px 8px !important;
    gap: 6px !important;
  }
  .krow {
    gap: 6px !important;
  }
  .key {
    height: 62px !important;
    font-size: 20px !important;
    border-radius: 12px !important;
  }
  .key.fn {
    font-size: 13px !important;
  }
  .pb:not(.empty):hover,
  .key:hover,
  .sec-card:hover {
    box-shadow: 0 16px 32px rgba(90,174,232,.16) !important;
  }
  .dark {
    --bg: #050806 !important;
    --panel: #0c110d !important;
    --panel-alt: #101811 !important;
    --border: #28442f !important;
    --border-soft: #1a2a1e !important;
    --ink: #f4fbf4 !important;
    --ink-soft: #a1b2a6 !important;
    --b900: #c9ecff !important;
    --b700: #8ed0f7 !important;
    --b500: #5aaee8 !important;
    --b100: #122417 !important;
    --green: #8ed0f7 !important;
    --shadow: 0 18px 48px rgba(0,0,0,.38) !important;
  }
  body.dark {
    background:
      radial-gradient(circle at 74% 14%, rgba(63,217,135,.12), transparent 34%),
      linear-gradient(180deg, #050806 0%, #08110a 100%) !important;
    color: #f4fbf4 !important;
  }
  .dark .hdr {
    background: rgba(5,8,6,.86) !important;
    color: #f4fbf4 !important;
    border-bottom-color: var(--border) !important;
  }
  .dark .hdr-logo,
  .dark .hbtn,
  .dark .doc-title,
  .dark .drive-close,
  .dark .drive-btn,
  .dark .drive-mini,
  .dark .dfbtn,
  .dark .tbtn {
    color: #f4fbf4 !important;
  }
  .dark .hdr-logo::before,
  .dark .auth-brand::before {
    background: #0d2d6b !important;
    color: #ffffff !important;
  }
  .dark .hbtn,
  .dark .dfbtn,
  .dark .tbtn,
  .dark .key,
  .dark .pb,
  .dark .sec-card,
  .dark .tdisplay,
  .dark .auth-form input,
  .dark .drive-close,
  .dark .drive-btn,
  .dark .drive-mini {
    background: #0c110d !important;
    border-color: var(--border) !important;
  }
  .dark .hbtn#drive-btn,
  .dark .dfbtn.solid,
  .dark .tbtn.send,
  .dark .drive-btn.primary {
    background: #f4fbf4 !important;
    border-color: #f4fbf4 !important;
    color: #050806 !important;
  }
  .dark .split {
    background:
      radial-gradient(circle at 80% 18%, rgba(99,217,135,.12), transparent 31%),
      linear-gradient(180deg, #050806 0%, #08110a 100%) !important;
  }
  .dark .split::before {
    opacity: .32;
    background:
      linear-gradient(90deg, transparent 0 74%, rgba(99,217,135,.16) 74% 74.25%, transparent 74.25%),
      linear-gradient(135deg, transparent 0 50%, rgba(99,217,135,.10) 50% 50.18%, transparent 50.18%);
  }
  .dark .doc,
  .dark .editor,
  .dark .drive-panel,
  .dark .modal,
  .dark .nn-trainer {
    background: rgba(12,17,13,.92) !important;
    border-color: var(--border) !important;
  }
  .dark .pbar,
  .dark .etop,
  .dark .sfoot,
  .dark .doc-foot,
  .dark .drive-head {
    background: rgba(16,24,17,.88) !important;
  }
  .dark .tdisplay {
    background: linear-gradient(180deg, #0c110d, #0f1710) !important;
  }
  .dark .auth-screen {
    background: #050806 !important;
  }
  .dark .auth-box {
    background: rgba(12,17,13,.80) !important;
    border-color: var(--border) !important;
  }
  .dark .auth-screen::after,
  .dark .auth-brand,
  .dark .auth-box h1 {
    color: #f4fbf4 !important;
  }
  .dark .auth-box p,
  .dark .auth-form label,
  .dark .drive-meta,
  .dark .drive-preview,
  .dark .drive-user {
    color: var(--ink-soft) !important;
  }
  .doc-title {
    font-family: "Montserrat", Arial, Helvetica, sans-serif !important;
    font-weight: 900 !important;
    letter-spacing: -.055em !important;
    font-size: 30px !important;
  }
  .plabel,
  .wcount,
  .sc-head,
  .elabel,
  .slbl,
  .sval,
  .badge,
  .dfbtn,
  .tbtn,
  .nn-trainer,
  .drive-btn,
  .drive-mini,
  .drive-meta,
  .drive-user {
    font-family: "Montserrat", Arial, Helvetica, sans-serif !important;
    letter-spacing: .015em !important;
  }
  .plabel,
  .sc-head,
  .elabel,
  .nn-trainer__title {
    font-weight: 700 !important;
    text-transform: uppercase;
  }
  .sc-body {
    font-family: "Montserrat", Arial, Helvetica, sans-serif !important;
    font-size: 15px !important;
    line-height: 1.45 !important;
    font-weight: 700 !important;
    letter-spacing: -.025em !important;
  }
  .sec-card.active .sc-body {
    display: block !important;
    -webkit-line-clamp: unset !important;
    -webkit-box-orient: initial !important;
    max-height: none !important;
    overflow: visible !important;
    white-space: pre-wrap !important;
  }
  .sec-card.active {
    max-height: none !important;
  }
  .sc-body.empty {
    font-weight: 400 !important;
    font-style: italic;
  }
  .dfbtn,
  .tbtn {
    font-family: "Montserrat", Arial, sans-serif !important;
    font-weight: 900 !important;
    letter-spacing: -.02em !important;
  }
  .etop .elabel {
    font-size: 12px !important;
  }
  .pbar .plabel,
  .pbar .wcount {
    font-size: 11px !important;
    font-weight: 900 !important;
  }
  .plabel {
    color: #030407 !important;
  }
  .sc-head,
  .elabel {
    font-size: 11px !important;
    color: #226d9f !important;
  }
  .hbtn,
  .auth-form label,
  .drive-meta,
  .drive-user,
  .nn-trainer {
    font-family: "Montserrat", Arial, Helvetica, sans-serif !important;
  }
  @media (max-width: 860px) {
    .auth-screen {
      align-items: flex-start !important;
      justify-content: center !important;
    }
    .auth-screen::after {
      opacity: 1;
      left: 20px;
      right: 20px;
      bottom: 16px;
      font-size: clamp(18px, 5vw, 28px);
      max-width: none;
      white-space: nowrap;
      text-align: center;
    }
    .auth-box {
      align-self: auto;
      min-height: auto;
    }
    .auth-box h1 {
      font-size: clamp(38px, 13vw, 58px) !important;
    }
    .hdr {
      height: 58px !important;
      overflow-x: auto;
      overflow-y: hidden;
      align-items: center;
    }
    .hdr-logo {
      flex: 0 0 auto;
    }
    .hdr-r {
      flex: 0 0 auto;
      margin-left: 6px !important;
    }
    .split {
      flex-direction: column !important;
      gap: 1px !important;
    }
    .doc {
      width: 100% !important;
      min-width: 0 !important;
      height: 34% !important;
      min-height: 190px;
      border-right: 0 !important;
      border-bottom: 1px solid var(--border) !important;
    }
    .editor {
      width: 100% !important;
      min-height: 0 !important;
    }
    .doc-title-wrap {
      padding: 8px 10px 7px !important;
    }
    .doc-title {
      font-size: 18px !important;
    }
    .sec-scroll {
      padding: 7px !important;
    }
    .sec-card {
      padding: 8px 10px !important;
    }
    .etop {
      height: 40px !important;
      padding: 0 8px !important;
    }
    .tdisplay {
      min-height: 170px !important;
      max-height: none !important;
      flex: 1 1 auto !important;
      margin: 6px 7px 0 !important;
      font-size: 15px !important;
    }
    .preds {
      gap: 4px !important;
      padding: 3px 7px 3px !important;
      margin-top: auto !important;
    }
    .pb {
      height: 50px !important;
      font-size: 13px !important;
      padding: 4px !important;
    }
    .kb {
      padding: 2px 7px 6px !important;
      gap: 5px !important;
    }
    .krow {
      gap: 5px !important;
    }
    .key {
      height: 44px !important;
      min-width: 0 !important;
      font-size: 15px !important;
      border-radius: 8px !important;
    }
    .key.fn {
      font-size: 10px !important;
    }
    .sfoot {
      height: 30px !important;
      padding: 0 7px !important;
      gap: 7px !important;
      overflow-x: auto;
    }
    .slbl input[type=range] {
      width: 58px !important;
    }
    .badge {
      display: none;
    }
    .nn-trainer {
      top: 64px !important;
      bottom: auto !important;
      left: 8px !important;
      width: 126px !important;
      height: 28px !important;
      overflow: hidden !important;
      padding: 6px !important;
      font-size: 9px !important;
    }
    .nn-trainer__top {
      margin-bottom: 0 !important;
    }
    .nn-trainer__bar,
    .nn-trainer__row {
      display: none !important;
    }
  }
</style>
<script>
(function () {
  "use strict";

  function makeCanvas() {
    const screen = document.getElementById("auth-screen");
    if (!screen || screen.querySelector(".auth-line-canvas")) return;

    const canvas = document.createElement("canvas");
    canvas.className = "auth-line-canvas";
    screen.prepend(canvas);

    const ctx = canvas.getContext("2d");
    const pointer = { x: 0, y: 0, active: false };
    let width = 0;
    let height = 0;
    let dpr = 1;
    let time = 0;
    let nodes = [];
    let edges = [];

    function resize() {
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      width = screen.clientWidth;
      height = screen.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedNetwork();
    }

    function seedNetwork() {
      const isSmall = width < 760;
      const layerCounts = isSmall ? [3, 4, 4, 2] : [4, 6, 6, 2];
      const left = isSmall ? width * .14 : width * .38;
      const right = width * .94;
      const top = isSmall ? height * .15 : height * .10;
      const bottom = isSmall ? height * .88 : height * .82;
      nodes = [];
      edges = [];

      layerCounts.forEach((count, layerIndex) => {
        const x = left + ((right - left) * layerIndex) / (layerCounts.length - 1);
        for (let i = 0; i < count; i++) {
          nodes.push({
            layer: layerIndex,
            x,
            y: top + ((bottom - top) * (i + 1)) / (count + 1),
            r: isSmall ? 12 : 18,
            phase: Math.random() * Math.PI * 2
          });
        }
      });

      for (let layer = 0; layer < layerCounts.length - 1; layer++) {
        const fromNodes = nodes.filter((node) => node.layer === layer);
        const toNodes = nodes.filter((node) => node.layer === layer + 1);
        fromNodes.forEach((from) => {
          toNodes.forEach((to) => {
            edges.push({
              from,
              to,
              phase: Math.random() * Math.PI * 2,
              speed: .7 + Math.random() * .8
            });
          });
        });
      }
    }

    function drawNode(node, color, ring) {
      const isDark = document.body.classList.contains("dark");
      const grad = ctx.createRadialGradient(
        node.x - node.r * .38,
        node.y - node.r * .45,
        node.r * .12,
        node.x,
        node.y,
        node.r * 1.35
      );
      grad.addColorStop(0, isDark ? "#ffffff" : "#ffffff");
      grad.addColorStop(.46, isDark ? "#19211b" : "#f4f5fa");
      grad.addColorStop(1, isDark ? "#050806" : "#b9becd");

      ctx.beginPath();
      ctx.arc(node.x, node.y, Math.max(1, node.r + ring), 0, Math.PI * 2);
      ctx.shadowColor = color;
      ctx.shadowBlur = 10 + Math.max(0, ring) * 2;
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(4, node.r * .36);
      ctx.strokeStyle = color;
      ctx.stroke();
    }

    function draw() {
      time += 0.012;
      const isDark = document.body.classList.contains("dark");
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";

      edges.forEach((edge) => {
        const activity = (Math.sin(time * edge.speed + edge.phase) + 1) / 2;
        const midX = (edge.from.x + edge.to.x) / 2;
        const midY = (edge.from.y + edge.to.y) / 2;
        const pointerBoost = pointer.active
          ? Math.max(0, 1 - Math.hypot(midX - pointer.x, midY - pointer.y) / 280)
          : 0;
        const alpha = .12 + activity * .18 + pointerBoost * .36;

        ctx.strokeStyle = isDark
          ? "rgba(244, 251, 244, " + Math.min(.62, alpha + .12).toFixed(3) + ")"
          : "rgba(3, 4, 7, " + alpha.toFixed(3) + ")";
        ctx.lineWidth = 1.4 + activity * 1.4 + pointerBoost * 1.6;
        ctx.beginPath();
        ctx.moveTo(edge.from.x, edge.from.y);
        ctx.lineTo(edge.to.x, edge.to.y);
        ctx.stroke();

        if (activity > .64) {
          const pulse = (time * edge.speed + edge.phase) % 1;
          const px = edge.from.x + (edge.to.x - edge.from.x) * pulse;
          const py = edge.from.y + (edge.to.y - edge.from.y) * pulse;
          ctx.beginPath();
          ctx.fillStyle = isDark ? "rgba(99, 217, 135, .95)" : "rgba(31, 157, 85, .85)";
          ctx.arc(px, py, 3.2 + pointerBoost * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      nodes.forEach((node) => {
        const active = pointer.active ? Math.max(0, 1 - Math.hypot(node.x - pointer.x, node.y - pointer.y) / 180) : 0;
        const ring = Math.sin(time * 2 + node.phase) * 1.5 + active * 5;
        const color = node.layer === 0
          ? (isDark ? "#6aa3ff" : "#1f5bd8")
          : node.layer === 3
            ? (isDark ? "#8ed0f7" : "#5aaee8")
            : (isDark ? "#f4fbf4" : "#050806");
        drawNode(node, color, ring);
      });

      requestAnimationFrame(draw);
    }

    screen.addEventListener("pointermove", (event) => {
      const rect = screen.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    });
    screen.addEventListener("pointerleave", () => {
      pointer.active = false;
    });
    window.addEventListener("resize", resize);
    resize();
    draw();
  }

  document.addEventListener("DOMContentLoaded", makeCanvas);
})();
</script>
`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${injection}\n</body>`);
  }
  return `${html}\n${injection}`;
}

function injectLoginAndDrive(html) {
  const injection = String.raw`
<style>
  body.auth-locked > .hdr,
  body.auth-locked > .split,
  body.auth-locked > .nn-trainer,
  body.auth-locked > .toast {
    display: none !important;
  }
  .auth-screen {
    position: fixed;
    inset: 0;
    z-index: 400;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background:
      linear-gradient(135deg, rgba(237,242,251,.94), rgba(255,255,255,.88)),
      radial-gradient(circle at 20% 15%, rgba(45,116,216,.18), transparent 28%),
      radial-gradient(circle at 80% 80%, rgba(26,158,92,.12), transparent 26%);
    color: var(--ink);
  }
  body.auth-locked .auth-screen { display: flex; }
  .auth-box {
    width: min(390px, 100%);
    background: var(--panel);
    border: 1.5px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 14px 46px rgba(14,30,61,.18);
    padding: 22px;
  }
  .auth-brand {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 18px;
    font-family: var(--mono);
    color: var(--b900);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: .07em;
  }
  .auth-box h1 {
    font-size: 22px;
    line-height: 1.2;
    margin-bottom: 7px;
  }
  .auth-box p {
    color: var(--ink-soft);
    font-size: 13px;
    line-height: 1.45;
    margin-bottom: 16px;
  }
  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .auth-form label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--ink-soft);
    letter-spacing: .05em;
    text-transform: uppercase;
  }
  .auth-form input {
    height: 38px;
    border: 1.5px solid var(--border);
    border-radius: 7px;
    padding: 0 10px;
    background: var(--panel);
    color: var(--ink);
    font-family: var(--font);
    font-size: 14px;
    outline: none;
  }
  .auth-form input:focus {
    border-color: var(--b700);
  }
  .auth-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .auth-primary,
  .auth-secondary {
    height: 36px;
    border-radius: 7px;
    border: 1.5px solid var(--b700);
    cursor: pointer;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: .04em;
  }
  .auth-primary {
    flex: 1;
    background: var(--b700);
    color: #fff;
  }
  .auth-secondary {
    width: 116px;
    background: var(--panel);
    color: var(--b700);
  }
  .auth-msg {
    min-height: 16px;
    margin-top: 10px;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--green);
  }
  .drive-overlay {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(9,22,41,.65);
    align-items: center;
    justify-content: center;
    padding: 18px;
  }
  .drive-overlay.open { display: flex; }
  .drive-panel {
    width: min(720px, 100%);
    max-height: 78vh;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1.5px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 14px 46px rgba(0,0,0,.28);
    color: var(--ink);
    overflow: hidden;
  }
  .drive-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--panel-alt);
  }
  .drive-head h2 {
    flex: 1;
    font-size: 16px;
  }
  .drive-user {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--ink-soft);
  }
  .drive-close {
    width: 30px;
    height: 30px;
    border: 1.5px solid var(--border);
    border-radius: 7px;
    background: var(--panel);
    color: var(--ink);
    cursor: pointer;
  }
  .drive-toolbar {
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-soft);
  }
  .drive-btn {
    height: 32px;
    padding: 0 11px;
    border: 1.5px solid var(--border);
    border-radius: 7px;
    background: var(--panel);
    color: var(--ink);
    cursor: pointer;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
  }
  .drive-btn.primary {
    background: var(--b700);
    border-color: var(--b700);
    color: #fff;
  }
  .drive-list {
    overflow-y: auto;
    padding: 10px 16px 16px;
  }
  .drive-empty {
    padding: 24px 10px;
    color: var(--ink-soft);
    font-size: 13px;
    text-align: center;
  }
  .drive-item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 11px 0;
    border-bottom: 1px solid var(--border-soft);
  }
  .drive-title {
    font-weight: 700;
    font-size: 14px;
    margin-bottom: 3px;
  }
  .drive-meta {
    color: var(--ink-soft);
    font-family: var(--mono);
    font-size: 10px;
  }
  .drive-preview {
    margin-top: 5px;
    color: var(--ink-soft);
    font-size: 12px;
    line-height: 1.35;
    max-width: 460px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .drive-item-actions {
    display: flex;
    gap: 6px;
  }
  .drive-mini {
    height: 29px;
    padding: 0 9px;
    border: 1.5px solid var(--border);
    border-radius: 7px;
    background: var(--panel);
    color: var(--ink);
    cursor: pointer;
    font-family: var(--mono);
    font-size: 10px;
  }
  .drive-mini.danger {
    color: #b32a2a;
    border-color: #e4b8b8;
  }
  @media (max-width: 720px) {
    .drive-item {
      grid-template-columns: 1fr;
    }
    .drive-item-actions {
      justify-content: flex-start;
      flex-wrap: wrap;
    }
    .auth-actions {
      flex-direction: column;
    }
    .auth-secondary {
      width: 100%;
    }
  }
</style>
<div class="auth-screen" id="auth-screen">
  <section class="auth-box" aria-label="Sign in">
    <div class="auth-brand">ASSISTSCRIBE ACCESS</div>
    <h1>Write with less effort</h1>
    <p>Accessible writing for people with limited mobility, powered by hover input, prediction, templates, and saved work.</p>
    <form class="auth-form" id="auth-form">
      <label>Username
        <input id="auth-user" autocomplete="username" spellcheck="false" required>
      </label>
      <label>Password
        <input id="auth-pass" type="password" autocomplete="current-password" required>
      </label>
      <div class="auth-actions">
        <button class="auth-primary" type="submit">Sign in</button>
        <button class="auth-secondary" type="button" id="auth-create">Create</button>
      </div>
    </form>
    <div class="auth-msg" id="auth-msg"></div>
  </section>
</div>
<div class="drive-overlay" id="drive-overlay">
  <section class="drive-panel" aria-label="Saved writing library">
    <div class="drive-head">
      <h2>My Writing Drive</h2>
      <span class="drive-user" id="drive-user"></span>
      <button class="drive-close" id="drive-close" aria-label="Close">x</button>
    </div>
    <div class="drive-toolbar">
      <button class="drive-btn primary" id="drive-save">Save current</button>
      <button class="drive-btn" id="drive-refresh">Refresh</button>
    </div>
    <div class="drive-list" id="drive-list"></div>
  </section>
</div>
<script>
(function () {
  "use strict";

  const USERS_KEY = "nw_users_v1";
  const SESSION_KEY = "nw_session_v1";
  const DRIVE_PREFIX = "nw_drive_docs_";
  const CURRENT_DOC_PREFIX = "nw_current_doc_";

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeUser(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 32);
  }

  async function digest(value) {
    const data = new TextEncoder().encode(value);
    const bytes = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function activeUser() {
    const session = readJson(SESSION_KEY, null);
    return session && session.user ? session.user : "";
  }

  function currentDocKey(user) {
    return CURRENT_DOC_PREFIX + user;
  }

  function defaultReportDoc() {
    return {
      title: "Blank Report",
      sections: [
        {
          id: "s" + Math.random().toString(36).slice(2, 8),
          heading: "Report notes",
          content: ""
        }
      ]
    };
  }

  function saveCurrentDocForUser(user) {
    if (!user) return;
    const doc = readJson("nw_doc", null);
    if (!doc || !Array.isArray(doc.sections)) return;
    writeJson(currentDocKey(user), doc);
  }

  function loadCurrentDocForUser(user, fresh) {
    if (!user) return;
    const doc = fresh ? defaultReportDoc() : readJson(currentDocKey(user), defaultReportDoc());
    writeJson("nw_doc", doc);
  }

  function lockAuth(locked) {
    document.body.classList.toggle("auth-locked", locked);
  }

  function showMessage(text, isError) {
    const msg = document.getElementById("auth-msg");
    if (!msg) return;
    msg.textContent = text || "";
    msg.style.color = isError ? "#b32a2a" : "var(--green)";
  }

  function driveKey() {
    return DRIVE_PREFIX + activeUser();
  }

  function getCurrentDoc() {
    const doc = readJson("nw_doc", null);
    if (!doc || !Array.isArray(doc.sections)) return null;
    return doc;
  }

  function wordCount(doc) {
    return doc.sections.map((s) => s.content || "").join(" ").trim().split(/\s+/).filter(Boolean).length;
  }

  function previewText(doc) {
    const text = doc.sections.map((s) => s.content || "").join(" ").trim();
    return text || "No writing yet";
  }

  function renderDrive() {
    const list = document.getElementById("drive-list");
    const user = document.getElementById("drive-user");
    if (!list) return;

    const docs = readJson(driveKey(), []);
    if (user) user.textContent = activeUser();
    list.innerHTML = "";

    if (!docs.length) {
      list.innerHTML = '<div class="drive-empty">No saved reports or writings yet.</div>';
      return;
    }

    docs
      .slice()
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .forEach((item) => {
        const row = document.createElement("div");
        row.className = "drive-item";
        const date = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "saved";
        row.innerHTML =
          '<div>' +
            '<div class="drive-title"></div>' +
            '<div class="drive-meta"></div>' +
            '<div class="drive-preview"></div>' +
          '</div>' +
          '<div class="drive-item-actions">' +
            '<button class="drive-mini" data-action="open">Open</button>' +
            '<button class="drive-mini" data-action="copy">Copy</button>' +
            '<button class="drive-mini danger" data-action="delete">Delete</button>' +
          '</div>';
        row.querySelector(".drive-title").textContent = item.title || "Untitled writing";
        row.querySelector(".drive-meta").textContent = date + " · " + (item.words || 0) + " words";
        row.querySelector(".drive-preview").textContent = item.preview || "No preview";

        row.querySelector('[data-action="open"]').addEventListener("click", () => {
          if (!confirm("Open this writing? Current unsaved changes will be replaced.")) return;
          localStorage.setItem("nw_doc", JSON.stringify(item.doc));
          location.reload();
        });
        row.querySelector('[data-action="copy"]').addEventListener("click", () => {
          const docsNow = readJson(driveKey(), []);
          const copy = {
            ...item,
            id: "d" + Date.now().toString(36),
            title: (item.title || "Untitled writing") + " copy",
            updatedAt: new Date().toISOString()
          };
          docsNow.push(copy);
          writeJson(driveKey(), docsNow);
          renderDrive();
        });
        row.querySelector('[data-action="delete"]').addEventListener("click", () => {
          if (!confirm("Delete this saved writing?")) return;
          writeJson(driveKey(), readJson(driveKey(), []).filter((doc) => doc.id !== item.id));
          renderDrive();
        });

        list.appendChild(row);
      });
  }

  function saveCurrentToDrive() {
    const doc = getCurrentDoc();
    if (!doc) return;

    const docs = readJson(driveKey(), []);
    const now = new Date().toISOString();
    docs.push({
      id: "d" + Date.now().toString(36),
      title: doc.title || "Untitled writing",
      updatedAt: now,
      words: wordCount(doc),
      preview: previewText(doc).slice(0, 180),
      doc
    });
    writeJson(driveKey(), docs);
    renderDrive();
  }

  function openDrive() {
    renderDrive();
    document.getElementById("drive-overlay").classList.add("open");
  }

  function closeDrive() {
    document.getElementById("drive-overlay").classList.remove("open");
  }

  function addHeaderButtons() {
    const group = document.querySelector(".hdr-r");
    if (!group || document.getElementById("drive-btn")) return;

    const drive = document.createElement("button");
    drive.className = "hbtn";
    drive.id = "drive-btn";
    drive.textContent = "▣ Drive";
    drive.addEventListener("click", openDrive);

    const logout = document.createElement("button");
    logout.className = "hbtn";
    logout.id = "logout-btn";
    logout.textContent = "Log out";
    logout.addEventListener("click", () => {
      saveCurrentDocForUser(activeUser());
      localStorage.removeItem(SESSION_KEY);
      lockAuth(true);
      showMessage("Signed out.", false);
    });

    group.prepend(logout);
    group.prepend(drive);
  }

  function setupAuth() {
    const form = document.getElementById("auth-form");
    const create = document.getElementById("auth-create");
    const user = document.getElementById("auth-user");
    const pass = document.getElementById("auth-pass");

    async function handle(mode) {
      const username = normalizeUser(user.value);
      const password = pass.value || "";
      const previousUser = activeUser();
      const isCreate = mode === "create";
      if (!username || !password) {
        showMessage("Enter a username and password.", true);
        return;
      }

      const users = readJson(USERS_KEY, {});
      const hash = await digest(username + ":" + password);

      if (isCreate) {
        if (users[username]) {
          showMessage("That account already exists. Sign in instead.", true);
          return;
        }
        users[username] = { hash, createdAt: new Date().toISOString() };
        writeJson(USERS_KEY, users);
      } else if (!users[username] || users[username].hash !== hash) {
        showMessage("Sign in failed. Check the account details.", true);
        return;
      }

      if (previousUser && previousUser !== username) saveCurrentDocForUser(previousUser);
      loadCurrentDocForUser(username, isCreate);
      writeJson(SESSION_KEY, { user: username, signedInAt: new Date().toISOString() });
      location.reload();
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      handle("signin");
    });
    create.addEventListener("click", () => handle("create"));
  }

  document.addEventListener("DOMContentLoaded", () => {
    const current = activeUser();
    if (current) loadCurrentDocForUser(current, false);
    setupAuth();
    addHeaderButtons();
    lockAuth(!current);
    if (current) {
      window.addEventListener("beforeunload", () => saveCurrentDocForUser(activeUser()));
      setInterval(() => saveCurrentDocForUser(activeUser()), 2000);
    }

    const close = document.getElementById("drive-close");
    const overlay = document.getElementById("drive-overlay");
    const save = document.getElementById("drive-save");
    const refresh = document.getElementById("drive-refresh");

    if (close) close.addEventListener("click", closeDrive);
    if (overlay) overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeDrive();
    });
    if (save) save.addEventListener("click", saveCurrentToDrive);
    if (refresh) refresh.addEventListener("click", renderDrive);
  });
})();
</script>
`;

  if (html.includes("<body>")) {
    return html.replace("<body>", `<body class="auth-locked">\n${injection}`);
  }
  return `${injection}\n${html}`;
}
