import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openRecoveryStore } from '../../src/recovery-store.js';

const text = blob => blob.text();
let store;
beforeEach(async () => { store = await openRecoveryStore(new IDBFactory()); });
afterEach(() => store.close());

test('sem sessão ou sem dados não há o que recuperar', async () => {
  expect(await store.loadSession()).toBeNull();
  await store.startSession({ mode: 'video', type: 'video/webm' });
  expect(await store.loadSession()).toBeNull();
});

test('junta os chunks gravados na ordem e devolve os metadados', async () => {
  await store.startSession({ mode: 'audio', type: 'audio/webm', startedAt: 123 });
  await store.appendChunk(new Blob(['aaa']));
  await store.appendChunk(new Blob(['bbb']));
  await store.appendChunk(new Blob(['cc']));
  const session = await store.loadSession();
  expect(session.meta).toMatchObject({ mode: 'audio', startedAt: 123 });
  expect(session.blob.type).toBe('audio/webm');
  expect(await text(session.blob)).toBe('aaabbbcc');
});

test('nova sessão descarta a anterior e clear apaga tudo', async () => {
  await store.startSession({ mode: 'video', type: 'video/webm' });
  await store.appendChunk(new Blob(['velho']));
  await store.startSession({ mode: 'audio', type: 'audio/webm' });
  await store.appendChunk(new Blob(['novo']));
  expect(await text((await store.loadSession()).blob)).toBe('novo');
  await store.clear();
  expect(await store.loadSession()).toBeNull();
});

test('os dados sobrevivem à reabertura do banco', async () => {
  const factory = new IDBFactory();
  const first = await openRecoveryStore(factory);
  await first.startSession({ mode: 'video', type: 'video/webm' });
  await first.appendChunk(new Blob(['persistido']));
  first.close();
  const second = await openRecoveryStore(factory);
  expect(await text((await second.loadSession()).blob)).toBe('persistido');
  second.close();
});

describe('partes da gravação (feature 003)', () => {
  test('gravações salvas pela versão anterior (Blob solto) continuam recuperáveis como parte 1', async () => {
    const factory = new IDBFactory();
    const legacy = await openRecoveryStore(factory);
    await legacy.startSession({ mode: 'audio', type: 'audio/webm' });
    legacy.close();
    // Escreve um Blob solto direto no object store, como a versão anterior fazia.
    const db = await new Promise((resolve, reject) => {
      const open = factory.open('recorder-recovery', 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('chunks', 'readwrite');
      tx.objectStore('chunks').add(new Blob(['antigo-1']));
      tx.objectStore('chunks').add(new Blob(['antigo-2']));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const store = await openRecoveryStore(factory);
    const session = await store.loadSession();
    expect(session.parts.map(part => part.index)).toEqual([1]);
    expect(await text(session.parts[0].blob)).toBe('antigo-1antigo-2');
    expect(await text(session.blob)).toBe('antigo-1antigo-2');
    await store.markPartDownloaded(1);
    expect(await store.loadSession()).toBeNull();
    store.close();
  });

  test('partes saem em ordem numérica e blob reúne todas; o tipo vem dos metadados', async () => {
    await store.startSession({ mode: 'video', type: 'video/webm' });
    await store.appendChunk(new Blob(['p10']), 10);
    await store.appendChunk(new Blob(['p2']), 2);
    await store.appendChunk(new Blob(['p10b']), 10);
    const session = await store.loadSession();
    expect(session.parts.map(part => part.index)).toEqual([2, 10]);
    expect(await text(session.parts[1].blob)).toBe('p10p10b');
    expect(session.parts.every(part => part.blob.type === 'video/webm')).toBe(true);
    expect(session.blob.size).toBe('p10p2p10b'.length);
  });

  test('marcar parte inexistente como baixada não apaga nem falha', async () => {
    await store.startSession({ mode: 'video', type: 'video/webm' });
    await store.appendChunk(new Blob(['x']), 1);
    await store.markPartDownloaded(99);
    expect((await store.loadSession()).parts.map(part => part.index)).toEqual([1]);
  });

  test('apagar a última parte baixada remove também os metadados', async () => {
    await store.startSession({ mode: 'video', type: 'video/webm' });
    await store.appendChunk(new Blob(['x']), 1);
    await store.appendChunk(new Blob(['y']), 2);
    await store.markPartDownloaded(1);
    expect((await store.loadSession()).parts.map(part => part.index)).toEqual([2]);
    await store.markPartDownloaded(2);
    expect(await store.loadSession()).toBeNull();
    await store.startSession({ mode: 'audio', type: 'audio/webm' });
    await store.appendChunk(new Blob(['z']));
    expect((await store.loadSession()).meta.mode).toBe('audio');
  });
});
