// STUB (sdd-plan 003): o sdd-execute implementa resolvePartLimit e partFileName.
// Limite de uma parte: abaixo do teto do remux (MAX_FINALIZE_BYTES, 1,5 GB) para a parte, mais o
// excesso de até uma fatia de 1 s do MediaRecorder, caber no remux e nos limites de transcrição.
export const PART_LIMIT_BYTES = 1_400_000_000;

// Em testes o limite é reduzido pela URL (?partLimitBytes=N); valores ausentes, inválidos ou fora de
// [50_000, PART_LIMIT_BYTES] voltam ao padrão. Nada disso aparece para o usuário.
export function resolvePartLimit(search, fallback = PART_LIMIT_BYTES) {
  void search; void fallback;
  throw new Error('not implemented');
}

// 1 parte: `${base}.webm`. Várias: `${base}_parte-NN.webm` (NN com pelo menos 2 dígitos e a largura do total).
export function partFileName(baseName, index, total) {
  void baseName; void index; void total;
  throw new Error('not implemented');
}
