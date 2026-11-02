// Pede confirmação ao Chrome antes de fechar a janela enquanto `isDirty()` for verdadeiro.
export function createUnloadGuard(target, isDirty) {
  const handler = event => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  target.addEventListener('beforeunload', handler);
  return () => target.removeEventListener('beforeunload', handler);
}
