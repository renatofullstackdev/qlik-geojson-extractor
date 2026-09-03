# qlik-geojson-extractor

Toolkit **browser-first** para inspecionar apps do Qlik Sense e extrair camadas de pontos com latitude/longitude para GeoJSON pela Qlik Engine (QIX) API.

O fluxo recomendado é usar o **DevTools do navegador na própria página Qlik**, onde você já possui autorização. Para extrair dados não é necessário instalar dependências npm.

> **Política dos exemplos deste projeto:** o único painel concreto usado nos exemplos é o painel público **Locais de Votação do TRE-DF**. Outros casos devem ser tratados com placeholders genéricos, sem registrar identificadores ou dados de painéis internos.

## O que a ferramenta faz

- obtém o token CSRF do Qlik;
- abre uma sessão WebSocket isolada em `/identity/<uuid>`;
- abre o app com `OpenDoc`;
- testa acesso à sheet com `probe()`;
- percorre a árvore de objetos da sheet;
- encontra mapas e `PointLayer`s;
- lista campos, cardinalidades, tags e tabelas de origem;
- resolve referências simples a campos como `=LATITUDE` e `=[ENTITY NAME]`;
- preserva também a referência bruta encontrada no objeto Qlik;
- sugere possíveis chaves de entidade, sem escolher uma silenciosamente;
- cria um hypercube próprio a partir de uma chave explicitamente escolhida;
- pagina todas as linhas do hypercube;
- reconhece `qIsNull` e ignora por padrão linhas cuja própria dimensão seja nula;
- separa entidades nulas de entidades reais sem coordenadas;
- gera e valida GeoJSON `Point`;
- pode adicionar links de Google Maps e Waze;
- suporta correções explícitas de coordenadas com proveniência e guarda de identidade.

## Regra mais importante

**A dimensão visual do mapa não é necessariamente a chave física da entidade espacial.**

No painel público do TRE-DF, o mapa é apresentado por `NOM_LOCAL`. Esse campo tem nomes repetidos e agregava locais físicos diferentes. A extração final precisou usar `COD_OBJETO_LOCAL` como `entityKey`.

Por isso, use sempre este fluxo:

```text
probe
  ↓
inspect
  ↓
confirmar latitude/longitude
  ↓
confirmar a entidade física e sua chave
  ↓
extract mínimo
  ↓
validar contagens e coordenadas
  ↓
adicionar propriedades e medidas
  ↓
download
```

---

# Início rápido pelo DevTools

## 1. Abra a sheet do Qlik

A URL normalmente contém:

```text
.../sense/app/APP_ID/sheet/SHEET_ID/state/analysis
```

No exemplo público do TRE-DF:

```text
https://paineis.tre-df.jus.br/sense/app/b92de30a-82aa-4d13-8286-cd423498e34e/sheet/BAPbmZA/state/analysis
```

Portanto:

```js
var appId = "b92de30a-82aa-4d13-8286-cd423498e34e";
var sheetId = "BAPbmZA";
```

## 2. Abra o Console

No Chrome/Chromium:

```text
F12 → Console
```

Se o navegador bloquear colagem, siga a instrução exibida pelo próprio DevTools para habilitá-la.

## 3. Cole o bundle

Abra no projeto:

```text
browser/qlik-geojson-extractor.js
```

Copie **todo o arquivo** e cole no Console.

O Console pode responder apenas:

```text
undefined
```

Isso é normal: é o retorno da execução do bundle, não um erro.

Confirme que a API foi carregada:

```js
globalThis.QlikGeoJSONExtractor
```

## 4. Crie uma instância

Use exatamente:

```js
var Extractor = globalThis.QlikGeoJSONExtractor.QlikGeoJSONExtractor;
var downloadGeoJSON = globalThis.QlikGeoJSONExtractor.downloadGeoJSON;
var extractor = new Extractor();
```

Não use:

```js
new QlikGeoJSONExtractor()
```

O nome `globalThis.QlikGeoJSONExtractor` é um **namespace**; a classe `QlikGeoJSONExtractor` está dentro dele.

