// Timestamp ISO sem caracteres inválidos em nomes de arquivo: 2026-11-02T14-39-05
export function timestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export function downloadBlob(blob, filename, { doc = document, urls = URL, revokeAfterMs = 15000 } = {}) {
  const url = urls.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
  setTimeout(() => urls.revokeObjectURL(url), revokeAfterMs);
}
