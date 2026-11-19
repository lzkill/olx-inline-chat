// Content script (mundo isolado): monta o painel lateral com o chat da OLX
// dentro da propria pagina do anuncio.

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

  let prefs = { open: false, width: DEFAULT_WIDTH, contacted: {} };
  let listId = null;
  let mode = 'ad'; // 'ad' = conversa do anuncio | 'all' = lista completa
  let ui = null;   // { host, shadow, frame, launcher, title, badge, warn }

  // --------------------------------------------------------------- utilidades

  const chatUrlFor = (id) =>
    mode === 'ad' && id
      ? `https://${CHAT_HOST}/?list-id=${encodeURIComponent(id)}`
      : `https://${CHAT_HOST}/`;

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
    // 3) id no fim do slug: ...-modelo-silencioso-1516586784
    const segment = location.pathname.replace(/\/+$/, '').split('/').pop() || '';
    const fromSlug = segment.match(/(?:^|-)(\d{6,})$/);
    if (fromSlug) return fromSlug[1];
    return null;
  }

  async function loadPrefs() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      Object.assign(prefs, stored[STORAGE_KEY] || {});
    } catch (_) {}
    prefs.width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, prefs.width || DEFAULT_WIDTH));
    prefs.contacted = prefs.contacted || {};
  }

  let saveTimer = null;
  function savePrefs() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.storage.local.set({ [STORAGE_KEY]: prefs }).catch(() => {});
    }, 150);
  }

  const fmtDate = (ts) =>
    new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

  // ---------------------------------------------------------------------- UI

  const STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }

    .launcher {
      position: fixed; right: 18px; bottom: 18px; z-index: 1;
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 16px; border: 0; border-radius: 999px;
      background: #6e0ad6; color: #fff; font-size: 14px; font-weight: 600;
      cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.28);
    }
    .launcher:hover { background: #5a08b0; }
    .launcher[hidden] { display: none !important; }
    .launcher .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #28c76f; box-shadow: 0 0 0 2px rgba(255,255,255,.5);
    }

    .panel {
      position: fixed; top: 0; right: 0; height: 100vh;
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
    .title { font-size: 13px; font-weight: 700; line-height: 1.3; }
    .title small { display: block; font-weight: 400; opacity: .85; font-size: 11px; }
    .spacer { flex: 1 1 auto; }

    .icon-btn {
      border: 0; background: rgba(255,255,255,.14); color: #fff;
      width: 28px; height: 28px; border-radius: 6px; cursor: pointer;
      font-size: 14px; line-height: 1; display: grid; place-items: center;
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

    iframe {
      flex: 1 1 auto; width: 100%; border: 0; display: block; background: #f3f3f3;
    }
  `;

  function buildUi() {
    const host = document.createElement('div');
    host.id = 'olx-inline-chat-root';
    host.style.cssText =
      'all: initial; position: fixed; inset: 0 0 auto auto; width: 0; height: 0; z-index: 2147483000;';

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${STYLES}</style>
      <button class="launcher" part="launcher" type="button" title="Abrir chat aqui (Alt+C)">
        <span class="label">Chat do anúncio</span><span class="dot" hidden></span>
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
        <iframe
          allow="clipboard-write; fullscreen"
          referrerpolicy="no-referrer-when-downgrade"></iframe>
      </aside>
    `;

    ui = {
      host,
      shadow,
      launcher: shadow.querySelector('.launcher'),
      launcherDot: shadow.querySelector('.launcher .dot'),
      launcherLabel: shadow.querySelector('.launcher .label'),
      panel: shadow.querySelector('.panel'),
      subtitle: shadow.querySelector('.title small'),
      frame: shadow.querySelector('iframe'),
      warn: shadow.querySelector('.warn'),
      warnText: shadow.querySelector('.warn-text'),
      btnAll: shadow.querySelector('.js-all'),
      grip: shadow.querySelector('.grip'),
    };

    ui.launcher.addEventListener('click', () => openPanel(null, { markContacted: true }));
    shadow.querySelector('.js-close').addEventListener('click', closePanel);
    shadow.querySelector('.js-reload').addEventListener('click', () => {
      ui.frame.src = chatUrlFor(listId);
    });
    shadow.querySelector('.js-tab').addEventListener('click', () => {
      window.open(chatUrlFor(listId), '_blank', 'noopener');
    });
    ui.btnAll.addEventListener('click', () => {
      mode = mode === 'all' ? 'ad' : 'all';
      ui.btnAll.classList.toggle('is-active', mode === 'all');
      render();
      ui.frame.src = chatUrlFor(listId);
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
    const hasAd = !!listId;
    ui.launcher.hidden = prefs.open || !hasAd;
    ui.panel.classList.toggle('is-open', prefs.open);
    ui.panel.style.width = `${prefs.width}px`;

    const contactedAt = hasAd ? prefs.contacted[listId] : null;
    ui.launcherDot.hidden = !contactedAt;
    ui.launcherLabel.textContent = contactedAt ? 'Chat (já contatado)' : 'Chat do anúncio';
    ui.subtitle.textContent =
      mode === 'all'
        ? 'todas as conversas'
        : `anúncio ${listId || '—'}${contactedAt ? ` · contatado em ${fmtDate(contactedAt)}` : ''}`;
    ui.btnAll.classList.toggle('is-active', mode === 'all');
  }

  function openPanel(url, { markContacted = false } = {}) {
    if (!ui) return;
    prefs.open = true;
    const target = url || chatUrlFor(listId);
    if (ui.frame.src !== target) ui.frame.src = target;
    if (markContacted && listId && mode === 'ad' && !prefs.contacted[listId]) {
      prefs.contacted[listId] = Date.now();
    }
    render();
    savePrefs();
  }

  function closePanel() {
    prefs.open = false;
    render();
    savePrefs();
  }

  function togglePanel() {
    if (prefs.open) closePanel();
    else openPanel(null, { markContacted: true });
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

  // ------------------------------------------- interceptar o botao de chat

  const CHAT_LABEL = /^(chat|conversar|enviar mensagem|iniciar conversa|mensagem)$/i;

  function chatTargetFrom(node) {
    if (!(node instanceof Element)) return null;
    const anchor = node.closest('a[href]');
    if (anchor) {
      try {
        const url = new URL(anchor.href, location.href);
        if (url.hostname === CHAT_HOST) return url.href;
      } catch (_) {}
    }
    const clickable = node.closest('button, [role="button"], a');
    if (clickable && listId) {
      const label = (clickable.getAttribute('aria-label') || clickable.textContent || '').trim();
      const hint = `${clickable.getAttribute('data-lurker-detail') || ''} ${clickable.getAttribute('data-ds-component') || ''}`;
      if (CHAT_LABEL.test(label) || /chat/i.test(hint)) return chatUrlFor(listId);
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
    mode = 'ad';
    openPanel(target, { markContacted: true });
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
        showWarning('Pronto. Recarregue a página do anúncio para o chat aparecer aqui.');
        ui.shadow.querySelector('.js-fix').remove();
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
      mode = 'ad';
      openPanel(data.url, { markContacted: true });
    } else if (data.type === 'navigated') {
      refreshListId();
    }
  });

  function refreshListId() {
    const next = detectListId();
    if (next === listId) return;
    listId = next;
    if (ui && prefs.open && mode === 'ad') ui.frame.src = chatUrlFor(listId);
    render();
  }

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyC') {
        event.preventDefault();
        togglePanel();
      } else if (event.key === 'Escape' && prefs.open) {
        closePanel();
      }
    },
    true
  );

  // ---------------------------------------------------------------------- boot

  document.addEventListener('click', onCapturedClick, true);

  async function boot() {
    await loadPrefs();
    buildUi();
    listId = detectListId();
    render();
    if (prefs.open && listId) openPanel();
    syncCspWarning();

    // A pagina do anuncio hidrata depois; tenta reachar o list-id por um tempo.
    let tries = 0;
    const retry = setInterval(() => {
      refreshListId();
      if (listId || ++tries > 20) clearInterval(retry);
    }, 500);
  }

  if (document.documentElement) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
