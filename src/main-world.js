// Roda no "mundo principal" da pagina (mesmo contexto do JS da OLX).
// Objetivo: interceptar window.open do botao de chat e avisar o content script,
// em vez de deixar abrir uma janela nova.

(() => {
  'use strict';
  if (window.__olxInlineChatMainWorld) return;
  window.__olxInlineChatMainWorld = true;

  const CHAT_HOST = 'chat.olx.com.br';
  const SOURCE = 'olx-inline-chat';

  const post = (payload) => {
    try {
      window.postMessage({ source: SOURCE, ...payload }, location.origin);
    } catch (_) {}
  };

  // --- window.open -----------------------------------------------------------
  const nativeOpen = window.open;

  // Janela "de mentira" devolvida para o codigo da OLX, para ele nao quebrar ao
  // chamar .focus() / .close() no retorno.
  const stubWindow = () => ({
    closed: false,
    focus() {},
    blur() {},
    close() {},
    postMessage() {},
    document: null,
  });

  window.open = function (url, ...rest) {
    try {
      const raw = String(url ?? '');
      if (raw.includes(CHAT_HOST)) {
        post({ type: 'open-chat', url: new URL(raw, location.href).href });
        return stubWindow();
      }
    } catch (_) {}
    return nativeOpen.apply(window, [url, ...rest]);
  };

  // --- navegacao SPA (Next.js troca de anuncio sem recarregar) ---------------
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      post({ type: 'navigated', url: location.href });
      return result;
    };
  }
  window.addEventListener('popstate', () => post({ type: 'navigated', url: location.href }));
})();
