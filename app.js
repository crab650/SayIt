const editor = document.querySelector('#editor');
const editorEyebrow = document.querySelector('#editorEyebrow');
const saveState = document.querySelector('#saveState');
const saveStateText = document.querySelector('#saveState .state-text');
const charCount = document.querySelector('#charCount');
const wordCount = document.querySelector('#wordCount');
const toast = document.querySelector('#toast');
const tabsContainer = document.querySelector('#tabsContainer');
const highlightLayer = document.querySelector('#highlightLayer');
const markdownPreview = document.querySelector('#markdownPreview');
const markdownViewSwitch = document.querySelector('#markdownViewSwitch');

const THEME_KEY = 'sayit-theme';
const TABS_KEY = 'sayit-custom-tabs-v2';
const ACTIVE_TAB_KEY = 'sayit-active-tab-id-v2';

let activeTabId = '';
let saveTimer, toastTimer;

const PRESET_COLORS = [
  '#df5b3f', // Terracotta
  '#75a66f', // Sage Green
  '#d8a348', // Ochre
  '#5c85b5', // Muted Blue
  '#9b6bb5', // Lavender
  '#e06c9f', // Rose
  '#4ea5a0'  // Slate Teal
];

const DEFAULT_TABS = [
  { id: 'thoughts', name: '我的想法', color: '#df5b3f', eyebrow: 'YOUR QUIET CORNER', placeholder: '寫點什麼吧…' },
  { id: 'phrases', name: '每日句子', color: '#75a66f', eyebrow: 'DAILY SENTENCES', placeholder: '寫下今天想記住的句子…' }
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const LANGUAGES = new Set(['text', 'markdown', 'python', 'sql', 'typescript', 'csharp']);
const CODE_THEMES = new Set(['midnight', 'forest', 'paper']);
const EXTENSIONS = { text: 'txt', markdown: 'md', python: 'py', sql: 'sql', typescript: 'ts', csharp: 'cs' };
let markdownView = localStorage.getItem('sayit-markdown-view') || 'edit';
if (!['edit', 'preview', 'split'].includes(markdownView)) markdownView = 'edit';

function updateMarkdownPreview() {
  markdownPreview.innerHTML = window.SayItMarkdown.render(editor.value);
}

function applyMarkdownView() {
  const tab = tabs.find(t => t.id === activeTabId);
  const isMarkdown = tab?.language === 'markdown';
  markdownViewSwitch.hidden = !isMarkdown;
  document.querySelector('#editorPanel').dataset.markdownView = isMarkdown ? markdownView : '';
  markdownViewSwitch.querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.view === markdownView));
  if (isMarkdown) updateMarkdownPreview();
}

function normalizeTabs(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_TABS.map(tab => ({ ...tab }));
  }
  const normalized = value.filter(tab => tab && typeof tab === 'object').map((tab, index) => ({
    id: typeof tab.id === 'string' && tab.id ? tab.id : `recovered-${index}-${Date.now()}`,
    name: typeof tab.name === 'string' && tab.name.trim() ? tab.name.trim().slice(0, 10) : `分頁 ${index + 1}`,
    color: typeof tab.color === 'string' && HEX_COLOR_PATTERN.test(tab.color) ? tab.color.toLowerCase() : PRESET_COLORS[index % PRESET_COLORS.length],
    eyebrow: typeof tab.eyebrow === 'string' ? tab.eyebrow.slice(0, 25) : '',
    placeholder: typeof tab.placeholder === 'string' ? tab.placeholder : '開始寫作…',
    language: LANGUAGES.has(tab.language) ? tab.language : 'text',
    codeTheme: CODE_THEMES.has(tab.codeTheme) ? tab.codeTheme : 'midnight'
  }));
  return normalized.length ? normalized : DEFAULT_TABS.map(tab => ({ ...tab }));
}

let tabs;
try {
  const stored = localStorage.getItem(TABS_KEY);
  tabs = normalizeTabs(stored ? JSON.parse(stored) : DEFAULT_TABS);
} catch {
  tabs = normalizeTabs(DEFAULT_TABS);
}

