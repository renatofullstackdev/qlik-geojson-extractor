# Architecture

The project separates Qlik transport from semantic extraction.

1. `qix-client.js`: CSRF, WebSocket, JSON-RPC, `OpenDoc`.
2. `app-inspector.js`: field list, cardinalities, source tables, key suggestions.
3. `map-inspector.js`: sheet property tree, maps and PointLayers.
4. `hypercube.js`: creates an independent session hypercube using a configured physical entity key.
5. `geojson.js`: turns rows into Point features, applies explicit coordinate overrides and validates output.
6. `extractor.js`: high-level `probe`, `inspect` and `extract` workflows.

## Why extraction does not blindly clone the map cube

A Qlik map's visual dimension is not necessarily the physical spatial entity. A map may group several physical records by a display name. `inspect()` therefore exposes field cardinalities and candidate keys, while `extract()` requires an explicit `entityKey`.

This design avoids the failure mode discovered in the TRE-DF case: 614 physical voting locations were grouped into 568 distinct `NOM_LOCAL` values.

## Session isolation

The client opens the app through an `/identity/<uuid>` WebSocket URL. This isolates extraction selections/session state from the visible Qlik sheet and avoids sharing the browser client's default app session.

## Security

The generic extractor never enumerates record values unless the caller explicitly configures fields for extraction. `inspect()` lists only model field metadata/cardinalities/source tables.


## Chrome extension layer

The optional `chrome-extension/` directory provides a Manifest V3 Side Panel around the same browser bundle. It does not fork QIX behavior. `scripts/build-extension.mjs` copies the generated browser bundle into `chrome-extension/core/`, and the Side Panel injects that core into the active Qlik tab using `chrome.scripting` in the `MAIN` world.

The extension intentionally uses temporary `activeTab` access instead of persistent host permissions. Configuration may be persisted locally, but extracted GeoJSON is not written to extension storage. See `CHROME_EXTENSION.md`.
