import { downloadBlob, timestamp } from './download.js';

test('timestamp gera texto seguro para nome de arquivo', () => {
  expect(timestamp(new Date('2026-11-02T14:39:05.123Z'))).toBe('2026-11-02T14-39-05');
});

test('downloadBlob clica em um link temporário e libera a URL depois', () => {
  jest.useFakeTimers();
  const a = { click: jest.fn() };
  const doc = { createElement: jest.fn(() => a),
    body: { appendChild: jest.fn(), removeChild: jest.fn() } };
  const urls = { createObjectURL: jest.fn(() => 'blob:x'), revokeObjectURL: jest.fn() };
  downloadBlob(new Blob(['x']), 'arquivo.txt', { doc, urls });
  expect(a).toMatchObject({ href: 'blob:x', download: 'arquivo.txt' });
  expect(a.click).toHaveBeenCalledTimes(1);
  expect(doc.body.removeChild).toHaveBeenCalledWith(a);
  expect(urls.revokeObjectURL).not.toHaveBeenCalled();
  jest.advanceTimersByTime(15000);
  expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  jest.useRealTimers();
});
