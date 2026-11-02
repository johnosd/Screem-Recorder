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
    // `part` indica a parte da gravação (1 por padrão). Valores antigos eram um Blob solto: valem como parte 1.
    async appendChunk(blob, part = 1) {
      const tx = db.transaction(CHUNKS, 'readwrite');
      tx.objectStore(CHUNKS).add({ part, blob });
      await done(tx);
    },
    // Devolve { meta, blob, parts } ou null se não houver sessão com dados.
    //   blob  - todos os pedaços juntos (gravações de uma parte e compatibilidade)
    //   parts - [{ index, blob }] por parte, em ordem
    async loadSession() {
      const tx = db.transaction([META, CHUNKS], 'readonly');
      const [meta, values] = await Promise.all([
        request(tx.objectStore(META).get('current')),
        request(tx.objectStore(CHUNKS).getAll())
      ]);
      const chunks = values.map(value => value instanceof Blob ? { part: 1, blob: value }
        : { part: value?.part ?? 1, blob: value?.blob });
      const size = chunks.reduce((total, chunk) => total + (chunk.blob?.size || 0), 0);
      if (!meta || !size) return null;
      const type = meta.type || 'video/webm';
      const byPart = new Map();
      for (const chunk of chunks) {
        if (!byPart.has(chunk.part)) byPart.set(chunk.part, []);
        byPart.get(chunk.part).push(chunk.blob);
      }
      const parts = [...byPart.keys()].sort((x, y) => x - y)
        .map(index => ({ index, blob: new Blob(byPart.get(index), { type }) }));
      return { meta, blob: new Blob(chunks.map(chunk => chunk.blob), { type }), parts };
    },
    // Apaga os pedaços de uma parte já baixada; sem pedaços restantes, apaga também os metadados.
    async markPartDownloaded(part) {
      const tx = db.transaction([META, CHUNKS], 'readwrite');
      const store = tx.objectStore(CHUNKS);
      await new Promise((resolve, reject) => {
        const cursor = store.openCursor();
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) { resolve(); return; }
          const value = current.value;
          const index = value instanceof Blob ? 1 : (value?.part ?? 1);
          if (index === part) current.delete();
          current.continue();
        };
      });
      const remaining = await request(store.count());
      if (remaining === 0) tx.objectStore(META).clear();
      await done(tx);
    },
    clear,
    close() { db.close(); }
  };
}
