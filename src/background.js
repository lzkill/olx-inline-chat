// Service worker: so cuida de ligar/desligar a regra que relaxa o CSP da pagina
// do anuncio. A regra do chat (remover X-Frame-Options) ja vem ativa no manifest.

const PAGE_CSP_RULESET = 'page_csp';

async function isPageCspRelaxed() {
  const ids = await chrome.declarativeNetRequest.getEnabledRulesets();
  return ids.includes(PAGE_CSP_RULESET);
}

async function setPageCspRelaxed(enabled) {
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    enabled
      ? { enableRulesetIds: [PAGE_CSP_RULESET] }
      : { disableRulesetIds: [PAGE_CSP_RULESET] }
  );
  return isPageCspRelaxed();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'get-page-csp-relaxed') {
    isPageCspRelaxed().then((v) => sendResponse({ relaxed: v }));
    return true; // resposta assincrona
  }

  if (msg.type === 'set-page-csp-relaxed') {
    setPageCspRelaxed(!!msg.value)
      .then((v) => sendResponse({ relaxed: v }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
});
