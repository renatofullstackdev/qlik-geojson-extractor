# qlik-geojson-extractor

Ferramenta **browser-first** para inspecionar `PointLayer`s do Qlik Sense, identificar corretamente a entidade espacial e exportar GeoJSON pela Qlik Engine (QIX) API.

A interface recomendada para uso cotidiano é a extensão Chrome em `chrome-extension/`. O bundle de DevTools continua disponível para diagnóstico e desenvolvimento.

> **Política de exemplos:** o único painel concreto documentado é o painel público **Locais de Votação do TRE-DF**. Testes de regressão usam dados sintéticos. Identificadores de painéis internos não devem ser registrados no repositório.

## Objetivo da versão 1.0

A ferramenta faz uma coisa deliberadamente bem:

> inspeciona um `PointLayer`, identifica sua fonte espacial (latitude/longitude ou localização única), ajuda o usuário a escolher uma chave física adequada e produz um GeoJSON `Point` auditável.

Não há suporte 1.0 para `AreaLayer`, `LineLayer`, geocodificação textual ou planejamento de rotas.

## Extensão Chrome — fluxo recomendado

Depois de carregar/instalar a extensão:

```text
abrir uma sheet Qlik já autenticada
  ↓
clicar no ícone Qlik GeoJSON Extractor
  ↓
Permitir acesso a este site
  ↓
Testar conexão
  ↓
Inspecionar
  ↓
confirmar PointLayer e fonte espacial
  ↓
revisar candidatos à chave física
  ↓
escolher explicitamente a chave
  ↓
selecionar propriedades
  ↓
Gerar GeoJSON
  ↓
revisar diagnóstico e contagens
  ↓
Baixar GeoJSON / relatório de diagnóstico
```

A extensão não escolhe `entityKey` silenciosamente.

### Modo básico e avançado

O modo básico mostra apenas o necessário para a maioria das extrações. O **Modo avançado** expõe:

- proxy virtual;
- expressões Qlik customizadas;
- medidas;
- política para coordenadas ausentes;
- proveniência das coordenadas;
- overrides manuais;
- configuração efetiva enviada ao core.

## Proxy virtual do Qlik

O Qlik Sense pode publicar uma aplicação diretamente:

```text
https://servidor/sense/app/APP/sheet/SHEET/...
```

ou por um **proxy virtual**, isto é, um prefixo de caminho associado a outra configuração do Qlik Proxy Service:

```text
https://servidor/finance/sense/app/APP/sheet/SHEET/...
```

Nesse exemplo, o proxy virtual é:

```text
/finance
```

Na maior parte dos ambientes o valor é vazio. A extensão detecta o prefixo pela URL; por isso o campo fica oculto no modo básico e não possui placeholder que sugira um valor arbitrário.

## Estratégia da fonte espacial

A prioridade é a própria configuração do `PointLayer`. O core não presume que todo `PointLayer` use duas colunas de coordenadas:

- `isLatLong=true` → modo `coordinates`, com latitude e longitude independentes;
- `isLatLong=false` → modo `location`, com uma única fonte de localização.

No modo `coordinates`:

1. se o layer referencia um campo simples, por exemplo `=LATITUDE` ou `=[Latitude]`, o campo é normalizado e usado como candidato de alta confiança;
2. se o layer usa uma expressão Qlik complexa, por exemplo `=Avg([Latitude])`, a expressão é **preservada**, e não convertida artificialmente em nome de campo;
3. quando são campos diretos, `inspect()` calcula estatísticas do Qlik: mínimo, máximo, cardinalidades e número de pares distintos;
4. valores fora dos limites WGS84 geram diagnóstico estruturado;
5. se uma troca lat/lon corrigiria um intervalo inválido, a ferramenta emite aviso de possível inversão;
6. o usuário sempre pode escolher explicitamente outro campo.

No modo `location`:

1. `locationOrLatitude` é tratado como localização, não como latitude;
2. configurações residuais de longitude são preservadas apenas para diagnóstico e ignoradas operacionalmente;
3. referências simples viram campos e expressões Qlik complexas são preservadas mesmo quando não começam com `=`;
4. campos `$geopoint` e campos referenciados pela expressão são destacados na interface;
5. para gerar `Point` sem serviço externo, a extensão converte somente o formato nativo Qlik `[longitude, latitude]`; nomes, endereços, WKT e outras representações não são geocodificados nem adivinhados.

A ferramenta não tenta inferir inversão quando ambos os conjuntos de valores são matematicamente válidos; isso exigiria contexto geográfico adicional.

## Estratégia de chave física

A heurística 1.0 não depende apenas de `$key`, nomes `ID/COD` ou cardinalidade. Para os candidatos mais promissores, a ferramenta mede a relação real com a representação espacial ativa.

Evidências positivas:

