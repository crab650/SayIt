(function () {
  'use strict';

  const editor = document.querySelector('#editor');
  const panel = document.querySelector('#editorPanel');
  const dialog = document.querySelector('#aiDialog');
  const previewDialog = document.querySelector('#aiPreviewDialog');
  const action = document.querySelector('#aiAction');
  const languageGroup = document.querySelector('#aiLanguageGroup');
  const polishGroup = document.querySelector('#aiPolishGroup');
  const outputLanguageGroup = document.querySelector('#aiOutputLanguageGroup');
  const apiKey = document.querySelector('#aiApiKey');
  const rememberKey = document.querySelector('#aiRememberKey');
  const model = document.querySelector('#aiModel');
  const settings = document.querySelector('#aiSettings');
  const errorBox = document.querySelector('#aiError');
  const runButton = document.querySelector('#runAi');
  let selection = null;

  const SESSION_KEY = 'sayit-gemini-api-key-session';
  const LOCAL_KEY = 'sayit-gemini-api-key';
  const MODEL_KEY = 'sayit-gemini-model';

  function loadSettings() {
    const remembered = localStorage.getItem(LOCAL_KEY);
    apiKey.value = remembered || sessionStorage.getItem(SESSION_KEY) || '';
    rememberKey.checked = Boolean(remembered);
    model.value = localStorage.getItem(MODEL_KEY) || 'gemini-2.5-flash';
  }

  function saveSettings() {
    const key = apiKey.value.trim();
    if (rememberKey.checked) {
      localStorage.setItem(LOCAL_KEY, key);
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, key);
      localStorage.removeItem(LOCAL_KEY);
    }
    localStorage.setItem(MODEL_KEY, model.value.trim());
  }

  function updateFields() {
    languageGroup.hidden = action.value !== 'translate';
    polishGroup.hidden = action.value !== 'polish';
    outputLanguageGroup.hidden = action.value === 'translate';
  }

  function setError(message = '') {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  document.querySelector('#aiButton').addEventListener('click', () => {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (start === end) {
      editor.focus();
      window.alert('請先在編輯器中選取要處理的文字。');
      return;
    }
    selection = { start, end, text: editor.value.slice(start, end), tabId: localStorage.getItem('sayit-active-tab-id-v2') };
    document.querySelector('#aiSelectionSummary').textContent = `已選取 ${[...selection.text].length.toLocaleString()} 個字元`;
    const isCode = panel.dataset.language && panel.dataset.language !== 'text';
    action.value = isCode ? 'comment' : 'translate';
    loadSettings();
    updateFields();
    setError();
    settings.hidden = Boolean(apiKey.value);
    dialog.showModal();
  });

  action.addEventListener('change', updateFields);
  apiKey.addEventListener('input', () => {
    if (!apiKey.value) {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LOCAL_KEY);
      rememberKey.checked = false;
    }
  });
  document.querySelector('#aiSettingsToggle').addEventListener('click', () => { settings.hidden = !settings.hidden; });
  document.querySelector('#cancelAi').addEventListener('click', () => dialog.close());
  document.querySelector('#cancelAiPreview').addEventListener('click', () => previewDialog.close());

  runButton.addEventListener('click', async () => {
    if (!selection) return;
    if (!apiKey.value.trim()) {
      settings.hidden = false;
      setError('請先輸入 Gemini API Key。');
      apiKey.focus();
      return;
    }
    saveSettings();
    setError();
    runButton.disabled = true;
    runButton.textContent = '處理中…';
    try {
      const result = await window.SayItAI.processText({
        action: action.value,
        text: selection.text,
        targetLanguage: document.querySelector('#aiTargetLanguage').value,
        polishStyle: document.querySelector('#aiPolishStyle').value,
        outputLanguage: document.querySelector('#aiOutputLanguage').value,
        codeLanguage: panel.dataset.language,
        apiKey: apiKey.value,
        model: model.value
      });
      document.querySelector('#aiOriginal').value = selection.text;
      document.querySelector('#aiResult').value = result;
      dialog.close();
      previewDialog.showModal();
    } catch (error) {
      setError(error.message || 'AI 處理失敗。');
    } finally {
      runButton.disabled = false;
      runButton.textContent = '開始處理';
    }
  });

  document.querySelector('#copyAiResult').addEventListener('click', async () => {
    const result = document.querySelector('#aiResult');
    try { await navigator.clipboard.writeText(result.value); }
    catch { result.select(); document.execCommand('copy'); }
  });

  document.querySelector('#applyAiResult').addEventListener('click', () => {
    if (!selection || localStorage.getItem('sayit-active-tab-id-v2') !== selection.tabId) {
      previewDialog.close();
      window.alert('分頁已經變更，為避免覆蓋錯誤位置，請重新選取文字。');
      return;
    }
    const currentText = editor.value.slice(selection.start, selection.end);
    if (currentText !== selection.text) {
      previewDialog.close();
      window.alert('原文已經變更，為避免覆蓋新內容，請重新選取文字。');
      return;
    }
    const result = document.querySelector('#aiResult').value;
    editor.setRangeText(result, selection.start, selection.end, 'select');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    previewDialog.close();
    editor.focus();
    selection = null;
  });

  loadSettings();
  updateFields();
}());
