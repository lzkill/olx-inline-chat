# OLX Chat Inline

Extensão para Chrome que abre o chat da OLX **dentro da própria página do anúncio**,
num painel lateral, em vez de abrir uma nova janela.

## Instalação

1. `chrome://extensions`
2. Ligue o **Modo do desenvolvedor** (canto superior direito)
3. **Carregar sem compactação** → selecione esta pasta (`olx-chat-extension`)
4. Abra um anúncio, por exemplo:
   `https://es.olx.com.br/norte-do-espirito-santo/games/consoles-de-video-game/playstation-4-pro-versao-4k-condicao-excelente-modelo-silencioso-1516586784`

## Uso

- Clicar no botão **Chat** do anúncio abre o painel lateral (não abre mais janela nova).
- Botão flutuante **"Chat do anúncio"** no canto inferior direito faz o mesmo.
- `Alt+C` abre/fecha o painel. `Esc` fecha.
- Arraste a borda esquerda do painel para redimensionar (largura fica salva).
- Botões do cabeçalho: `☰` alterna entre a conversa do anúncio e **todas as conversas**,
  `⟳` recarrega, `↗` abre em aba nova, `✕` fecha.
- Anúncios cujo chat você já abriu ganham um ponto verde no botão e a data do contato
  no cabeçalho (guardado em `chrome.storage.local`).

## Como funciona

- `chat.olx.com.br` responde com `X-Frame-Options: SAMEORIGIN`, o que normalmente
  impede embutir o chat em `*.olx.com.br`. A regra em `rules/chat-frame.json`
  (`declarativeNetRequest`) remove esse cabeçalho **apenas** em requisições de
  sub-frame para `chat.olx.com.br` originadas de `olx.com.br`.
- O iframe aponta direto para `https://chat.olx.com.br/?list-id=<id>`. Como a página
  do anúncio e o chat são o mesmo site (`olx.com.br`), os cookies de sessão continuam
  valendo — você não precisa logar de novo.
- `src/main-world.js` roda no contexto da página e intercepta `window.open` para
  URLs de chat, devolvendo uma janela "de mentira" para o código da OLX não quebrar.
  Também avisa o painel quando o SPA troca de anúncio.
- O `list-id` é descoberto em três etapas: link de chat na página → `?list-id=` na
  URL → números no fim do slug (`...-1516586784`).

## Se o chat não carregar

A página do anúncio pode ter um CSP (`frame-src`) que barra o iframe. Nesse caso
aparece um aviso amarelo no painel com o botão **"Permitir incorporação nesta página"**,
que ativa a regra `rules/page-csp.json` (remove o CSP do documento principal de
`olx.com.br`). Recarregue a página depois. Essa regra vem **desativada** por padrão,
porque enfraquece o CSP do site inteiro — só ligue se for necessário.

Para depurar: `chrome://extensions` → **service worker** (logs do background) e o
console da página (logs do content script, violações de CSP).

## Limitações

- Depende da URL pública do chat (`?list-id=`) e dos cabeçalhos atuais da OLX. Se a
  OLX mudar isso, a regra em `rules/` precisa de ajuste.
- O botão de chat é detectado por `href`, texto (`Chat`, `Conversar`, ...) e por
  `window.open`. Se a OLX mudar o rótulo, o botão flutuante e `Alt+C` continuam
  funcionando.
- Notificações/som do chat continuam dependendo do próprio app da OLX dentro do iframe.
