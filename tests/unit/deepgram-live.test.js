import { closeDeepgramSocket, startKeepAlive } from '../../src/deepgram-live.js';

function fakeSocket(readyState = 1) {
  const listeners = {};
  return {
    readyState,
    sent: [],
    closed: 0,
    send(data) { this.sent.push(data); },
    close() { this.closed++; this.readyState = 3; },
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener(type) { delete listeners[type]; },
    emit(type) { this.readyState = 3; listeners[type]?.(); }
  };
}

describe('closeDeepgramSocket', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('resolve de imediato sem socket ou com socket fechado', async () => {
    await expect(closeDeepgramSocket(null)).resolves.toBeUndefined();
    const closed = fakeSocket(3);
    await expect(closeDeepgramSocket(closed)).resolves.toBeUndefined();
    expect(closed.sent).toEqual([]);
  });

  test('envia CloseStream e resolve quando o servidor fecha', async () => {
    const socket = fakeSocket();
    const done = closeDeepgramSocket(socket);
    expect(socket.sent).toEqual([JSON.stringify({ type: 'CloseStream' })]);
    expect(socket.closed).toBe(0);
    socket.emit('close');
    await expect(done).resolves.toBeUndefined();
    expect(socket.closed).toBe(0);
  });

  test('fecha o socket à força se o servidor não responder no prazo', async () => {
    const socket = fakeSocket();
    const done = closeDeepgramSocket(socket, 1000);
    jest.advanceTimersByTime(1000);
    await expect(done).resolves.toBeUndefined();
    expect(socket.closed).toBe(1);
  });

  test('socket ainda conectando é fechado sem enviar CloseStream', async () => {
    const socket = fakeSocket(0);
    await closeDeepgramSocket(socket);
    expect(socket.sent).toEqual([]);
    expect(socket.closed).toBe(1);
  });

  test('falha ao enviar não trava: fecha e resolve', async () => {
    const socket = fakeSocket();
    socket.send = () => { throw new Error('boom'); };
    await expect(closeDeepgramSocket(socket)).resolves.toBeUndefined();
    expect(socket.closed).toBe(1);
  });
});

describe('startKeepAlive', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('envia KeepAlive a cada intervalo até ser interrompido', () => {
    const socket = fakeSocket();
    const stop = startKeepAlive(socket, 1000);
    jest.advanceTimersByTime(2500);
    expect(socket.sent).toEqual(Array(2).fill(JSON.stringify({ type: 'KeepAlive' })));
    stop();
    jest.advanceTimersByTime(5000);
    expect(socket.sent).toHaveLength(2);
  });

  test('não envia nada se o socket não está aberto', () => {
    const socket = fakeSocket(3);
    startKeepAlive(socket, 1000);
    jest.advanceTimersByTime(3000);
    expect(socket.sent).toEqual([]);
  });
});
