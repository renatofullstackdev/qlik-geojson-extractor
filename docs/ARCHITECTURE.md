# Arquitetura

```text
Qlik Sense page
   │
   │ CSRF + QIX WebSocket
   ▼
src/ core
   │
   ├── probe
   ├── inspect
   │     ├── property tree / PointLayer
   │     ├── field inventory
   │     ├── spatial-source classification
   │     └── entity-key spatial profiles
   └── extract
         ├── session hypercube
         ├── pagination
         ├── spatial value → Point
         ├── GeoJSON conversion
         └── validation

browser/qlik-geojson-extractor.js
   │ generated bundle
   ▼
chrome-extension/core/qlik-geojson-extractor.js
   │ injected in MAIN world
   ▼
Chrome Side Panel
```

## Separação de responsabilidades

- `src/`: lógica QIX/GeoJSON independente da UI;
- `browser/`: bundle único para DevTools;
- `chrome-extension/core/`: cópia gerada do bundle;
- `chrome-extension/lib/`: lógica pura da UI, localização, configuração e URL;
- `chrome-extension/sidepanel/`: DOM e interação;
- `test/`: testes comportamentais com clientes QIX falsos.

## Diagnósticos estruturados

O core retorna códigos e parâmetros, não textos localizados. A extensão traduz em pt-BR. Isso evita vazamento de mensagens inglesas e permite manter detalhes técnicos separadamente.

## Fonte espacial

A abstração central é `spatialSource`:

```text
coordinates
├── latitude: field | expression | unknown
└── longitude: field | expression | unknown

location
└── location: field | expression | unknown
```

`PointLayer.isLatLong` escolhe o modo. `locationOrLatitude` só é chamado de latitude quando `isLatLong=true`. Quando `isLatLong=false`, qualquer longitude residual no objeto é ignorada operacionalmente.

O parser aceita referências diretas inequívocas e preserva expressões. Funções como `Only(...)`, `Avg(...)` ou `maxstring(...)` são reconhecidas como expressões mesmo sem `=` inicial. Em caso de dúvida, o tipo é `unknown`; uma expressão nunca é convertida silenciosamente em nome artificial de campo.

No modo `location`, valores no formato Qlik `[longitude, latitude]` podem ser convertidos localmente para `Point`. Outros valores são preservados no diagnóstico como não convertíveis, sem geocodificação.

## Entity key

A sugestão ocorre em duas etapas:

1. pool barato por metadados/cardinalidade/tabela-fonte;
2. quando a fonte espacial permite análise direta, hypercubes medem zero/uma/múltiplas representações espaciais por valor candidato.

A segunda etapa é a principal evidência. Quando ela não é possível, a confiança permanece `unknown` e os sinais sintáticos não são promovidos artificialmente a alta confiança.
