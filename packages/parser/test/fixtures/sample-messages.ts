/**
 * Mensagens de exemplo, no estilo de mensagens de WhatsApp reais, usadas
 * pelos testes de integração de analyze.test.ts.
 */

/** Cabeçalho de material com fitamento e espessura, seguido de peças. */
export const HEADER_THEN_PIECES = [
  'MDF (titânio de 15mm fitado um lado maior)',
  'Quarto casal',
  '2=47/47',
  '3=50/60',
].join('\n');

/** Material só é declarado depois das peças — exige backfill retroativo. */
export const MATERIAL_DECLARED_AFTER_PIECES = ['2=47/47', '3=50/60', 'MDF branco de 15mm'].join('\n');

/** Linha de peça com digitação truncada, mas que tem correção válida sugerível. */
export const TYPO_LINE = '2=50/32..2';

/** Linha comum, sem nenhuma palavra-chave conhecida e sem parecer peça. */
export const UNPARSEABLE_LINE = 'Observação qualquer sem números facilmente reconhecíveis';

/** Múltiplas peças na mesma linha, todas válidas. */
export const MULTI_PIECE_ALL_VALID = '2=47/47, 3=50/60';

/** Múltiplas peças na mesma linha, uma delas inválida (largura zero). */
export const MULTI_PIECE_NOT_ALL_VALID = '2=47/47, 3=0/60';

/**
 * Lista real de um usuário, no formato "comprimento x largura: quantidade"
 * (exportada de outro programa de otimização de corte) — inclui a grafia
 * sem cedilha ("pecas") e uma linha sem quantidade explícita ("peça" sozinho,
 * quantidade implícita 1).
 */
export const DIMENSION_FIRST_LIST = [
  '760x395: 2 peças',
  '245x453: 2 peças',
  '975x375: 1 peça',
  '210x 356: 1 peça',
  '502x356: 1 peça',
  '800x271: 1 peça',
  '800x265: 1 peça',
  '690x400: 4 peças',
  '765x350: 1 peça',
  '185x690: 1 peça',
  '496x690: 2 peças',
  '465x650: peça',
  '765x585: 2 pecas',
].join('\n');

/** Mensagem completa e realista, cobrindo cabeçalho, ambiente, função e peças. */
export const REALISTIC_MESSAGE = [
  'MDF branco de 15mm fitado 4 lados',
  'Cozinha',
  'Gaveta',
  '2=47/47',
  '3=50/60',
  '----------x-------------',
  'Ferragens',
].join('\n');
