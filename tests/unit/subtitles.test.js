import { buildSrt, groupCaptionSegments, recoverTimedSegments, validSrt } from '../../src/subtitles.js';

test('agrupa palavras em legendas por frase e pausa sem alterar os tempos extremos', () => {
  const words = [
    [0, 0.3, 'O'], [0.3, 0.6, 'modelo'], [0.6, 0.9, 'usa'],
    [0.9, 1.2, 'um'], [1.2, 1.5, 'plano'], [1.5, 1.8, 'para'],
    [1.8, 2.1, 'separar'], [2.1, 2.4, 'dados.'],
    [4, 4.3, 'Depois'], [4.3, 4.6, 'ele'], [4.6, 5, 'classifica.']
  ].map(([start, end, text]) => ({ start, end, text }));
  const grouped = groupCaptionSegments(words);
  expect(grouped).toEqual([
    { start: 0, end: 2.4, text: 'O modelo usa um plano para separar dados.' },
    { start: 4, end: 5, text: 'Depois ele classifica.' }
  ]);
  expect(validSrt(buildSrt(grouped))).toBe(true);
  expect(words[0].text).toBe('O');
});

test('limita duração e quebra linhas em até 42 caracteres sem cortar palavras', () => {
  const words = Array.from({ length: 20 }, (_, index) => ({
    start: index * 0.35, end: index * 0.35 + 0.3, text: 'palavra'
  }));
  const grouped = groupCaptionSegments(words);
  expect(grouped.length).toBeGreaterThan(1);
  expect(grouped.flatMap(cue => cue.text.split('\n').map(line => line.length)))
    .toEqual(expect.arrayContaining([expect.any(Number)]));
  for (const cue of grouped) {
    expect(cue.end - cue.start).toBeLessThanOrEqual(5);
    expect(cue.text.split('\n').length).toBeLessThanOrEqual(2);
    expect(cue.text.split('\n').every(line => line.length <= 42)).toBe(true);
  }
  expect(grouped.map(cue => cue.text.replace(/\n/g, ' ')).join(' '))
    .toBe(words.map(word => word.text).join(' '));
});

test('não cria terceira linha quando palavras longas cabem no limite total', () => {
  const words = Array.from({ length: 5 }, (_, index) => ({
    start: index * 0.4, end: index * 0.4 + 0.3, text: 'abcdefghijklmn'
  }));
  expect(groupCaptionSegments(words).every(cue => cue.text.split('\n').length <= 2)).toBe(true);
});

test('recupera palavras sem tempo com intervalos reais de palavras vizinhas', () => {
  const words = [
    { start: null, end: 0, text: 'Então' },
    { start: 0.1, end: 0.4, text: 'começou' },
    { start: 0.4, end: 0.4, text: 'a' },
    { start: 0.5, end: 0.9, text: 'fala' },
    { start: 0.9, end: 0.9, text: '.' }
  ];
  const recovered = recoverTimedSegments(words);
  expect(recovered).toEqual([
    { start: 0.1, end: 0.4, text: 'Então começou a' },
    { start: 0.5, end: 0.9, text: 'fala.' }
  ]);
  expect(words[1].text).toBe('começou');
  expect(validSrt(buildSrt(recovered))).toBe(true);
});

test('não gera SRT quando nenhuma palavra tem tempo válido', () => {
  expect(recoverTimedSegments([{ start: 0, end: 0, text: 'Sem tempo' }])).toEqual([]);
});

test('aceita SRT com tempos reais e rejeita intervalos inválidos', () => {
  expect(validSrt('1\n00:00:00,100 --> 00:00:00,800\nFala')).toBe(true);
  expect(validSrt('1\n00:00:00,800 --> 00:00:00,800\nFala')).toBe(false);
  expect(validSrt('Fala sem marcação')).toBe(false);
});

test('SRT mantém horas e lacunas sem deslocar o tempo', () => {
  expect(buildSrt([
    { start: 3600.125, end: 3601.4, text: 'Primeira fala' },
    { start: 3610, end: 3611, text: 'Segunda fala' }
  ])).toBe('1\n01:00:00,125 --> 01:00:01,400\nPrimeira fala\n\n2\n01:00:10,000 --> 01:00:11,000\nSegunda fala');
});

test.each([[[]], [[{ start: -1, end: 1, text: 'x' }]],
  [[{ start: 1, end: 1, text: 'x' }]], [[{ start: 0, end: 1, text: ' ' }]]])(
  'SRT recusa segmentos inválidos e vazios', segments => {
    expect(() => buildSrt(segments)).toThrow(expect.objectContaining({ code: 'INVALID_SEGMENTS' }));
  });
