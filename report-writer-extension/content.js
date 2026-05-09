let keyboard;
let activeTarget = null;

document.addEventListener("focusin", (event) => {
  if (isEditable(event.target)) activeTarget = event.target;
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "toggle-keyboard") toggleKeyboard();
});

function isEditable(element) {
  if (!element) return false;
  const tag = element.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || element.isContentEditable;
}

function toggleKeyboard() {
  if (!keyboard) createKeyboard();
  keyboard.classList.toggle("hidden");
}

function createKeyboard() {
  keyboard = document.createElement("div");
  keyboard.id = "assistive-keyboard";
  keyboard.innerHTML = `
    <div class="ak-header">
      <strong>REPORT KEYBOARD</strong>
      <button id="ak-close">x</button>
    </div>
    <div class="ak-preds">
      <button>the</button>
      <button>and</button>
      <button>report</button>
      <button>result</button>
    </div>
    <div id="ak-keys"></div>
  `;

  document.body.appendChild(keyboard);

  document.getElementById("ak-close").onclick = () => {
    keyboard.classList.add("hidden");
  };

  keyboard.querySelectorAll(".ak-preds button").forEach((button) => {
    button.onclick = () => insertText(button.textContent + " ");
  });

  buildKeys();
}

function buildKeys() {
  const keys = document.getElementById("ak-keys");
  const rows = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m", ".", ","],
    ["BACK", "SPACE", "ENTER"]
  ];

  rows.forEach((row) => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "ak-row";

    row.forEach((key) => {
      const button = document.createElement("button");
      button.textContent = key;
      button.onclick = () => handleKey(key);
      rowDiv.appendChild(button);
    });

    keys.appendChild(rowDiv);
  });
}

function handleKey(key) {
  if (key === "SPACE") insertText(" ");
  else if (key === "ENTER") insertText("\n");
  else if (key === "BACK") backspace();
  else insertText(key);
}

function insertText(text) {
  if (!activeTarget || !isEditable(activeTarget)) {
    activeTarget = document.activeElement;
  }

  if (!isEditable(activeTarget)) return;
  activeTarget.focus();

  if (activeTarget.isContentEditable) {
    document.execCommand("insertText", false, text);
    return;
  }

  const start = activeTarget.selectionStart ?? activeTarget.value.length;
  const end = activeTarget.selectionEnd ?? activeTarget.value.length;
  const value = activeTarget.value;

  activeTarget.value = value.slice(0, start) + text + value.slice(end);

  const pos = start + text.length;
  activeTarget.selectionStart = pos;
  activeTarget.selectionEnd = pos;
  activeTarget.dispatchEvent(new Event("input", { bubbles: true }));
}

function backspace() {
  if (!activeTarget || !isEditable(activeTarget)) return;
  activeTarget.focus();

  if (activeTarget.isContentEditable) {
    document.execCommand("delete", false);
    return;
  }

  const start = activeTarget.selectionStart ?? activeTarget.value.length;
  const end = activeTarget.selectionEnd ?? activeTarget.value.length;

  if (start === end && start > 0) {
    activeTarget.value =
      activeTarget.value.slice(0, start - 1) +
      activeTarget.value.slice(end);
    activeTarget.selectionStart = start - 1;
    activeTarget.selectionEnd = start - 1;
  } else {
    activeTarget.value =
      activeTarget.value.slice(0, start) +
      activeTarget.value.slice(end);
    activeTarget.selectionStart = start;
    activeTarget.selectionEnd = start;
  }

  activeTarget.dispatchEvent(new Event("input", { bubbles: true }));
}