function getStorageKey(tabId) {
  if (tabId === 'thoughts') return 'sayit-content-v1';
  if (tabId === 'phrases') return 'sayit-daily-v1';
  return `sayit-tab-content-${tabId}`;
}

function loadTabContent(tabId) {
  const key = getStorageKey(tabId);
  const saved = localStorage.getItem(key);
  if (saved !== null) {
    return saved;
  }
  
  if (tabId === 'thoughts') {
    return `# 歡迎使用 Say It\n\n這是一個安靜、隨意、會自動儲存的寫作空間。在這裡，沒有多餘的干擾，只有你和此刻的想法。\n\n💡 **使用小技巧**：\n- **自動存檔**：當你停止輸入 450 毫秒後，系統會自動在後台存檔。\n- **插入時間**：按下鍵盤上的 \`F5\` 鍵，可以立刻插入當前時間戳記。\n- **管理分頁**：將滑鼠移到上方分頁，點擊出現的 ⚙️ 圖示即可自訂顏色或重命名。`;
  }
  
  // Fallback compatibility logic for original phrases tab
  if (tabId === 'phrases') {
    const legacy = localStorage.getItem('sayit-phrases-v1');
    if (legacy) {
      try {
        const old = JSON.parse(legacy);
        if (old.length > 0) {
          return old.map(item => [item.date, item.context, item.zh, item.en, item.vi].filter(Boolean).join(' — ')).join('\n');
        }
      } catch (e) {
        // ignore and use default
      }
    }
    return `「做你愛做的事，並把它做好。」 — 賈伯斯\n\n「生活就像騎自行車，為了保持平衡，你必須不斷前進。」 — 愛因斯坦`;
  }
  return '';
}

function updateStats() {
  const text = editor.value;
  charCount.textContent = `${[...text].filter(c => !(/\s/u.test(c))).length} 字`;
  const latin = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || [];
  const han = text.match(/[\p{Script=Han}]/gu) || [];
  wordCount.textContent = `${latin.length + han.length} 詞`;
}

const TOKEN_RULES = {
  python: /#[^\n]*|(?:'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield)\b|\b\d+(?:\.\d+)?\b/g,
  sql: /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\b(?:select|from|where|insert|into|update|delete|create|alter|drop|table|join|inner|left|right|on|as|and|or|not|null|is|in|exists|group|by|order|having|limit|offset|values|set|case|when|then|else|end|distinct|union|all|primary|key|foreign|references)\b|\b\d+(?:\.\d+)?\b/gi,
  typescript: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b(?:any|as|async|await|boolean|break|case|catch|class|const|continue|default|delete|else|enum|export|extends|false|finally|for|from|function|if|implements|import|in|instanceof|interface|keyof|let|never|new|null|number|object|of|private|protected|public|readonly|return|static|string|super|switch|this|throw|true|try|type|typeof|undefined|unknown|var|void|while|yield)\b|\b\d+(?:\.\d+)?\b/g,
  csharp: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|@?"(?:""|\\.|[^"\\])*"|'(?:\\.|[^'\\])'|\b(?:abstract|as|async|await|base|bool|break|byte|case|catch|char|class|const|continue|decimal|default|delegate|do|double|else|enum|event|false|finally|float|for|foreach|get|if|in|int|interface|internal|is|lock|long|namespace|new|null|object|out|override|params|private|protected|public|readonly|record|ref|required|return|sealed|set|short|static|string|struct|switch|this|throw|true|try|typeof|uint|ulong|using|var|virtual|void|while)\b|\b\d+(?:\.\d+)?\b/g
};

function escapeHtml(value) {
  return value.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}

function updateHighlight() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab || !TOKEN_RULES[tab.language]) return void (highlightLayer.textContent = '');
  const source = TOKEN_RULES[tab.language];
  const regex = new RegExp(source.source, source.flags);
  let output = '', cursor = 0;
  for (const match of editor.value.matchAll(regex)) {
    output += escapeHtml(editor.value.slice(cursor, match.index));
    const token = match[0];
    const kind = /^(#|\/\/|--|\/\*)/.test(token) ? 'comment' : /^(?:['"`]|@")/.test(token) ? 'string' : /^\d/.test(token) ? 'number' : 'keyword';
    output += `<span class="token-${kind}">${escapeHtml(token)}</span>`;
    cursor = match.index + token.length;
  }
  highlightLayer.innerHTML = output + escapeHtml(editor.value.slice(cursor)) + '\n';
}