Os exemplos usam `var` para facilitar a repetição dos comandos no Console sem erro de redeclaração.

---

# Etapa A — testar a conexão

No painel público do TRE-DF:

```js
var appId = "b92de30a-82aa-4d13-8286-cd423498e34e";
var sheetId = "BAPbmZA";

await extractor.probe({ appId, sheetId })
```

Resultado esperado:

```js
{
  websocket: "OPEN",
  openDoc: "SUCCESS",
  getSheet: "SUCCESS",
  getFullPropertyTree: "SUCCESS",
  identity: "qlik-geojson-..."
}
```

Não é necessário usar `console.log(await ...)`. O próprio DevTools exibirá o objeto retornado.

Se os quatro estados forem de sucesso, a ferramenta conseguiu abrir o app e ler a árvore da sheet.

### Erros vermelhos que podem ser independentes

Extensões do navegador, bloqueadores, scripts opcionais do Qlik e APIs de storage podem produzir erros no Console sem afetar o extrator. O teste confiável é o objeto retornado por `probe()`.

---

# Etapa B — inspecionar antes de extrair

Execute:

```js
var report = await extractor.inspect({ appId, sheetId });
report
```

## 1. Ver os `PointLayer`s

```js
report.pointLayers
```

No TRE-DF, procure a camada com:

```text
objectId: pvpGAE
layerId:  jmVahf
```

Ela usa latitude/longitude e foi observada com:

```text
latitude:         NUM_LATITUDE_LOCAL
longitude:        NUM_LONGITUDE_LOCAL
dimensão visual:  NOM_LOCAL
```

O `inspect()` agora resolve automaticamente formas simples de referência a campo:

```text
FIELD             → FIELD
=FIELD            → FIELD
[FIELD WITH SPACE]  → FIELD WITH SPACE
=[FIELD WITH SPACE] → FIELD WITH SPACE
```

As formas originais continuam disponíveis nos campos `*Raw` do relatório.

Expressões complexas, por exemplo:

```text
=Only([FIELD])
=If(...)
=Sum(...)
```

**não são interpretadas como nomes de campo**. Nesses casos o diagnóstico pode manter cardinalidade `null`, porque a ferramenta prefere não adivinhar a semântica da expressão.

## 2. Ver cardinalidades e alertas

```js
report.diagnostics
```

No caso TRE-DF, a investigação mostrou a diferença relevante entre a dimensão visual e a entidade física:

```text
NOM_LOCAL             568 valores distintos
COD_OBJETO_LOCAL      614 valores distintos
NUM_LATITUDE_LOCAL    613 valores distintos
NUM_LONGITUDE_LOCAL   613 valores distintos
```

Esse é precisamente o tipo de situação em que não se deve usar automaticamente a dimensão visual como chave da geometria.

## 3. Ver sugestões de chave

```js
report.entityKeySuggestions
```

As sugestões são **candidatos**, não uma decisão automática. O score considera, entre outras coisas:

- tag `$key`;
- nome parecido com identificador;
- proximidade entre a cardinalidade do candidato e a cardinalidade das coordenadas.

Confirme sempre a semântica do campo antes de usá-lo como `entityKey`.

## 4. Consultar os campos relevantes

No TRE-DF:

```js
report.fields.filter(f =>
  /COD_OBJETO_LOCAL|NOM_LOCAL|NUM_LATITUDE_LOCAL|NUM_LONGITUDE_LOCAL/.test(f.name)
)
```

Ou um campo específico:

```js
report.fields.find(f => f.name === "COD_OBJETO_LOCAL")
```

Cada item informa, entre outros:

```text
name
cardinality
tags
sourceTables
```

---

# Etapa C — fazer uma extração mínima

Antes de adicionar todos os atributos, teste apenas a entidade física e as coordenadas.

No TRE-DF:

