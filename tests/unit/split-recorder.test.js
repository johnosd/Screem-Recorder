import { createSplitRecorder } from '../../src/split-recorder.js';

function fakeRecorders({ finalChunk = 10 } = {}) {
  const created = [];
  const create = () => {
    const recorder = {
      state: 'inactive',
      start(timeslice) { this.state = 'recording'; this.timeslice = timeslice; },
      pause() { this.state = 'paused'; },
      resume() { this.state = 'recording'; },
      stop() {
        this.state = 'inactive';
        queueMicrotask(() => {
          if (finalChunk) this.ondataavailable?.({ data: new Blob([new Uint8Array(finalChunk)]) });
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

function build(factory, extra = {}) {
  const closed = [];
  const chunks = [];
  const instance = createSplitRecorder({ createRecorder: factory.create, limitBytes: 100, timeslice: 500,
    mimeType: 'audio/webm', onChunk: chunk => chunks.push(chunk), onPartClosed: part => closed.push(part), ...extra });
  return { instance, closed, chunks };
}

test('três divisões seguidas geram quatro partes ordenadas, sem perder bytes', async () => {
  const factory = fakeRecorders();
  const { instance, closed } = build(factory);
  instance.start();
  for (let round = 0; round < 3; round++) {
    const recorder = factory.created.at(-1);
    recorder.emit(70);
    recorder.emit(70);
    await settle();
  }
  factory.created.at(-1).emit(5);
  const result = await instance.stop();
  expect(factory.created).toHaveLength(4);
  expect(result.parts.map(part => part.index)).toEqual([1, 2, 3, 4]);
  expect(result.parts.map(part => part.blob.size)).toEqual([150, 150, 150, 15]);
  expect(closed.map(part => part.index)).toEqual([1, 2, 3, 4]);
  expect(factory.created.every(recorder => recorder.timeslice === 500)).toBe(true);
});

test('stop() durante a rotação espera a troca, não abre parte nova e é idempotente', async () => {
  const factory = fakeRecorders();
  const { instance } = build(factory);
  instance.start();
  factory.created[0].emit(60);
  factory.created[0].emit(60);              // dispara a rotação
  const first = instance.stop();            // antes de a rotação terminar
  const second = instance.stop();
  expect(second).toBe(first);
  const result = await first;
  expect(factory.created).toHaveLength(1);
  expect(result.parts.map(part => part.blob.size)).toEqual([130]);
  expect(await instance.stop()).toBe(result);
  expect(instance.state).toBe('inactive');
});

test('parte que termina vazia é descartada e os índices ficam sequenciais', async () => {
  const factory = fakeRecorders({ finalChunk: 0 });
  const { instance, closed } = build(factory);
  instance.start();
  factory.created[0].emit(60);
  factory.created[0].emit(60);
  await settle();
  expect(factory.created).toHaveLength(2);
  const result = await instance.stop();     // a parte 2 não recebeu nada
  expect(result.parts.map(part => part.index)).toEqual([1]);
  expect(closed.map(part => part.index)).toEqual([1]);
});

test('pedaços vazios são ignorados e onChunk recebe a parte certa', async () => {
  const factory = fakeRecorders({ finalChunk: 0 });
  const { instance, chunks } = build(factory);
  instance.start();
  factory.created[0].emit(0);
  factory.created[0].ondataavailable({ data: null });
  factory.created[0].emit(60);
  factory.created[0].emit(60);
  await settle();
  factory.created[1].emit(7);
  await instance.stop();
  expect(chunks.map(chunk => [chunk.part, chunk.blob.size])).toEqual([[1, 60], [1, 60], [2, 7]]);
});

test('erro em onChunk ou em onPartClosed não derruba a gravação', async () => {
  const factory = fakeRecorders();
  const { instance } = build(factory, {
    onChunk: () => { throw new Error('guarda falhou'); },
    onPartClosed: () => { throw new Error('remux falhou'); }
  });
  instance.start();
  factory.created[0].emit(60);
  factory.created[0].emit(60);
  await settle();
  factory.created[1].emit(20);
  const result = await instance.stop();
  expect(result.parts.map(part => part.blob.size)).toEqual([130, 30]);
  expect(result.error).toBeNull();
});

test('pausa pedida durante a troca vale para a parte nova; estado segue gravando na troca', async () => {
  const factory = fakeRecorders();
  const { instance } = build(factory);
  instance.start();
  factory.created[0].emit(60);
  factory.created[0].emit(60);
  expect(instance.state).toBe('recording');
  instance.pause();
  await settle();
  expect(factory.created[1].state).toBe('paused');
  expect(instance.state).toBe('paused');
  instance.resume();
  expect(factory.created[1].state).toBe('recording');
  await instance.stop();
});

test('falha ao criar o primeiro recorder sobe para quem chamou start() e iniciar duas vezes é recusado', () => {
  const failing = createSplitRecorder({ createRecorder: () => { throw new Error('sem captura'); }, limitBytes: 100 });
  expect(() => failing.start()).toThrow('sem captura');
  const factory = fakeRecorders();
  const { instance } = build(factory);
  instance.start();
  expect(() => instance.start()).toThrow();
});

test('recorder encerrado pelo próprio navegador: o último pedaço chegando depois do stop() não se perde', async () => {
  const factory = fakeRecorders();
  const { instance } = build(factory, { limitBytes: 1000 });
  instance.start();
  const recorder = factory.created[0];
  recorder.emit(40);
  // O navegador encerra o recorder (faixas terminaram): estado inativo agora, pedaço final e onstop depois.
  recorder.state = 'inactive';
  const stopping = instance.stop();
  await new Promise(resolve => setTimeout(resolve, 10));
  recorder.ondataavailable({ data: new Blob([new Uint8Array(25)]) });
  recorder.onstop();
  const result = await stopping;
  expect(result.parts.map(part => part.blob.size)).toEqual([65]);
});

test('se o onstop nunca chega, stop() não trava e entrega o que já recebeu', async () => {
  const factory = fakeRecorders();
  const { instance } = build(factory, { limitBytes: 1000, stopTimeoutMs: 30 });
  instance.start();
  const recorder = factory.created[0];
  recorder.emit(40);
  recorder.stop = function () { this.state = 'inactive'; };   // nunca dispara onstop
  const result = await instance.stop();
  expect(result.parts.map(part => part.blob.size)).toEqual([40]);
});
