export function downloadJSON(filename, data, mimeType = "application/json;charset=utf-8") {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function downloadGeoJSON(filename, featureCollection) {
  downloadJSON(filename, featureCollection, "application/geo+json;charset=utf-8");
}
