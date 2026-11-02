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