- até **+40**: proporção de valores que mapeiam para exatamente uma representação espacial;
- **+20**: mesma tabela-fonte da fonte espacial;
- até **+15**: cardinalidade próxima da cardinalidade espacial;
- **+10**: campo usado como dimensão visual do mapa;
- **+5**: tag Qlik `$key`;
- **+5**: nome semelhante a identificador (`ID`, `COD`, `CHAVE`);
- **+5**: nome semelhante a entidade espacial (`LOCAL`, `OBJETO`, `CIRCUNSCRICAO` etc.).

Penalidades:

- até **−50**: valores do candidato associados a múltiplas representações espaciais;
- até **−30**: valores sem representação espacial.

A UI mostra **confiança alta/média/baixa**, a pontuação e as evidências. O score é explicativo; não autoriza seleção automática.

### Por que isso importa — TRE-DF

No painel público do TRE-DF, a dimensão visual `NOM_LOCAL` possui menos valores distintos que as coordenadas porque nomes repetidos agregam locais físicos diferentes. O resultado final precisou usar `COD_OBJETO_LOCAL` como chave física.

Esse caso motivou o teste espacial `candidato → pares de coordenadas`, que é mais relevante do que simplesmente confiar em `$key`.

## Propriedades

A seção de propriedades oferece:

- busca por nome do campo e tabela-fonte;
- **Selecionar filtrados**;
- **Selecionar relacionados**, usando tabelas-fonte compartilhadas com entidade/fonte espacial;
- **Limpar seleção**;
- aplicação em lote de `Only`, `Concat distinct`, `Max`, `Min` ou `Max timestamp`;
- aviso quando muitos campos são selecionados.

No modo avançado também é possível informar propriedades customizadas com `label + expression` e medidas Qlik.

## Diagnóstico e idioma

O core não entrega mais warnings textuais em inglês para a UI. Erros, diagnósticos e evidências usam **códigos estruturados + parâmetros**. A extensão possui um catálogo pt-BR completo e testado.

A mensagem principal exibida ao usuário é localizada. Mensagens técnicas originais podem ser preservadas apenas para diagnóstico.

O relatório JSON de diagnóstico registra, sem armazenar o dataset extraído:

- PointLayer selecionado;
- modo e definição da fonte espacial;
- estatísticas espaciais disponíveis;
- warnings estruturados;
- chave física escolhida e sua avaliação;
- contagens da extração;
- validação GeoJSON.

## Instalação

### Desenvolvimento

```bash
npm run build
npm test
npm run check
```

Depois:

```text
chrome://extensions
→ Modo do desenvolvedor
→ Carregar sem compactação
→ selecionar chrome-extension/
```

### Usuário final

`chrome://extensions` é apenas o fluxo de desenvolvimento. Para distribuição real, prefira:

1. **Chrome Web Store — Unlisted**: instalação por link, sem aparecer na busca pública;
2. **Chrome Web Store — Private** ou política corporativa, se o navegador do órgão for gerenciado;
3. instalação forçada por política Chrome Enterprise, quando a administração central quiser disponibilizar a extensão sem ação do usuário.

Consulte `docs/RELEASE.md`.

## Permissões e privacidade

A extensão:

- usa `activeTab` para associar o clique à guia;
- solicita acesso ao host Qlik corrente apenas em runtime;
- não possui `host_permissions` permanentes;
- não envia dados para servidor externo;
- armazena apenas configurações por app/sheet;
- mantém GeoJSON e valores extraídos somente em memória até o download.

Veja `chrome-extension/PRIVACY.md`.

## DevTools

Para depuração avançada, cole `browser/qlik-geojson-extractor.js` no console da própria página Qlik:

```js
var Extractor = globalThis.QlikGeoJSONExtractor.QlikGeoJSONExtractor;
var extractor = new Extractor();

var report = await extractor.inspect({
  appId: "APP_ID",
  sheetId: "SHEET_ID"
});
```

O exemplo público completo está em `examples/tre-df-console-after-bundle.js` e `examples/tre-df-locais-votacao.config.js`.

## Testes

A suíte 1.0 prioriza comportamento, não contagem artificial de testes. Ela cobre:

- CSRF, WebSocket e RPC concorrente;
- erros QIX estruturados;
- normalização de referências Qlik;
- construção de hypercube;
- paginação sem lacunas/duplicações;
- tratamento de `qIsNull`;
- overrides de coordenadas;
- validação GeoJSON positiva e negativa;
- `inspect()` com agregação visual e chave espacial 1:1;
- `extract()` end-to-end com cliente QIX falso;
- seleção/agrupamento de propriedades;
- persistência de configuração;
- permissões do manifesto;
- cobertura completa do catálogo pt-BR de erros/diagnósticos/evidências.

Execute:

```bash
npm test
npm run build
npm run check
```
