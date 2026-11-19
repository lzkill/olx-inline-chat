// Content script (mundo isolado): monta o painel lateral com o chat da OLX
// dentro da pagina do anuncio e tambem nas paginas de listagem/busca.

(() => {
  'use strict';
  if (window.__olxInlineChat) return;
  window.__olxInlineChat = true;

  const CHAT_HOST = 'chat.olx.com.br';
  const SOURCE = 'olx-inline-chat';
  const STORAGE_KEY = 'olxInlineChat';
  const MIN_WIDTH = 320;
  const MAX_WIDTH = 900;
  const DEFAULT_WIDTH = 440;
  const RECLAIM_DELAY = 90000;

  let prefs = { open: false, width: DEFAULT_WIDTH };
  let pageListId = null;   // anuncio desta pagina (null em listagens)
  let activeId = null;     // anuncio que o painel esta mostrando
  let activeTitle = '';    // titulo do anuncio aberto, quando conhecido
  let followPage = true;   // o painel acompanha a navegacao da pagina?
  let mode = 'ad';         // 'ad' = conversa do anuncio | 'all' = lista completa
  let ui = null;

  // --------------------------------------------------------------- utilidades

  const adChatUrl = (id) =>
    id ? `https://${CHAT_HOST}/?list-id=${encodeURIComponent(id)}` : `https://${CHAT_HOST}/`;

  const panelUrl = () => (mode === 'all' ? `https://${CHAT_HOST}/` : adChatUrl(activeId));

  // Extrai o id do anuncio do fim do slug, ignorando query/hash:
  // /.../ps4-pro-desbloqueado-...-1553600647?lis=listing_no_category -> 1553600647
  function adIdFromUrl(href) {
    try {
      const url = new URL(href, location.href);
      if (!/(^|\.)olx\.com\.br$/.test(url.hostname)) return null;
      const segment = url.pathname.replace(/\/+$/, '').split('/').pop() || '';
      const match = segment.match(/(?:^|-)(\d{6,})$/);
      return match ? match[1] : null;
    } catch (_) {
      return null;
    }
  }

  function detectListId() {
    // 1) link de chat que a propria pagina renderiza (fonte mais confiavel)
    for (const a of document.querySelectorAll(`a[href*="${CHAT_HOST}"]`)) {
      try {
        const id = new URL(a.href, location.href).searchParams.get('list-id');
        if (id) return id;
      } catch (_) {}
    }
    // 2) list-id na propria URL
    const fromQuery = location.search.match(/[?&]list-id=(\d+)/);
    if (fromQuery) return fromQuery[1];
    // 3) id no fim do slug da pagina do anuncio
    return adIdFromUrl(location.href);
  }

  async function loadPrefs() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      Object.assign(prefs, stored[STORAGE_KEY] || {});
    } catch (_) {}
    prefs.width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, prefs.width || DEFAULT_WIDTH));
  }

  let saveTimer = null;
  function savePrefs() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      // Quando a extensao e recarregada (ou atualizada/desativada) com esta aba
      // aberta, o content script antigo continua vivo mas perde a ponte com ela.
      // Ai chrome.storage lanca "Extension context invalidated" de forma SINCRONA,
      // antes de existir promise — por isso .catch() nao segurava, e a excecao
      // escapava de dentro do setTimeout.
      try {
        if (!chrome.runtime?.id) return;
        const done = chrome.storage.local.set({ [STORAGE_KEY]: prefs });
        if (done && typeof done.catch === 'function') done.catch(() => {});
      } catch (_) {}
    }, 150);
  }

  // ---------------------------------------------------------------------- UI

  const STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }

    .launcher {
      position: fixed; right: 18px; bottom: 18px; z-index: 1;
      padding: 10px 16px; border: 0; border-radius: 999px;
      background: #6e0ad6; color: #fff; font-size: 14px; font-weight: 600;
      cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.28);
    }
    .launcher:hover { background: #5a08b0; }
    .launcher[hidden] { display: none !important; }

    /* botao que segue o card sob o mouse nas paginas de listagem */
    .hover-btn {
      position: fixed; top: 0; left: 0; z-index: 2;
      padding: 6px 10px; border: 0; border-radius: 999px;
      background: #6e0ad6; color: #fff; font-size: 12px; font-weight: 600;
      line-height: 1; cursor: pointer; white-space: nowrap;
      box-shadow: 0 3px 10px rgba(0,0,0,.3);
    }
    .hover-btn:hover { background: #5a08b0; }
    .hover-btn[hidden] { display: none !important; }

    .panel {
      position: fixed; top: 0; right: 0; height: 100vh; z-index: 3;
      display: flex; flex-direction: column;
      background: #fff; color: #1f1f1f;
      border-left: 1px solid #d8d8d8;
      box-shadow: -8px 0 28px rgba(0,0,0,.18);
      transform: translateX(100%);
      transition: transform .18s ease-out;
    }
    .panel.is-open { transform: none; }
    .panel:not(.is-open) { visibility: hidden; pointer-events: none; }

    .grip {
      position: absolute; left: -3px; top: 0; width: 8px; height: 100%;
      cursor: col-resize; background: transparent;
    }
    .grip:hover { background: rgba(110,10,214,.25); }

    header {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px; background: #6e0ad6; color: #fff; flex: 0 0 auto;
    }
    .title { font-size: 13px; font-weight: 700; line-height: 1.3; min-width: 0; }
    .title small {
      display: block; font-weight: 400; opacity: .85; font-size: 11px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .spacer { flex: 1 1 auto; }

    .icon-btn {
      border: 0; background: rgba(255,255,255,.14); color: #fff;
      width: 28px; height: 28px; border-radius: 6px; cursor: pointer;
      font-size: 14px; line-height: 1; display: grid; place-items: center;
      flex: 0 0 auto;
    }
    .icon-btn:hover { background: rgba(255,255,255,.28); }
    .icon-btn.is-active { background: #fff; color: #6e0ad6; }

    .warn {
      padding: 10px 12px; background: #fff4d6; color: #5c4502;
      font-size: 12px; line-height: 1.45; border-bottom: 1px solid #f0dca8;
    }
    .warn[hidden] { display: none; }
    .warn button {
      margin-top: 8px; border: 0; border-radius: 6px; cursor: pointer;
      padding: 6px 10px; background: #6e0ad6; color: #fff; font-size: 12px; font-weight: 600;
    }

    .stage { position: relative; flex: 1 1 auto; min-height: 0; background: #f3f3f3; }
    .stage iframe {
      position: absolute; inset: 0; width: 100%; height: 100%;
      border: 0; display: block; background: #f3f3f3;
    }

    .loading {
      position: absolute; inset: 0; z-index: 1;
      display: flex; align-items: center; justify-content: center; gap: 10px;
      background: #f3f3f3; color: #6b6b6b; font-size: 13px;
    }
    .loading[hidden] { display: none !important; }
    .spinner {
      width: 16px; height: 16px; border-radius: 50%;
      border: 2px solid #d4c2ea; border-top-color: #6e0ad6;
      animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2s; } }
  `;

  function buildUi() {
    const host = document.createElement('div');
    host.id = 'olx-inline-chat-root';
    host.style.cssText =
      'all: initial; position: fixed; inset: 0 0 auto auto; width: 0; height: 0; z-index: 2147483000;';

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${STYLES}</style>
      <button class="launcher" type="button" title="Abrir chat aqui (Alt+C)">
        <span class="label">Chat do anúncio</span>
      </button>
      <button class="hover-btn" type="button" hidden title="Abrir o chat deste anúncio aqui">
        Chat
      </button>
      <aside class="panel" style="width:${prefs.width}px">
        <div class="grip" title="Arraste para redimensionar"></div>
        <header>
          <div class="title">Chat OLX<small></small></div>
          <div class="spacer"></div>
          <button class="icon-btn js-all" type="button" title="Ver todas as conversas">☰</button>
          <button class="icon-btn js-reload" type="button" title="Recarregar">⟳</button>
          <button class="icon-btn js-tab" type="button" title="Abrir em nova aba">↗</button>
          <button class="icon-btn js-close" type="button" title="Fechar (Esc)">✕</button>
        </header>
        <div class="warn" hidden>
          <div class="warn-text"></div>
          <button class="js-fix" type="button">Permitir incorporação nesta página</button>
        </div>
        <div class="stage">
          <iframe allow="clipboard-write; fullscreen"
            referrerpolicy="no-referrer-when-downgrade"></iframe>
          <div class="loading" hidden><span class="spinner"></span>Carregando conversa…</div>
        </div>
      </aside>
    `;

    ui = {
      host,
      shadow,
      launcher: shadow.querySelector('.launcher'),
      launcherLabel: shadow.querySelector('.launcher .label'),
      hoverBtn: shadow.querySelector('.hover-btn'),
      panel: shadow.querySelector('.panel'),
      subtitle: shadow.querySelector('.title small'),
      frame: shadow.querySelector('.stage iframe'),
      loading: shadow.querySelector('.loading'),
      warn: shadow.querySelector('.warn'),
      warnText: shadow.querySelector('.warn-text'),
      btnAll: shadow.querySelector('.js-all'),
      grip: shadow.querySelector('.grip'),
    };

    ui.frame.dataset.loaded = '0';
    ui.frame.addEventListener('load', () => {
      ui.frame.dataset.loaded = '1';
      hideLoading();
    });

    ui.launcher.addEventListener('click', () => {
      if (pageListId) showAd(pageListId, '', { fromPage: true });
      else showAllConversations();
    });
    ui.hoverBtn.addEventListener('click', () => {
      if (hover.id) showAd(hover.id, hover.title, { fromPage: false });
      hideHoverButton(true);
    });
    shadow.querySelector('.js-close').addEventListener('click', closePanel);
    shadow.querySelector('.js-reload').addEventListener('click', () => {
      const url = ui.frame.dataset.url || panelUrl();
      ui.frame.dataset.url = url;
      ui.frame.dataset.loaded = '0';
      ui.frame.src = url;
      showLoading();
    });
    shadow.querySelector('.js-tab').addEventListener('click', () => {
      window.open(panelUrl(), '_blank', 'noopener');
    });
    ui.btnAll.addEventListener('click', () => {
      mode = mode === 'all' && activeId ? 'ad' : 'all';
      openPanel();
    });
    shadow.querySelector('.js-fix').addEventListener('click', fixPageCsp);
    ui.grip.addEventListener('pointerdown', startResize);

    document.documentElement.appendChild(host);
    keepMounted(host);
  }

  // A OLX é um SPA; se a árvore for recriada, recoloca o painel.
  function keepMounted(host) {
    new MutationObserver(() => {
      if (!host.isConnected) document.documentElement.appendChild(host);
    }).observe(document.documentElement, { childList: true });
  }

  function render() {
    if (!ui) return;
    ui.launcher.hidden = prefs.open;
    ui.panel.classList.toggle('is-open', prefs.open);
    ui.panel.style.width = `${prefs.width}px`;
    ui.launcherLabel.textContent = pageListId ? 'Chat do anúncio' : 'Conversas';
    ui.subtitle.textContent =
      mode === 'all' ? 'todas as conversas' : activeTitle || `anúncio ${activeId || '—'}`;
    ui.subtitle.title = ui.subtitle.textContent;
    ui.btnAll.classList.toggle('is-active', mode === 'all');
  }

  function openPanel(url) {
    if (!ui) return;
    prefs.open = true;
    showUrl(url || panelUrl());
    hideHoverButton(true);
    render();
    savePrefs();
  }

  // Abre a conversa de um anuncio especifico (da pagina ou de um card da busca).
  function showAd(id, title, { fromPage = false, url = null } = {}) {
    mode = 'ad';
    activeId = id || null;
    activeTitle = title || (id === pageListId ? documentAdTitle() : '');
    followPage = fromPage;
    openPanel(url);
  }

  function showAllConversations() {
    mode = 'all';
    followPage = true;
    openPanel();
  }

  function closePanel() {
    prefs.open = false;
    scheduleReclaim();
    render();
    savePrefs();
  }

  function togglePanel() {
    if (prefs.open) closePanel();
    else if (pageListId) showAd(pageListId, '', { fromPage: true });
    else showAllConversations();
  }

  const documentAdTitle = () => {
    const h1 = document.querySelector('h1');
    return h1 ? h1.textContent.trim().slice(0, 90) : '';
  };

  // ------------------------------------------------------------------ iframe

  // O chat so carrega quando voce pede. Nada e buscado de forma especulativa.
  function showUrl(url) {
    if (!ui || !url) return;
    clearTimeout(reclaimTimer);
    if (ui.frame.dataset.url === url) {
      ui.frame.dataset.loaded === '1' ? hideLoading() : showLoading();
      return;
    }
    ui.frame.dataset.url = url;
    ui.frame.dataset.loaded = '0';
    ui.frame.src = url;
    showLoading();
  }

  // Com o painel fechado, o chat so consome (websocket, timers, memoria).
  // Depois de um tempo parado, devolve esses recursos.
  let reclaimTimer = null;
  function scheduleReclaim() {
    clearTimeout(reclaimTimer);
    reclaimTimer = setTimeout(() => {
      if (prefs.open || !ui.frame.dataset.url) return;
      ui.frame.dataset.url = '';
      ui.frame.dataset.loaded = '0';
      ui.frame.src = 'about:blank';
    }, RECLAIM_DELAY);
  }

  let loadingTimer = null;
  function showLoading() {
    if (!ui) return;
    ui.loading.hidden = false;
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(hideLoading, 12000); // nunca deixa o spinner preso
  }
  function hideLoading() {
    if (!ui) return;
    clearTimeout(loadingTimer);
    ui.loading.hidden = true;
  }

  // ----------------------------------------------------------- redimensionar

  function startResize(event) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = prefs.width;
    ui.frame.style.pointerEvents = 'none';
    ui.panel.style.transition = 'none';

    const onMove = (e) => {
      const next = startWidth + (startX - e.clientX);
      prefs.width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next));
      ui.panel.style.width = `${prefs.width}px`;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      ui.frame.style.pointerEvents = '';
      ui.panel.style.transition = '';
      savePrefs();
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
  }

  // ------------------------------------ botao de chat sobre os cards da busca

  const hover = { card: null, id: null, title: '', hideTimer: null };

  // Usa o card (li/article) quando ele tem tamanho plausivel; senao o proprio link.
  function cardFor(anchor) {
    const candidate = anchor.closest('li, article');
    if (!candidate) return anchor;
    const rect = candidate.getBoundingClientRect();
    const plausible = rect.height >= 60 && rect.height <= 460;
    return plausible && rect.height >= anchor.getBoundingClientRect().height ? candidate : anchor;
  }

  function cardTitle(anchor, card) {
    const heading = card.querySelector('h1, h2, h3');
    const text =
      anchor.getAttribute('aria-label') ||
      anchor.getAttribute('title') ||
      (heading && heading.textContent) ||
      anchor.textContent ||
      '';
    return text.trim().replace(/\s+/g, ' ').slice(0, 90);
  }

  function onPointerOver(event) {
    if (!ui) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    // mouse sobre o proprio painel/botoes: mantem o que esta na tela.
    // Eventos vindos do shadow DOM chegam aqui com target = host, entao nao
    // precisamos montar o composedPath() a cada movimento do mouse.
    if (target === ui.host) {
      clearTimeout(hover.hideTimer);
      return;
    }
    const anchor = target.closest('a[href]');
    const id = anchor ? adIdFromUrl(anchor.href) : null;
    if (!id || id === pageListId) {
      scheduleHoverHide();
      return;
    }
    clearTimeout(hover.hideTimer);
    const card = cardFor(anchor);
    if (card === hover.card && id === hover.id) return;
    hover.card = card;
    hover.id = id;
    hover.title = cardTitle(anchor, card);
    showHoverButton();
  }

  function showHoverButton() {
    ui.hoverBtn.title = hover.title
      ? `Abrir o chat de "${hover.title}" aqui`
      : 'Abrir o chat deste anúncio aqui';
    ui.hoverBtn.hidden = false;
    positionHoverButton();
  }

  function positionHoverButton() {
    if (!ui || ui.hoverBtn.hidden) return;
    if (!hover.card || !hover.card.isConnected) return hideHoverButton(true);
    const rect = hover.card.getBoundingClientRect();
    if (rect.width === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
      return hideHoverButton(true);
    }
    const btn = ui.hoverBtn;
    const w = btn.offsetWidth || 70;
    const h = btn.offsetHeight || 26;
    const rightLimit = window.innerWidth - (prefs.open ? prefs.width : 0) - 8;
    const left = Math.max(8, Math.min(rect.right - w - 8, rightLimit - w));
    const top = Math.max(8, Math.min(rect.top + 8, window.innerHeight - h - 8));
    btn.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  function scheduleHoverHide() {
    if (!ui || ui.hoverBtn.hidden) return;
    clearTimeout(hover.hideTimer);
    hover.hideTimer = setTimeout(() => hideHoverButton(), 180);
  }

  function hideHoverButton(immediate = false) {
    if (!ui) return;
    clearTimeout(hover.hideTimer);
    if (!immediate && ui.hoverBtn.matches(':hover')) return;
    ui.hoverBtn.hidden = true;
    hover.card = null;
    hover.id = null;
    hover.title = '';
  }

  // ------------------------------------------- interceptar o botao de chat

  const CHAT_LABEL = /^(chat|conversar|enviar mensagem|iniciar conversa|mensagem)$/i;

  function chatTargetFrom(node) {
    if (!(node instanceof Element)) return null;
    const anchor = node.closest('a[href]');
    if (anchor) {
      try {
        const url = new URL(anchor.href, location.href);
        if (url.hostname === CHAT_HOST) {
          return { url: url.href, id: url.searchParams.get('list-id') || pageListId };
        }
      } catch (_) {}
    }
    const clickable = node.closest('button, [role="button"], a');
    if (clickable && pageListId) {
      const label = (clickable.getAttribute('aria-label') || clickable.textContent || '').trim();
      const hint = `${clickable.getAttribute('data-lurker-detail') || ''} ${clickable.getAttribute('data-ds-component') || ''}`;
      if (CHAT_LABEL.test(label) || /chat/i.test(hint)) {
        return { url: adChatUrl(pageListId), id: pageListId };
      }
    }
    return null;
  }

  function onCapturedClick(event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (ui && event.composedPath().includes(ui.host)) return; // clique no proprio painel
    const target = chatTargetFrom(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showAd(target.id, '', { fromPage: target.id === pageListId, url: target.url });
  }

  // ------------------------------------------------------------- CSP da pagina

  async function syncCspWarning() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'get-page-csp-relaxed' });
      if (res && res.relaxed) hideWarning();
    } catch (_) {}
  }

  function showWarning(text) {
    if (!ui) return;
    ui.warnText.textContent = text;
    ui.warn.hidden = false;
  }
  const hideWarning = () => ui && (ui.warn.hidden = true);

  async function fixPageCsp() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'set-page-csp-relaxed', value: true });
      if (res && res.relaxed) {
        showWarning('Pronto. Recarregue a página para o chat aparecer aqui.');
        const btn = ui.shadow.querySelector('.js-fix');
        if (btn) btn.remove();
      }
    } catch (_) {}
  }

  document.addEventListener('securitypolicyviolation', (event) => {
    if (String(event.blockedURI || '').includes(CHAT_HOST)) {
      showWarning(
        'A OLX bloqueou a incorporação do chat nesta página (CSP). Libere abaixo e recarregue.'
      );
    }
  });

  // -------------------------------------------------------------------- eventos

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;

    if (data.type === 'open-chat') {
      let id = null;
      try {
        id = new URL(data.url).searchParams.get('list-id');
      } catch (_) {}
      showAd(id || pageListId, '', { fromPage: true, url: data.url });
    } else if (data.type === 'navigated') {
      refreshPageContext();
    }
  });

  function refreshPageContext() {
    const next = detectListId();
    if (next === pageListId) return;
    pageListId = next;
    hideHoverButton(true);
    // So acompanha a navegacao se o painel foi aberto a partir da propria pagina;
    // uma conversa aberta por um card da busca nao e trocada sozinha.
    if (prefs.open && followPage && mode === 'ad' && pageListId) {
      showAd(pageListId, '', { fromPage: true });
      return;
    }
    render();
  }

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyC') {
        event.preventDefault();
        togglePanel();
      } else if (event.key === 'Escape') {
        if (!ui || ui.hoverBtn.hidden) {
          if (prefs.open) closePanel();
        } else {
          hideHoverButton(true);
        }
      }
    },
    true
  );

  // ---------------------------------------------------------------------- boot

  document.addEventListener('click', onCapturedClick, true);
  document.addEventListener('mouseover', onPointerOver, true);
  document.addEventListener(
    'mouseleave',
    (event) => {
      if (event.target === document.documentElement) scheduleHoverHide();
    },
    true
  );
  window.addEventListener('scroll', positionHoverButton, { capture: true, passive: true });
  window.addEventListener('resize', positionHoverButton, { passive: true });

  async function boot() {
    await loadPrefs();
    buildUi();
    pageListId = detectListId();
    if (pageListId) {
      activeId = pageListId;
      activeTitle = documentAdTitle();
    } else {
      mode = 'all';
    }
    render();
    if (prefs.open) openPanel();
    syncCspWarning();

    // A pagina hidrata depois; tenta rechecar o contexto por um tempo.
    let tries = 0;
    const retry = setInterval(() => {
      refreshPageContext();
      if (pageListId && activeId === pageListId && !activeTitle) {
        activeTitle = documentAdTitle();
        if (activeTitle) render();
      }
      if ((pageListId && activeTitle) || ++tries > 20) clearInterval(retry);
    }, 500);
  }

  if (document.documentElement) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