```js
var minimalConfig = {
  appId,
  name: "tre_df_locais_votacao_minimo",
  entityKey: "COD_OBJETO_LOCAL",
  latitudeField: "NUM_LATITUDE_LOCAL",
  longitudeField: "NUM_LONGITUDE_LOCAL",
  navigationLinks: false,
  requireAllCoordinates: false
};

var minimal = await extractor.extract(minimalConfig);
```

Resuma:

```js
({
  rows: minimal.rowCount,
  features: minimal.featureCount,
  uniqueKeys: minimal.uniqueKeys,
  skippedNullEntities: minimal.skippedNullEntityCount,
  missingCoordinates: minimal.missing.length,
  validGeoJSON: minimal.validation.valid
})
```

Na extração que originou o exemplo deste projeto, havia 614 locais físicos e uma entidade sem coordenada no conjunto original. Por isso a configuração mínima usa `requireAllCoordinates: false` para permitir a inspeção de `minimal.missing`.

Veja os registros realmente sem coordenada:

```js
minimal.missing
```

Veja linhas cuja **própria dimensão** era nula no Qlik:

```js
minimal.skippedNullEntities
```

Esses dois casos são diferentes.

---

# Entidades nulas versus coordenadas ausentes

A versão atual distingue explicitamente:

```text
skippedNullEntities
  = a dimensão da linha veio com qIsNull: true

missing
  = há uma entidade real identificável, mas o par lat/lon não é válido
```

Por padrão:

```js
skipNullEntities: true
```

Quando uma célula QIX possui `qIsNull: true`, ela é ignorada e registrada em:

```js
result.skippedNullEntities
result.skippedNullEntityCount
```

Isso vale mesmo quando o Qlik usa um texto de apresentação para representar o nulo.

Se você quiser transformar uma dimensão nula em erro:

```js
skipNullEntities: false
```

`requireAllCoordinates: true` continua tratando como erro **entidades reais** sem coordenadas.

---

# Diagnosticar `Only()` retornando nulo

O extrator calcula as coordenadas de cada entidade com a lógica equivalente a:

```text
Only([LATITUDE_FIELD])
Only([LONGITUDE_FIELD])
```

Se uma `entityKey` estiver associada a vários valores distintos, `Only()` retorna nulo.

Para investigar um caso, faça temporariamente:

```js
var debugConfig = {
  ...minimalConfig,
  properties: [
    {
      field: "NUM_LATITUDE_LOCAL",
      label: "latitudes_distintas",
      aggregation: "concat"
    },
    {
      field: "NUM_LONGITUDE_LOCAL",
      label: "longitudes_distintas",
      aggregation: "concat"
    }
  ],
  requireAllCoordinates: false
};

var debug = await extractor.extract(debugConfig);
debug.missing
```

Se uma entidade possuir vários valores concatenados, a chave escolhida está agregando mais de uma posição espacial.

---

# Etapa D — configuração completa do TRE-DF

Depois da validação mínima, use a configuração completa.

```js
var treDfConfig = {
  appId: "b92de30a-82aa-4d13-8286-cd423498e34e",
  name: "locais_votacao_tre_df",

  entityKey: "COD_OBJETO_LOCAL",
  latitudeField: "NUM_LATITUDE_LOCAL",
  longitudeField: "NUM_LONGITUDE_LOCAL",

  properties: [
    "NOM_LOCAL",
    "NUM_LOCAL",
    "NUM_ZONA",
    "COD_OBJETO_ZONA",
    "NOM_BAIRRO_LOCAL",
    "DES_ENDERECO_LOCAL",
    {
      field: "DAT_ATUALIZACAO",
      label: "DAT_ATUALIZACAO",
      aggregation: "maxTimestamp"
    }
  ],

  measures: [
    {
      label: "QT_ELEITORES",
      expression: "Count(COD_OBJETO_ELEITOR)"
    },
    {
      label: "QT_ELEITORES_APTOS",
      expression: "Count({<COD_SIT_ELEITOR = {\"0\", \"9\"}>} COD_OBJETO_ELEITOR)"
    },
    {
      label: "QT_ELEITORES_NAO_APTOS",
      expression: "Count({<COD_SIT_ELEITOR -= {\"0\", \"9\"}>} COD_OBJETO_ELEITOR)"
    },
    {
      label: "QT_SECOES",
      expression: "Count(Distinct COD_OBJETO_SECAO)"
    }
  ],

  navigationLinks: true,

  coordinateSourceField: "coordenada_origem",
  coordinateSourceValue: "TRE-DF/Qlik",

  coordinateOverrides: {
    "gjgh23121812463300": {
      latitude: -15.83328021,
      longitude: -48.13200421,
      source: "manual",
      expected: {
        field: "NOM_LOCAL",
        value: "ESCOLA CLASSE JUSCELINO KUBITSCHEK"
      }
    }
  },

  requireAllCoordinates: true
};
```

