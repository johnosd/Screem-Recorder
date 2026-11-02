// Cópia de segurança da gravação em IndexedDB: os chunks vão para o disco enquanto o
// MediaRecorder grava, para a gravação poder ser recuperada se a janela ou o Chrome fechar.
const DB_NAME = 'recorder-recovery';
const META = 'meta';
const CHUNKS = 'chunks';

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export async function openRecoveryStore(factory = globalThis.indexedDB) {
  const open = factory.open(DB_NAME, 1);
  open.onupgradeneeded = () => {
    open.result.createObjectStore(META);
    open.result.createObjectStore(CHUNKS, { autoIncrement: true });
  };
  const db = await request(open);

  async function clear() {
    const tx = db.transaction([META, CHUNKS], 'readwrite');
    tx.objectStore(META).clear();
    tx.objectStore(CHUNKS).clear();
    await done(tx);
  }

  return {
    async startSession(meta) {
      await clear();
      const tx = db.transaction(META, 'readwrite');
      tx.objectStore(META).put({ ...meta }, 'current');
      await done(tx);
    },
    async appendChunk(blob) {
      const tx = db.transaction(CHUNKS, 'readwrite');
      tx.objectStore(CHUNKS).add(blob);
      await done(tx);
    },
    // Devolve { meta, blob } ou null se não houver sessão com dados.
    async loadSession() {
      const tx = db.transaction([META, CHUNKS], 'readonly');
      const [meta, parts] = await Promise.all([
        request(tx.objectStore(META).get('current')),
        request(tx.objectStore(CHUNKS).getAll())
      ]);
      const size = parts.reduce((total, part) => total + part.size, 0);
      if (!meta || !size) return null;
      return { meta, blob: new Blob(parts, { type: meta.type || 'video/webm' }) };
    },
    clear,
    close() { db.close(); }
  };
}
