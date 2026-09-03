# Chrome extension

A extensão Manifest V3 fornece uma interface Side Panel para o núcleo `qlik-geojson-extractor`.

## Instalação local

Na raiz do projeto:

```bash
npm run build
```

Depois, no Chrome/Chromium:

1. abra `chrome://extensions`;
2. habilite **Modo do desenvolvedor**;
3. clique em **Carregar sem compactação**;
4. escolha a pasta `chrome-extension/`;
5. abra uma sheet Qlik em que você já esteja autenticado;
6. clique no ícone **Qlik GeoJSON Extractor**;
7. no Side Panel, clique em **Permitir acesso a este site**;
8. aceite a solicitação do Chrome para o host Qlik atual.

O painel lateral detecta `appId`, `sheetId` e virtual proxy quando a URL segue o padrão Qlik Sense `/sense/app/.../sheet/...`.

## Por que existe o botão de acesso ao host

`chrome.scripting.executeScript()` exige permissão para a URL da página. O `activeTab` é útil para associar o clique do ícone à guia corrente, mas o Side Panel continua executando comandos depois desse gesto inicial. Para tornar esse fluxo confiável, a extensão usa uma permissão de host opcional e explícita.

O manifesto declara apenas a possibilidade de solicitar hosts HTTP/HTTPS:

```json
"optional_host_permissions": [
  "https://*/*",
  "http://*/*"
]
```

Isso **não concede acesso automático a todos os sites**. Quando o usuário clica em **Permitir acesso a este site**, a extensão chama `chrome.permissions.request()` apenas para o hostname da página Qlik corrente, por exemplo:

```text
https://paineis.tre-df.jus.br/*
```

O acesso pode ser removido pelo mesmo botão.

## Permissões

- `activeTab`: identifica a guia em que o usuário acionou explicitamente a extensão;
- `scripting`: injeta o núcleo na página Qlik depois que o host foi autorizado;
- `sidePanel`: hospeda a interface;
- `storage`: persiste configurações por app/sheet e o contexto temporário da guia;
- `downloads`: salva o GeoJSON gerado;
- `optional_host_permissions`: permite solicitar, em tempo de execução, somente o host Qlik escolhido pelo usuário.

A extensão não declara `host_permissions` nem `<all_urls>`. A declaração genérica em `optional_host_permissions` apenas torna possível pedir um host descoberto em tempo de execução; nenhum host é concedido na instalação.

## Fluxo

```text
abrir sheet Qlik
  ↓
clicar no ícone da extensão
  ↓
Permitir acesso a este site
  ↓
Testar conexão
  ↓
Inspecionar
  ↓
escolher PointLayer
  ↓
confirmar latitude/longitude
  ↓
escolher explicitamente entityKey
  ↓
selecionar propriedades/medidas
  ↓
Gerar GeoJSON
  ↓
validar resumo/preview
  ↓
Baixar GeoJSON
```

A dimensão visual nunca é promovida silenciosamente a `entityKey`.

## Se a guia mudar de host

A permissão é vinculada ao host. Se a guia navegar para outra origem, clique novamente no ícone da extensão nessa nova página e conceda o novo host. Navegações entre apps/sheets no mesmo host não precisam de nova concessão.
