(function () {
  'use strict';

  const escapeHtml = value => value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function safeUrl(value, image = false) {
    const url = value.trim();
    if (/^(https?:|mailto:|tel:)/i.test(url) || (image && /^data:image\/(?:png|gif|jpe?g|webp);base64,/i.test(url))) {
      return escapeHtml(url);
    }
    if (/^(?:[./#]|$)/.test(url)) return escapeHtml(url);
    return '#';
  }

  function inline(source) {
    let text = escapeHtml(source);
    const code = [];
    text = text.replace(/`([^`\n]+)`/g, (_, value) => `\u0000${code.push(`<code>${value}</code>`) - 1}\u0000`);
    text = text.replace(/!\[([^\]]*)\]\((\S+?)(?:\s+["'][^"']*["'])?\)/g, (_, alt, url) => `<img src="${safeUrl(url, true)}" alt="${alt}" loading="lazy">`);
    text = text.replace(/\[([^\]]+)\]\((\S+?)(?:\s+["'][^"']*["'])?\)/g, (_, label, url) => `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    text = text.replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, '<strong>$1$2</strong>');
    text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*|(^|[^_])_([^_\n]+)_/g, '$1$3<em>$2$4</em>');
    return text.replace(/\u0000(\d+)\u0000/g, (_, index) => code[Number(index)]);
  }

  function render(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    const html = [];
    let paragraph = [], list = null, quote = [], fence = null;
    const flushParagraph = () => { if (paragraph.length) html.push(`<p>${inline(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`); paragraph = []; };
    const flushList = () => { if (list) html.push(`</${list}>`); list = null; };
    const flushQuote = () => { if (quote.length) html.push(`<blockquote>${inline(quote.join('\n')).replace(/\n/g, '<br>')}</blockquote>`); quote = []; };
    const flush = () => { flushParagraph(); flushList(); flushQuote(); };

    for (const line of lines) {
      if (fence) {
        if (/^\s*```/.test(line)) { html.push(`<pre><code${fence.lang ? ` class="language-${fence.lang}"` : ''}>${escapeHtml(fence.lines.join('\n'))}</code></pre>`); fence = null; }
        else fence.lines.push(line);
        continue;
      }
      const fenceMatch = line.match(/^\s*```([\w+-]*)\s*$/);
      if (fenceMatch) { flush(); fence = { lang: escapeHtml(fenceMatch[1]), lines: [] }; continue; }
      if (!line.trim()) { flush(); continue; }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) { flush(); const level = heading[1].length; html.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
      if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) { flush(); html.push('<hr>'); continue; }
      const quoteMatch = line.match(/^>\s?(.*)$/);
      if (quoteMatch) { flushParagraph(); flushList(); quote.push(quoteMatch[1]); continue; }
      const item = line.match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
      if (item) {
        flushParagraph(); flushQuote();
        const type = /^\d/.test(item[1]) ? 'ol' : 'ul';
        if (list !== type) { flushList(); html.push(`<${type}>`); list = type; }
        const task = item[2].match(/^\[([ xX])\]\s+(.*)$/);
        html.push(task ? `<li class="task"><input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${inline(task[2])}</li>` : `<li>${inline(item[2])}</li>`);
        continue;
      }
      flushList(); flushQuote(); paragraph.push(line);
    }
    if (fence) html.push(`<pre><code${fence.lang ? ` class="language-${fence.lang}"` : ''}>${escapeHtml(fence.lines.join('\n'))}</code></pre>`);
    flush();
    return html.join('');
  }

  window.SayItMarkdown = { render };
}());
