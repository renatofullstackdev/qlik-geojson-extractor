# qlik-geojson-extractor

Browser-first toolkit to inspect Qlik Sense apps and extract latitude/longitude Point data to GeoJSON through the Qlik Engine (QIX) API.

The project was generalized from a real TRE-DF map extraction, but the core has no TRE-DF-specific assumptions.

## What it does

- fetches the Qlik CSRF token;
- opens an isolated Qlik Engine WebSocket session using `/identity/<uuid>`;
- opens an app with `OpenDoc`;
- probes a sheet and retrieves its full property tree;
- discovers maps and `PointLayer`s;
- lists app fields, cardinalities, tags and source tables;
- ranks possible physical entity keys without choosing one silently;
- creates a clean session hypercube using an explicit entity key;
- paginates all straight-hypercube rows;
- builds validated Point GeoJSON;
- optionally adds Google Maps and Waze navigation links;
- supports explicit coordinate overrides with provenance and optional identity checks.

## Requirements

- Open the Qlik Sense page in a browser where you are already authorized to access the app.
- The Qlik proxy must expose the Engine WebSocket to that browser session.
- Modern browser with `fetch`, `WebSocket`, `crypto.randomUUID`, `Blob` and ES modules.

No runtime npm dependencies are required.

## Core workflow

### 1. Probe connectivity

```js
import { QlikGeoJSONExtractor } from "./src/index.js";

const extractor = new QlikGeoJSONExtractor();

console.log(await extractor.probe({
  appId: "APP_GUID",
  sheetId: "SHEET_ID"
}));
```

Expected successful shape:

```js
{
  websocket: "OPEN",
  openDoc: "SUCCESS",
  getSheet: "SUCCESS",
  getFullPropertyTree: "SUCCESS"
}
```

### 2. Inspect before extracting

```js
const report = await extractor.inspect({
  appId: "APP_GUID",
  sheetId: "SHEET_ID"
});

console.log(report.pointLayers);
console.log(report.entityKeySuggestions);
```

Do not assume that the map's display dimension is the physical entity key. Compare cardinalities and source semantics.

### 3. Extract

```js
const result = await extractor.extract({
  appId: "APP_GUID",
  name: "my_points",
  entityKey: "COD_ENTITY",
  latitudeField: "LATITUDE",
  longitudeField: "LONGITUDE",
  properties: [
    "NAME",
    "ADDRESS",
    { field: "UPDATED_AT", aggregation: "maxTimestamp" }
  ],
  measures: [
    { label: "COUNT_RECORDS", expression: "Count(ID)" }
  ],
  navigationLinks: true,
  requireAllCoordinates: true
});

console.log(result.featureCollection);
```

### Property aggregation

A configured property is evaluated under the physical `entityKey` dimension.

```js
properties: [
  "NAME",                                      // Only([NAME])
  { field: "ADDRESS", aggregation: "only" },
  { field: "TAG", aggregation: "concat" },
  { field: "UPDATED_AT", aggregation: "maxTimestamp" },
  { label: "CUSTOM", expression: "Upper(Only([NAME]))" }
]
```

Supported built-ins: `only`, `concat`, `max`, `min`, `maxTimestamp`. A custom Qlik expression can always be supplied.

## Virtual proxy

If Qlik is exposed under a virtual proxy such as `/finance`, configure:

```js
const extractor = new QlikGeoJSONExtractor({
  virtualProxyPath: "/finance"
});
```

This changes both the CSRF endpoint and WebSocket route.

## Coordinate overrides

Use only for explicit, documented corrections:

```js
coordinateOverrides: {
  "ENTITY_KEY": {
    latitude: -15.8,
    longitude: -48.1,
    source: "manual",
    expected: {
      field: "NAME",
      value: "EXPECTED NAME"
    }
  }
}
```

The optional `expected` guard prevents silently applying a correction if the identifier is later reused or changed.

## TRE-DF example

`examples/tre-df-locais-votacao.config.js` contains the complete configuration used for the voting-place dataset, including the one documented coordinate override.

From a module-capable environment on the Qlik page:

```js
import { QlikGeoJSONExtractor, downloadGeoJSON } from "./src/index.js";
import { treDfLocaisVotacaoConfig } from "./examples/tre-df-locais-votacao.config.js";

const extractor = new QlikGeoJSONExtractor();
const result = await extractor.extract(treDfLocaisVotacaoConfig);
downloadGeoJSON("tre_df_locais_votacao_final.geojson", result.featureCollection);
```

## Browser bundle

For DevTools/Snippets where importing local ES modules is inconvenient, use:

`browser/qlik-geojson-extractor.js`

Paste that entire file once. It creates:

```js
window.QlikGeoJSONExtractor
```

Then run:

```js
const extractor = new QlikGeoJSONExtractor.QlikGeoJSONExtractor();
```

The bundle exposes the same high-level API plus `downloadJSON` and `downloadGeoJSON`.

## Tests

```bash
npm test
npm run check
```

The tests use Node's built-in test runner and require no package installation.

## Important semantic rule

**A visual map dimension is not necessarily a spatial entity key.**

If a map displays `NOM_LOCAL`, multiple physical places with the same name may be aggregated. Always inspect cardinalities and choose a physical key explicitly before producing a final GeoJSON.

See `docs/ARCHITECTURE.md` and `docs/LIMITATIONS.md`.
