# Limitations

- Primary target: Qlik Sense Enterprise deployments reachable from the browser through the Qlik Engine WebSocket.
- CSRF flow assumes `/qps/csrftoken` or the same endpoint under a configured virtual proxy path.
- Geometry extraction currently targets latitude/longitude Point data.
- AreaLayer, LineLayer, DensityLayer and Qlik geocoded textual locations are inspected but not converted to geometry.
- Extraction opens an isolated identity, so it does not automatically inherit current interactive selections from the visible sheet.
- `entityKey` must be selected deliberately. `inspect()` can rank candidates but never chooses one silently.
- `inspect()` resolves simple direct field references such as `=LATITUDE` and `=[ENTITY NAME]`. Complex Qlik expressions such as `=Only([LATITUDE])` are deliberately not interpreted as field names and may therefore have `null` cardinality in diagnostics.
- Qlik null dimension rows (`qIsNull: true`) are skipped by default and are reported in `skippedNullEntities`. Set `skipNullEntities: false` to make them fatal instead.
- Property fields are aggregated under the configured entity key. The default is `Only(field)`; configure `concat`, `max`, `min`, `maxTimestamp`, or a custom expression when needed.
- Coordinate overrides are explicit configuration and should be documented/provenanced by the caller.
