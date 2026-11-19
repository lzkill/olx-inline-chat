# Publicando na Chrome Web Store

## 0. Antes de submeter

- [ ] **Renomear a extensão.** `OLX Chat Inline` usa a marca "OLX" de um jeito que a
      política da loja trata como sugestão de endosso. Algo como
      `Chat Inline (não oficial) para OLX` passa melhor, e a descrição deve começar
      com "Extensão não oficial, sem vínculo com a OLX."
- [ ] **Remover `rules/page-csp.json`** (e a entrada dela no `manifest.json`). Ela está
      desativada e não foi necessária. Como remove o CSP do documento principal de todo
      o site, é o item mais provável de travar a revisão. Código morto que atrai análise.
- [ ] Bump de `version` no `manifest.json` a cada envio (a loja recusa versão repetida).
- [ ] `./build.sh` → gera `dist/olx-chat-inline-<versão>.zip`.

## 1. Conta de desenvolvedor

1. https://chrome.google.com/webstore/devconsole
2. Taxa única de **US$ 5** (cartão, uma vez por conta Google).
3. Verificar e-mail de contato — sem isso o item não publica.

## 2. Upload

**Novo item** → envie o `.zip` (o `manifest.json` precisa estar na raiz do zip, que é
o que o `build.sh` faz).

## 3. Ficha da loja

- Descrição detalhada, categoria (*Produtividade*), idioma **Português (Brasil)**.
- Ícone 128x128: já incluso em `icons/icon128.png`.
- **Pelo menos 1 screenshot 1280x800** (ou 640x400). Tire do painel aberto num anúncio
  real — é o único item que ainda falta e que só você consegue produzir.

## 4. Privacidade (a parte que reprova)

- **Finalidade única:** "Exibir o chat da OLX dentro da página do anúncio, em um painel
  lateral, em vez de uma nova janela."
- **Justificativa de cada permissão** — escreva exatamente o que cada uma faz:
  - `declarativeNetRequestWithHostAccess`: remove o cabeçalho `X-Frame-Options:
    SAMEORIGIN` **apenas** em requisições de sub-frame para `chat.olx.com.br`
    originadas de `olx.com.br`, para que o próprio chat da OLX possa ser exibido
    embutido na página do anúncio do mesmo site. Nenhuma outra requisição é alterada.
  - `storage`: guarda localmente largura do painel, estado aberto/fechado e os IDs de
    anúncios já contatados. Nada sai do navegador.
  - `host_permissions` (`*://*.olx.com.br/*`): a extensão só funciona nesse domínio.
- **Uso de dados:** marque que não há coleta, uso ou transferência de dados do usuário.
  Com isso, política de privacidade normalmente não é exigida; se o formulário pedir,
  uma página estática dizendo "esta extensão não coleta nenhum dado" basta.

## 5. Visibilidade

| Opção | Quem instala | Quando usar |
|---|---|---|
| **Não listada** | quem tiver o link | **recomendado aqui** — atualização automática, sem aviso de modo desenvolvedor, sem disputa de marca |
| Pública | qualquer um, aparece na busca | se você quiser divulgar de verdade |
| Privada | só contas da sua organização | precisa de Google Workspace |

Em qualquer uma delas a revisão acontece. Costuma levar de algumas horas a alguns dias;
extensões que mexem em cabeçalhos de resposta às vezes caem em revisão manual mais longa.

## 6. Risco honesto

Remover `X-Frame-Options` de um site de terceiros é área cinzenta: é exatamente para
isso que a API `declarativeNetRequest` existe, e o escopo aqui é mínimo e verificável —
mas um revisor pode enquadrar como contornar uma proteção do site, e nada impede a OLX
de reclamar. Submeter como **não listada** reduz quase todo esse atrito e continua te
dando atualização automática. Se o objetivo é só uso pessoal, "não listada" é a escolha
certa.

## 7. Atualizações

Bump da `version` → `./build.sh` → **Pacote → Fazer upload de novo pacote** → enviar
para revisão. Usuários atualizam sozinhos em algumas horas.
