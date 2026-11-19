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

### Na página do anúncio
- Clicar no botão **Chat** do anúncio abre o painel lateral (não abre mais janela nova).
- Botão flutuante **"Chat do anúncio"** no canto inferior direito faz o mesmo.

### Na listagem / busca
- Passe o mouse sobre um resultado: aparece um botão **Chat** no canto do card, que
  abre a conversa daquele anúncio no painel, **sem sair da listagem**.
- O botão flutuante vira **"Conversas"** e abre a lista completa de conversas.
- Uma conversa aberta por um card não é trocada sozinha quando a listagem muda de
  página; já na página de um anúncio, o painel acompanha a navegação entre anúncios.
- `Alt+C` abre/fecha o painel. `Esc` fecha.
- Arraste a borda esquerda do painel para redimensionar (largura fica salva).
- Botões do cabeçalho: `☰` alterna entre a conversa aberta e **todas as conversas**,
  `⟳` recarrega, `↗` abre em aba nova, `✕` fecha. O cabeçalho mostra o título do
  anúncio que está aberto.

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
  URL → números no fim do slug (`...-1516586784`). Nos cards da listagem o id vem do
  `href` do próprio card, lido do `pathname` — por isso query strings como
  `?lis=listing_no_category` não atrapalham.
- O botão que aparece sobre os cards é **um só elemento flutuante que segue o card sob
  o mouse**, dentro do Shadow DOM da extensão. Nada é injetado no DOM da OLX, então
  re-renders do React, scroll infinito e paginação funcionam sem nenhum observer.

## Carregamento

O chat só é buscado quando você pede — **nada é pré-carregado**. Uma versão anterior
aquecia conversas de forma especulativa (ao passar o mouse num card, ao ficar ocioso na
página do anúncio) e mantinha um segundo iframe vivo em segundo plano. Era mais rápido
na primeira abertura, mas cada aquecimento é um boot inteiro do app de chat: navegando
por uma listagem, o acúmulo de CPU, memória e websockets degradava a página. Tudo isso
foi removido.

O que restou para o custo ficar baixo:

- **um iframe só**, e ele reaproveita a conversa já aberta sem recarregar;
- **devolução de recursos**: 90 s depois de fechar o painel, o chat é descarregado
  (`about:blank`), liberando websocket e memória;
- nada pesado no `mouseover` — o handler faz um `closest()` e para. Eventos do painel
  são reconhecidos por `target === host` (o shadow DOM reaponta o alvo), em vez de
  montar um `composedPath()` a cada movimento do mouse.

Enquanto o chat carrega, o painel mostra um indicador em vez de uma área cinza vazia.

### Se degradar

`Shift+Esc` abre o Gerenciador de tarefas do Chrome. Procure linhas
`Subframe: https://chat.olx.com.br` — deve haver no máximo **uma por aba**, e a memória
não deve crescer a cada conversa aberta.

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
