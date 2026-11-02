// Divisão de gravações longas em partes: limite, parâmetro de teste e nomes de arquivo.
// Limite de uma parte: abaixo do teto do remux (MAX_FINALIZE_BYTES, 1,5 GB), com folga para o excesso de
// até uma fatia de 1 s do MediaRecorder, para a parte caber no remux e nos limites de transcrição.
export const PART_LIMIT_BYTES = 1_400_000_000;

const MIN_TEST_LIMIT = 50_000;

// Em testes o limite é reduzido pela URL (?partLimitBytes=N); valores ausentes, inválidos ou fora de
// [50_000, fallback] voltam ao padrão. Nada disso aparece para o usuário.
export function resolvePartLimit(search, fallback = PART_LIMIT_BYTES) {
  const raw = new URLSearchParams(search || '').get('partLimitBytes');
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return value >= MIN_TEST_LIMIT && value <= fallback ? value : fallback;
}

// 1 parte: `${base}.webm`. Várias: `${base}_parte-NN.webm` (NN com pelo menos 2 dígitos e a largura do total).
export function partFileName(baseName, index, total) {
  if (total <= 1) return `${baseName}.webm`;
  const width = Math.max(2, String(total).length);
  return `${baseName}_parte-${String(index).padStart(width, '0')}.webm`;
}
