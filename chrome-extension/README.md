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
6. clique no ícone **Qlik GeoJSON Extractor**.

O painel lateral detecta `appId`, `sheetId` e virtual proxy quando a URL segue o padrão Qlik Sense `/sense/app/.../sheet/...`.

## Permissões

- `activeTab`: acesso temporário somente à guia explicitamente ativada pelo usuário;
- `scripting`: injeta o núcleo na página Qlik para executar CSRF/WebSocket no contexto correto;
- `sidePanel`: hospeda a interface;
- `storage`: persiste apenas configurações por app/sheet;
- `downloads`: salva o GeoJSON gerado.

A extensão não declara `host_permissions` nem `<all_urls>` e não envia dados para serviços externos.

## Fluxo

```text
abrir sheet Qlik
  ↓
clicar na extensão
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
