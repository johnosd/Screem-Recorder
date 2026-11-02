import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';

// Duração em segundos lida do próprio arquivo (metadados e, se faltarem, varredura); null se não der.
export async function readDuration(blob) {
  if (!(blob instanceof Blob) || !blob.size) return null;
  try {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    const fromMetadata = await input.getDurationFromMetadata();
    if (Number.isFinite(fromMetadata) && fromMetadata > 0) return fromMetadata;
    const computed = await input.computeDuration();
    return Number.isFinite(computed) && computed > 0 ? computed : null;
  } catch {
    return null;
  }
}
