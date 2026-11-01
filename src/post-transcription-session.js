// Contrato público inicial da feature 001. Implementação: sdd-execute.
export function createPostTranscriptionSession({ transcribe }) {
  void transcribe;
  return {
    setSource() {},
    setExistingTranscript() {},
    async start() { throw new Error('not implemented'); },
    cancel() { throw new Error('not implemented'); },
    getSnapshot() { throw new Error('not implemented'); },
    subscribe() { throw new Error('not implemented'); }
  };
}
