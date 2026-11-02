// STUB (sdd-plan 003): o sdd-execute implementa o gravador em partes; ver logic/split-recorder.md.
export function createSplitRecorder({ createRecorder, limitBytes, timeslice = 1000, mimeType,
  onChunk, onPartClosed, onError } = {}) {
  void createRecorder; void limitBytes; void timeslice; void mimeType; void onChunk; void onPartClosed; void onError;
  throw new Error('not implemented');
}