function saveCurrentContent() {
  if (!activeTabId) return;
  localStorage.setItem(getStorageKey(activeTabId), editor.value);
  saveState.classList.remove('saving');
  saveStateText.textContent = '已儲存';
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function renderTabs() {
  tabsContainer.replaceChildren(...tabs.map((tab, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const button = document.createElement('button');
    button.className = 'page-tab';
    button.classList.toggle('active', tab.id === activeTabId);
    button.dataset.id = tab.id;
    button.style.setProperty('--tab-accent', tab.color);
    const number = document.createElement('span');
    number.className = 'tab-number';
    number.textContent = num;
    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = tab.name;
    const edit = document.createElement('span');
    edit.className = 'tab-edit';
    edit.title = '編輯分頁';
    edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
    button.append(number, name, edit);
    return button;
  }));
}

function switchTab(tabId, { saveCurrent = true } = {}) {
  // Save current active tab first
  if (saveCurrent) saveCurrentContent();

  activeTabId = tabId;
  localStorage.setItem(ACTIVE_TAB_KEY, tabId);

  const tab = tabs.find(t => t.id === tabId) || tabs[0];
  
  // Set theme accent color dynamically
  document.documentElement.style.setProperty('--accent', tab.color);

  // Load content
  editor.value = loadTabContent(tab.id);
  editor.placeholder = tab.placeholder || '寫點什麼吧…';
  editorEyebrow.textContent = tab.eyebrow || tab.name.toUpperCase();
  const isCode = !['text', 'markdown'].includes(tab.language);
  document.querySelector('#editorPanel').classList.toggle('code-mode', isCode);
  document.querySelector('#editorPanel').dataset.codeTheme = tab.codeTheme;
  document.querySelector('#editorPanel').dataset.language = tab.language;
  editor.spellcheck = !isCode;
  updateHighlight();
  applyMarkdownView();

  // Update tabs highlight
  document.querySelectorAll('.page-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id === tab.id);
  });

  updateStats();
  setTimeout(() => editor.focus(), 0);
}

// Event Delegation for dynamic tabs
tabsContainer.onclick = (e) => {
  const tabButton = e.target.closest('.page-tab');
  if (!tabButton) return;

  const tabId = tabButton.dataset.id;
  const isEditClick = e.target.closest('.tab-edit');

  if (isEditClick) {
    e.stopPropagation();
    openTabDialog(tabId);
  } else {
    if (tabId !== activeTabId) {
      switchTab(tabId);
    }
  }
};

// Editor Input Listener
editor.addEventListener('input', () => {
  updateStats();
  updateHighlight();
  if (tabs.find(t => t.id === activeTabId)?.language === 'markdown') updateMarkdownPreview();
  saveState.classList.add('saving');
  saveStateText.textContent = '儲存中';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveCurrentContent(), 450);
});

// Copy Action
document.querySelector('#copyButton').addEventListener('click', async () => {
  if (!editor.value) return showToast('還沒有內容');
  try {
    await navigator.clipboard.writeText(editor.value);
    showToast('已複製到剪貼簿');
  } catch {
    editor.select();
    document.execCommand('copy');
    showToast('已複製到剪貼簿');
  }
});

