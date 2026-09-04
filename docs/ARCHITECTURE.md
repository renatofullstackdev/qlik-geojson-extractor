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
   │     ├── coordinate statistics
   │     └── entity-key spatial profiles
   └── extract
         ├── session hypercube
         ├── pagination
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

## Coordenadas

`PointLayer.locationOrLatitude` e `PointLayer.longitude` são classificados como:

```text
field       → referência simples a campo
expression  → expressão Qlik complexa preservada
unknown     → informação ausente
```

Para campos, o `inspect()` calcula mínimo, máximo, cardinalidades e pares distintos.

## Entity key

A sugestão ocorre em duas etapas:

1. pool barato por metadados/cardinalidade/tabela-fonte;
2. análise QIX dos melhores candidatos, medindo zero/um/múltiplos pares de coordenadas por valor.

Essa segunda etapa é a evidência principal.
