const OPEN = 1;
const CLOSED = 3;

// Pede ao Deepgram para descarregar os resultados pendentes (CloseStream) e só
// então fecha o socket. Resolve no `close` do servidor ou após `timeoutMs`.
export function closeDeepgramSocket(socket, timeoutMs = 3000) {
  if (!socket || socket.readyState === CLOSED) return Promise.resolve();
  return new Promise(resolve => {
    let timer = null;
    const finish = () => {
      clearTimeout(timer);
      socket.removeEventListener?.('close', finish);
      if (socket.readyState !== CLOSED) {
        try { socket.close(); } catch { /* já fechando */ }
      }
      resolve();
    };
    if (socket.readyState !== OPEN) { finish(); return; }
    socket.addEventListener('close', finish);
    timer = setTimeout(finish, timeoutMs);
    try {
      socket.send(JSON.stringify({ type: 'CloseStream' }));
    } catch {
      finish();
    }
  });
}

// Mantém o WebSocket aberto enquanto nenhum áudio é enviado (ex.: gravação pausada).
export function startKeepAlive(socket, intervalMs = 4000) {
  const timer = setInterval(() => {
    if (socket?.readyState === OPEN) socket.send(JSON.stringify({ type: 'KeepAlive' }));
  }, intervalMs);
  return () => clearInterval(timer);
}
