import { PART_LIMIT_BYTES, partFileName, resolvePartLimit } from '../../src/recording-parts.js';

test('resolvePartLimit aceita só inteiros dentro da faixa de teste', () => {
  expect(resolvePartLimit('?partLimitBytes=50000')).toBe(50_000);
  expect(resolvePartLimit(`?partLimitBytes=${PART_LIMIT_BYTES}`)).toBe(PART_LIMIT_BYTES);
  for (const search of ['?partLimitBytes=49999', `?partLimitBytes=${PART_LIMIT_BYTES + 1}`,
    '?partLimitBytes=1.5e6', '?partLimitBytes=-200000', '?partLimitBytes=', '?partLimitBytes=2e5',
    '?partLimitBytes= 200000', null, undefined]) {
    expect(resolvePartLimit(search)).toBe(PART_LIMIT_BYTES);
  }
  expect(resolvePartLimit('?a=1&partLimitBytes=300000&b=2')).toBe(300_000);
});

test('resolvePartLimit respeita um limite padrão informado', () => {
  expect(resolvePartLimit('', 500_000)).toBe(500_000);
  expect(resolvePartLimit('?partLimitBytes=600000', 500_000)).toBe(500_000);
});

test('partFileName usa largura do total e ordena corretamente em ordem alfabética', () => {
  const names = Array.from({ length: 12 }, (_, i) => partFileName('g', i + 1, 12));
  expect(names[0]).toBe('g_parte-01.webm');
  expect(names[11]).toBe('g_parte-12.webm');
  expect([...names].sort()).toEqual(names);
  const many = Array.from({ length: 105 }, (_, i) => partFileName('g', i + 1, 105));
  expect(many[0]).toBe('g_parte-001.webm');
  expect([...many].sort()).toEqual(many);
  expect(partFileName('g', 1, 0)).toBe('g.webm');
});
