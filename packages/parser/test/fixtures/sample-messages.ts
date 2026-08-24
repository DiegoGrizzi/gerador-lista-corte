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

/**
 * Lista real de um usuário, tudo numa única linha (sem quebras), no
 * formato "quantidade+pc+comprimento*largura" separado por ponto (ex:
 * "1pc96*65. 1pc192*65"). Inclui o cabeçalho de material ("MDF naval de
 * 18") na mesma linha, junto com as peças, e uma peça malformada de
 * propósito ("8pc*13*43" — falta o comprimento) para confirmar que ela
 * vai para a conferência em vez de quebrar o resto da lista.
 */
export const PC_ASTERISK_LIST =
  'MDF naval de 18.  1pc96*65. 1pc192*65. 4pc69.5*65. 1pc92*07. 1pc1.90*07. 3pc1.00*66.03. 2pc92*57. ' +
  '4pc92.07*57. 1pc1.77*57. 3pc75*57. 1pc1.73.03*07. 1pc50*75. 2pc90*72.03. 2pc85.5*50. 2pc57*75. ' +
  '1pc59.03*07. 3pc52*24. 8pc50*18. 8pc*13*43. 2pc87*12. 2pc83*12. 2pc42.07*89. 4pc83*11.03. 1pc53*57';

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

/**
 * Lista real de um usuário, no formato "quantidade X comprimento X largura"
 * seguido de códigos de fita ao final da linha (ver fita-codes.ts): "1M"/"2M"
 * (lado maior), "1m"/"2m" (lado menor), "4L" (todos os lados) e "3L" (3 dos 4
 * lados, ambíguo — vira pendência, ver pendingThreeLados). Cabeçalho sem
 * "MDF" ("PEÇAS 15mm NAVAL BR"), decimais com vírgula.
 */
export const NAVAL_BR_FITA_CODES = [
  'PEÇAS 15mm NAVAL BR',
  '3 X 0,80 X 0,505  1M  1m',
  '1 X 1,46 X 0,505  1M',
  '1 X 1,46 X 0,060  1M',
  '2 X 0,80 X 0,485  3L',
  '4 X 0,19 X 0,485  3L',
  '1 X 1,00 X 0,505  1M',
  '3 X 0,80 X 0,505  1M',
  '2 X 1,22 X 0,505  1M',
  '1 X 1,22 X 0,060  1M',
  '3 X 0,80 X 0,405  3L',
  '1 X 0,20 X 0,60    3L',
  '4 X 0,60 X 0,258  3L',
].join('\n');
