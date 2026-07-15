(function () {
  'use strict';

  const MAX_INPUT_LENGTH = 30000;

  function buildPrompt({ action, text, targetLanguage, polishStyle, outputLanguage, codeLanguage }) {
    const common = 'Return only the transformed text. Do not add introductions, explanations, markdown fences, or surrounding quotes. Preserve paragraphs and meaningful formatting.';
    const requestedOutputLanguage = outputLanguage || 'Traditional Chinese';

    if (action === 'translate') {
      return `${common}\nTranslate the content into ${targetLanguage}. Detect the source language automatically. Preserve code, names, numbers, and technical terms accurately.\n\nCONTENT:\n${text}`;
    }
    if (action === 'polish') {
      const styles = {
        natural: 'Make the writing natural and fluent',
        formal: 'Make the writing formal and professional',
        concise: 'Make the writing concise and clear',
        proofread: 'Only correct grammar, spelling, punctuation, and typos'
      };
      return `${common}\n${styles[polishStyle] || styles.natural}. Write the complete result in ${requestedOutputLanguage}. Keep the original meaning and do not invent facts. If translation is needed to satisfy the requested output language, translate accurately.\n\nCONTENT:\n${text}`;
    }
    return `${common}\nAdd useful, concise comments written in ${requestedOutputLanguage} to this ${codeLanguage || 'source'} code. Preserve behavior, indentation, identifiers, string values, and all existing code. Use the language's native comment syntax. Do not over-comment obvious lines. All newly added comments must use ${requestedOutputLanguage}.\n\nCODE:\n${text}`;
  }

  async function processText(options) {
    const key = options.apiKey && options.apiKey.trim();
    const model = (options.model || 'gemini-2.5-flash').trim();
    const text = options.text || '';
    if (!key) throw new Error('請先輸入 Gemini API Key。');
    if (!text.trim()) throw new Error('請先選取要處理的文字。');
    if (text.length > MAX_INPUT_LENGTH) throw new Error(`選取內容不可超過 ${MAX_INPUT_LENGTH.toLocaleString()} 個字元。`);
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('模型名稱格式不正確。');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(options) }] }],
          generationConfig: { temperature: options.action === 'translate' ? 0.15 : 0.35 }
        }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.error?.message || `Gemini API 發生錯誤（${response.status}）`;
        if (response.status === 429) throw new Error('Gemini 免費額度暫時用完或請求太頻繁，請稍後再試。');
        if (response.status === 401 || response.status === 403) throw new Error('API Key 無效、權限不足，或此 Key 不允許從目前網站使用。');
        throw new Error(message);
      }
      const result = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
      if (!result) throw new Error('Gemini 沒有回傳文字，內容可能被安全機制阻擋。');
      return result.replace(/^```(?:\w+)?\s*\n?/, '').replace(/\n?```$/, '');
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Gemini 回應逾時，請稍後再試。');
      if (error instanceof TypeError) throw new Error('無法連線到 Gemini，請檢查網路或瀏覽器連線限制。');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  window.SayItAI = { processText, MAX_INPUT_LENGTH };
}());
