import { createUnloadGuard } from '../../src/unload-guard.js';

function fakeTarget() {
  const handlers = new Set();
  return {
    handlers,
    addEventListener: (type, fn) => type === 'beforeunload' && handlers.add(fn),
    removeEventListener: (type, fn) => type === 'beforeunload' && handlers.delete(fn),
    fire() {
      const event = { prevented: false, returnValue: undefined,
        preventDefault() { this.prevented = true; } };
      handlers.forEach(fn => fn(event));
      return event;
    }
  };
}

describe('createUnloadGuard', () => {
  test('bloqueia o fechamento apenas enquanto houver algo não salvo', () => {
    const target = fakeTarget();
    let dirty = false;
    createUnloadGuard(target, () => dirty);
    expect(target.fire().prevented).toBe(false);
    dirty = true;
    const event = target.fire();
    expect(event.prevented).toBe(true);
    expect(event.returnValue).toBe('');
  });

  test('a função retornada remove o listener', () => {
    const target = fakeTarget();
    const dispose = createUnloadGuard(target, () => true);
    expect(target.handlers.size).toBe(1);
    dispose();
    expect(target.handlers.size).toBe(0);
    expect(target.fire().prevented).toBe(false);
  });
});