Execute:

```js
var result = await extractor.extract(treDfConfig);
```

Confira antes de baixar:

```js
({
  rows: result.rowCount,
  features: result.featureCount,
  uniqueKeys: result.uniqueKeys,
  skippedNullEntities: result.skippedNullEntityCount,
  missingCoordinates: result.missing.length,
  manualOverrides: result.appliedOverrides.length,
  validGeoJSON: result.validation.valid
})
```

Para o conjunto usado na construção do exemplo, o resultado final esperado é:

```js
{
  rows: 614,
  features: 614,
  uniqueKeys: 614,
  skippedNullEntities: 0,
  missingCoordinates: 0,
  manualOverrides: 1,
  validGeoJSON: true
}
```

A correção manual está registrada explicitamente e protegida por uma verificação do nome esperado. Ela não é aplicada silenciosamente a outra entidade.

---

# Etapa E — validar as feições

Veja algumas feições:

```js
result.featureCollection.features.slice(0, 5)
```

Tabela de conferência:

```js
console.table(
  result.featureCollection.features.map(f => ({
    codigo: f.properties.COD_OBJETO_LOCAL,
    local: f.properties.NOM_LOCAL,
    zona: f.properties.NUM_ZONA,
    latitude: f.properties.latitude,
    longitude: f.properties.longitude,
    origem: f.properties.coordenada_origem
  }))
)
```

Confira pelo menos:

- quantidade de linhas e feições;
- unicidade da `entityKey`;
- `missing` vazio na extração final;
- coordenadas plausíveis;
- quantidade esperada de overrides;
- valores dos principais atributos.

---

# Etapa F — baixar o GeoJSON

Depois da conferência:

```js
downloadGeoJSON(
  "tre_df_locais_votacao_final.geojson",
  result.featureCollection
);
```

---

# Propriedades e agregações

Toda propriedade configurada é avaliada sob a dimensão `entityKey`.

Uma string simples:

```js
"NOM_LOCAL"
```

é equivalente a:

```text
Only([NOM_LOCAL])
```

Agregações embutidas:

```text
only
concat
max
min
maxTimestamp
```

Exemplo usando apenas campos do painel público TRE-DF:

```js
properties: [
  "NOM_LOCAL",
  { field: "NOM_BAIRRO_LOCAL", aggregation: "only" },
  { field: "DAT_ATUALIZACAO", aggregation: "maxTimestamp" }
]
```

Também é possível fornecer uma expressão Qlik explicitamente:

```js
{
  label: "NOM_LOCAL_MAIUSCULO",
  expression: "Upper(Only([NOM_LOCAL]))"
}
```

---

# Medidas

Medidas recebem expressões Qlik fornecidas explicitamente.

No TRE-DF:

```js
measures: [
  {
    label: "QT_ELEITORES",
    expression: "Count(COD_OBJETO_ELEITOR)"
  },
  {
    label: "QT_SECOES",
    expression: "Count(Distinct COD_OBJETO_SECAO)"
  }
]
```

Use medidas somente quando a agregação fizer sentido para a entidade física escolhida.

---

# Google Maps e Waze

Com:

```js
navigationLinks: true
```

a feature recebe, por padrão:

```text
google_maps
waze
```