// Export/Download Action
document.querySelector('#downloadButton').addEventListener('click', () => {
  if (!editor.value) return showToast('還沒有內容');
  const currentTab = tabs.find(t => t.id === activeTabId) || { name: 'sayit' };
  const blob = new Blob([editor.value], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `say-it-${currentTab.name}-${new Date().toISOString().slice(0, 10)}.${EXTENSIONS[currentTab.language] || 'txt'}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
  showToast('文字檔已匯出');
});

// Clear Text Dialog
const clearDialog = document.querySelector('#clearDialog');
document.querySelector('#clearButton').onclick = () => editor.value && clearDialog.showModal();
document.querySelector('#cancelClear').onclick = () => clearDialog.close();
document.querySelector('#confirmClear').onclick = () => {
  editor.value = '';
  saveCurrentContent();
  updateStats();
  updateHighlight();
  if (tabs.find(t => t.id === activeTabId)?.language === 'markdown') updateMarkdownPreview();
  clearDialog.close();
  editor.focus();
  showToast('內容已清除');
};

markdownViewSwitch.onclick = event => {
  const button = event.target.closest('button[data-view]');
  if (!button) return;
  markdownView = button.dataset.view;
  localStorage.setItem('sayit-markdown-view', markdownView);
  applyMarkdownView();
  if (markdownView !== 'preview') editor.focus();
};

// Tab configuration Dialog
const tabDialog = document.querySelector('#tabDialog');
const tabNameInput = document.querySelector('#tabNameInput');
const tabEyebrowInput = document.querySelector('#tabEyebrowInput');
const tabLanguageInput = document.querySelector('#tabLanguageInput');
const tabCodeThemeInput = document.querySelector('#tabCodeThemeInput');
const codeThemeGroup = document.querySelector('#codeThemeGroup');
const tabColorInput = document.querySelector('#tabColorInput');
const colorHexLabel = document.querySelector('#colorHexLabel');
const tabDialogTitle = document.querySelector('#tabDialogTitle');
const tabDialogTitleMark = document.querySelector('#tabDialogTitleMark');
const deleteTabButton = document.querySelector('#deleteTabButton');
const colorPresetsContainer = document.querySelector('#colorPresets');
let editingTabId = null;

function updateCodeOptions() {
  codeThemeGroup.hidden = ['text', 'markdown'].includes(tabLanguageInput.value);
}
tabLanguageInput.onchange = updateCodeOptions;

function initColorPresets() {
  colorPresetsContainer.innerHTML = PRESET_COLORS.map(color => `
    <button type="button" class="color-preset" style="background-color: ${color};" data-color="${color}" aria-label="顏色 ${color}"></button>
  `).join('');

  colorPresetsContainer.querySelectorAll('.color-preset').forEach(btn => {
    btn.onclick = () => {
      colorPresetsContainer.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tabColorInput.value = btn.dataset.color;
      colorHexLabel.textContent = btn.dataset.color.toUpperCase();
      tabDialog.style.setProperty('--accent', btn.dataset.color);
    };
  });
}

tabColorInput.oninput = (e) => {
  const val = e.target.value;
  colorHexLabel.textContent = val.toUpperCase();
  tabDialog.style.setProperty('--accent', val);
  colorPresetsContainer.querySelectorAll('.color-preset').forEach(b => {
    b.classList.toggle('active', b.dataset.color.toLowerCase() === val.toLowerCase());
  });
};

function openTabDialog(tabId = null) {
  editingTabId = tabId;
  if (tabId) {
    const tab = tabs.find(t => t.id === tabId);
    tabNameInput.value = tab.name;
    tabEyebrowInput.value = tab.eyebrow || '';
    tabColorInput.value = tab.color;
    tabLanguageInput.value = tab.language || 'text';
    tabCodeThemeInput.value = tab.codeTheme || 'midnight';
    colorHexLabel.textContent = tab.color.toUpperCase();
    tabDialogTitle.textContent = '編輯分頁';
    tabDialogTitleMark.textContent = '✎';
    deleteTabButton.style.display = 'block';
  } else {
    tabNameInput.value = '';
    tabEyebrowInput.value = '';
    tabLanguageInput.value = 'text';
    tabCodeThemeInput.value = 'midnight';
    const randomColor = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
    tabColorInput.value = randomColor;
    colorHexLabel.textContent = randomColor.toUpperCase();
    tabDialogTitle.textContent = '新增分頁';
    tabDialogTitleMark.textContent = '+';
    deleteTabButton.style.display = 'none';
  }

  colorPresetsContainer.querySelectorAll('.color-preset').forEach(b => {
    b.classList.toggle('active', b.dataset.color.toLowerCase() === tabColorInput.value.toLowerCase());
  });
  tabDialog.style.setProperty('--accent', tabColorInput.value);
  updateCodeOptions();

  tabDialog.showModal();
}

document.querySelector('#addTabButton').onclick = () => openTabDialog();
document.querySelector('#cancelTab').onclick = () => tabDialog.close();

document.querySelector('#saveTab').onclick = (e) => {
  e.preventDefault();
  const name = tabNameInput.value.trim();
  if (!name) {
    showToast('請輸入分頁名稱');
    return;
  }
  const eyebrow = tabEyebrowInput.value.trim().toUpperCase() || name.toUpperCase();
  const color = tabColorInput.value;

  if (editingTabId) {
    const tab = tabs.find(t => t.id === editingTabId);
    if (tab) {
      tab.name = name;
      tab.eyebrow = eyebrow;
      tab.color = color;
      tab.language = tabLanguageInput.value;
      tab.codeTheme = tabCodeThemeInput.value;
    }
    showToast('分頁已更新');
  } else {
    const newId = 'tab-' + Date.now();
    const newTab = {
      id: newId,
      name: name,
      color: color,
      eyebrow: eyebrow,
      placeholder: '開始寫作…',
      language: tabLanguageInput.value,
      codeTheme: tabCodeThemeInput.value
    };
    tabs.push(newTab);
    editingTabId = newId;
    showToast('已新增分頁');
  }

  localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
  renderTabs();
  switchTab(editingTabId);
  tabDialog.close();
};

deleteTabButton.onclick = () => {
  if (!editingTabId) return;
  if (tabs.length <= 1) {
    showToast('必須保留至少一個分頁');
    return;
  }

  const index = tabs.findIndex(t => t.id === editingTabId);
  if (index !== -1) {
    const deletedId = editingTabId;
    tabs.splice(index, 1);
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
    localStorage.removeItem(getStorageKey(deletedId));

    if (activeTabId === deletedId) {
      const nextActiveIndex = Math.min(index, tabs.length - 1);
      switchTab(tabs[nextActiveIndex].id, { saveCurrent: false });
    }
    renderTabs();
    showToast('分頁已刪除');
    tabDialog.close();
  }
};

// Theme Switching
const preferred = localStorage.getItem(THEME_KEY) || ((matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');
document.documentElement.dataset.theme = preferred;
const metaThemeColor = document.querySelector('meta[name="theme-color"]');
if (metaThemeColor) {
  metaThemeColor.content = preferred === 'dark' ? '#181a17' : '#f4f0e8';
}
document.querySelector('#themeButton').onclick = () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  if (metaThemeColor) {
    metaThemeColor.content = next === 'dark' ? '#181a17' : '#f4f0e8';
  }
};

// Date-Time Insertion
function insertDateTime() {
  const now = new Date(), pad = value => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const start = editor.selectionStart, end = editor.selectionEnd;
  editor.setRangeText(stamp, start, end, 'end');
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.focus();
  showToast('已插入日期時間');
}

document.addEventListener('keydown', e => {
  const currentTab = tabs.find(t => t.id === activeTabId);
  if (e.key === 'Tab' && document.activeElement === editor && TOKEN_RULES[currentTab?.language]) {
    e.preventDefault();
    editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (e.key === 'F5' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    insertDateTime();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveCurrentContent();
    showToast('已儲存');
  }
});

// Lifecycle and Service Worker
window.addEventListener('beforeunload', saveCurrentContent);
editor.addEventListener('scroll', () => {
  highlightLayer.scrollTop = editor.scrollTop;
  highlightLayer.scrollLeft = editor.scrollLeft;
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

// Initial Run
initColorPresets();
renderTabs();

const lastActiveTabId = localStorage.getItem(ACTIVE_TAB_KEY) || 'thoughts';
switchTab(tabs.some(t => t.id === lastActiveTabId) ? lastActiveTabId : tabs[0].id);
