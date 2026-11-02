import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output,
  WebMOutputFormat } from 'mediabunny';

// O remux mantém o arquivo inteiro em memória; acima disso fica o WebM original.
export const MAX_FINALIZE_BYTES = 1_500_000_000;

// O MediaRecorder grava WebM "ao vivo", sem duração nem índice de seek. Reescreve o
// contêiner copiando os pacotes (sem recodificar). Em qualquer falha devolve o original.
export async function finalizeWebm(blob, { maxBytes = MAX_FINALIZE_BYTES } = {}) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > maxBytes) return blob;
  try {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({ input, output, copy: { mode: 'forced' } });
    if (!conversion.isValid || conversion.discardedTracks.length) return blob;
    await conversion.execute();
    const fixed = new Blob([output.target.buffer], { type: blob.type });
    return fixed.size ? fixed : blob;
  } catch {
    return blob;
  }
}