Os links apontam para as coordenadas da própria feature.

---

# Correções manuais de coordenadas

Use `coordinateOverrides` somente quando houver uma correção conhecida e documentada.

O exemplo concreto está na configuração TRE-DF acima. A estrutura geral é:

```js
coordinateOverrides: {
  "ENTITY_KEY_VALUE": {
    latitude: -15.0,
    longitude: -48.0,
    source: "manual",
    expected: {
      field: "FIELD_INCLUDED_IN_PROPERTIES",
      value: "EXPECTED VALUE"
    }
  }
}
```

O campo usado em `expected.field` precisa estar incluído em `properties`.

---

# Virtual proxy

Se a instalação Qlik estiver sob um virtual proxy, instancie o extrator com o respectivo caminho:

```js
var Extractor = globalThis.QlikGeoJSONExtractor.QlikGeoJSONExtractor;
var extractor = new Extractor({
  virtualProxyPath: "/VIRTUAL_PROXY"
});
```

Isso ajusta o endpoint de CSRF e a rota do WebSocket.

---

# Diagnóstico rápido

## O Console mostra `undefined` após colar o bundle

Normal. Confirme:

```js
globalThis.QlikGeoJSONExtractor
```

## `QlikGeoJSONExtractor is not a constructor`

Use a classe dentro do namespace:

```js
var Extractor = globalThis.QlikGeoJSONExtractor.QlikGeoJSONExtractor;
var extractor = new Extractor();
```

## `probe()` funciona, mas há outros erros vermelhos

Se `probe()` retorna os quatro estados de sucesso, mensagens de extensões ou recursos opcionais podem ser independentes do extrator.

## `latitudeCardinality: null`

Veja os valores brutos:

```js
report.pointLayers
```

Referências diretas simples são resolvidas. Expressões Qlik complexas não são interpretadas como nomes de campo.

## `N entities have no valid coordinates`

Refaça temporariamente com:

```js
requireAllCoordinates: false
```

Depois inspecione:

```js
result.missing
result.skippedNullEntities
```

## `rows` é maior que `features`

Veja:

```js
({
  rows: result.rowCount,
  features: result.featureCount,
  skippedNullEntities: result.skippedNullEntityCount,
  missingCoordinates: result.missing.length
})
```

As diferenças devem ser explicadas por entidades nulas ignoradas e/ou entidades reais sem coordenadas.

## Nenhum `PointLayer` foi encontrado

A sheet pode:

- não conter um mapa;
- usar outro tipo de layer;
- usar geocodificação textual;
- usar uma estrutura Qlik ainda não suportada.

---

# Uso por módulos ES

O caminho recomendado para investigação manual é o bundle no DevTools. Para integração em código:

```js
import {
  QlikGeoJSONExtractor,
  downloadGeoJSON
} from "./src/index.js";

const extractor = new QlikGeoJSONExtractor();
```

A configuração pública completa também está em:

```text
examples/tre-df-locais-votacao.config.js
```

---

# Testes e build

Não há dependências npm de runtime.

Requer Node.js 18 ou superior para testes/build:

```bash
npm test
npm run build
npm run check
```

`npm run build` regenera:

```text
browser/qlik-geojson-extractor.js
```

O bundle é um artefato gerado; faça mudanças em `src/` e regenere-o, em vez de editá-lo manualmente.

---

# Limitações deliberadas

- o extrator implementa atualmente o fluxo de geometria `Point` por latitude/longitude;
- não interpreta semanticamente expressões Qlik complexas para descobrir campos ocultos nelas;
- sugestões de `entityKey` são heurísticas e exigem validação humana;
- `Only()` retorna nulo quando a entidade escolhida possui múltiplos valores distintos para uma propriedade/coordenada;
- uma correção manual de coordenada precisa ser explicitamente configurada;
- mapas por geocodificação textual, polígonos, linhas e outros tipos de layer exigem suporte adicional.

Veja também:

```text
docs/ARCHITECTURE.md
docs/LIMITATIONS.md
```
