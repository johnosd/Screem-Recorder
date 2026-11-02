// Contratos da feature 003-dividir-gravacoes-longas (travados por contract-tests.lock).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createSplitRecorder } from '../../src/split-recorder.js';
import { PART_LIMIT_BYTES, partFileName, resolvePartLimit } from '../../src/recording-parts.js';
import { MAX_FINALIZE_BYTES } from '../../src/webm-finalize.js';
import { openRecoveryStore } from '../../src/recovery-store.js';

// MediaRecorder falso: stop() entrega um último pedaço e depois dispara onstop, como o real.
function fakeRecorders({ finalChunk = 10, failOnCreate = null } = {}) {
  const created = [];
  const create = () => {
    if (failOnCreate && created.length + 1 === failOnCreate) throw new Error('captura indisponível');
    const recorder = {
      state: 'inactive',
      timeslice: null,
      start(timeslice) { this.state = 'recording'; this.timeslice = timeslice; },
      pause() { this.state = 'paused'; },
      resume() { this.state = 'recording'; },
      stop() {
        this.state = 'inactive';
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob([new Uint8Array(finalChunk)]) });
          this.onstop?.();
        });
      },
      emit(size) { this.ondataavailable?.({ data: new Blob([new Uint8Array(size)]) }); }
    };
    created.push(recorder);
    return recorder;
  };
  return { create, created };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function splitter(factory, extra = {}) {
  const closed = [];
  const onError = jest.fn();
  const instance = createSplitRecorder({ createRecorder: factory.create, limitBytes: 100, timeslice: 1000,
    mimeType: 'video/webm', onPartClosed: part => closed.push(part), onError, ...extra });
  return { instance, closed, onError };
}

test('US1/AC1 FR-001 FR-002: ao atingir o limite fecha a parte e continua em outra sem perder nem duplicar dados', async () => {
  const factory = fakeRecorders();
  const { instance, closed } = splitter(factory);
  instance.start();
  factory.created[0].emit(60);
  factory.created[0].emit(60);
  await settle();

  expect(factory.created).toHaveLength(2);
  expect(factory.created[1].state).toBe('recording');
  expect(factory.created[1].timeslice).toBe(1000);
  factory.created[1].emit(50);
  const result = await instance.stop();

  expect(result.parts.map(part => [part.index, part.blob.size])).toEqual([[1, 130], [2, 60]]);
  expect(closed.map(part => part.index)).toEqual([1, 2]);
  expect(result.parts.every(part => part.blob.type === 'video/webm')).toBe(true);
  expect(result.error).toBeNull();
});

test('US1/AC3 FR-002: pausa e retomada na divisão não perdem dados e a nova parte nasce gravando', async () => {
  const factory = fakeRecorders();
  const { instance } = splitter(factory);
  instance.start();
  factory.created[0].emit(60);
  instance.pause();
  expect(factory.created[0].state).toBe('paused');
  await settle();
  expect(factory.created).toHaveLength(1);

  instance.resume();
  expect(factory.created[0].state).toBe('recording');
  factory.created[0].emit(60);
  await settle();

  expect(factory.created).toHaveLength(2);
  expect(factory.created[1].state).toBe('recording');
  const result = await instance.stop();
  const total = result.parts.reduce((sum, part) => sum + part.blob.size, 0);
  expect(result.parts.map(part => part.blob.size)).toEqual([130, 10]);
  expect(total).toBe(60 + 60 + 10 + 10);
});

test('FR-011 SC-006: falha ao abrir a nova parte preserva as partes fechadas e encerra com erro', async () => {
  const factory = fakeRecorders({ failOnCreate: 2 });
  const { instance, closed, onError } = splitter(factory);
  instance.start();
  factory.created[0].emit(60);
  factory.created[0].emit(60);
  await settle();

  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0][0].message).toBe('captura indisponível');
  const result = await instance.stop();
  expect(result.parts.map(part => part.blob.size)).toEqual([130]);
  expect(closed.map(part => part.index)).toEqual([1]);
  expect(result.error?.message).toBe('captura indisponível');
});

test('US1/AC4 FR-004 SC-003: sem divisão há uma parte; nomes ordenáveis; limite abaixo do teto do remux e reduzível em teste', async () => {
  const factory = fakeRecorders();
  const { instance } = splitter(factory, { limitBytes: 1000 });
  instance.start();
  factory.created[0].emit(30);
  const result = await instance.stop();
  expect(factory.created).toHaveLength(1);
  expect(result.parts.map(part => [part.index, part.blob.size])).toEqual([[1, 40]]);

  expect(partFileName('gravacao-video_X', 1, 1)).toBe('gravacao-video_X.webm');
  expect([1, 2, 3].map(index => partFileName('g', index, 3)))
    .toEqual(['g_parte-01.webm', 'g_parte-02.webm', 'g_parte-03.webm']);
  expect(partFileName('g', 12, 120)).toBe('g_parte-012.webm');

  expect(PART_LIMIT_BYTES).toBeGreaterThan(1_000_000_000);
  expect(PART_LIMIT_BYTES).toBeLessThan(MAX_FINALIZE_BYTES);
  expect(resolvePartLimit('?partLimitBytes=200000')).toBe(200_000);
  for (const search of ['', '?x=1', '?partLimitBytes=abc', '?partLimitBytes=10', '?partLimitBytes=99999999999']) {
    expect(resolvePartLimit(search)).toBe(PART_LIMIT_BYTES);
  }
});

test('US3/AC1-3 FR-008 FR-009 SC-004: recuperação devolve as partes na ordem e partes baixadas não voltam', async () => {
  const store = await openRecoveryStore(new IDBFactory());
  await store.startSession({ mode: 'video', type: 'video/webm', startedAt: 1 });
  await store.appendChunk(new Blob(['a1']), 1);
  await store.appendChunk(new Blob(['a2']), 1);
  await store.appendChunk(new Blob(['b1']), 2);
  await store.appendChunk(new Blob(['c1']), 3);

  const first = await store.loadSession();
  expect((first.parts ?? []).map(part => part.index)).toEqual([1, 2, 3]);
  expect(await Promise.all((first.parts ?? []).map(part => part.blob.text()))).toEqual(['a1a2', 'b1', 'c1']);

  await store.markPartDownloaded(1);
  const second = await store.loadSession();
  expect((second.parts ?? []).map(part => part.index)).toEqual([2, 3]);

  await store.markPartDownloaded(2);
  await store.markPartDownloaded(3);
  expect(await store.loadSession()).toBeNull();
  store.close();
});
