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
 * propósito ("8pc+13+43" — separador errado entre as medidas) para
 * confirmar que ela vai para a conferência em vez de quebrar o resto da
 * lista. Usa "+" (não "*") de propósito: como "*" também virou um
 * separador geral de dimensões (ver DIMENSIONS_RE), "8pc*13*43" passaria
 * a ler como uma peça válida 8x13x43 — "+" continua sem sentido nenhum
 * (não é separador de dimensão nem decimal), então ainda testa o caso de
 * malformação pretendido aqui (LOOKS_LIKE_PIECE_RE ainda reconhece "+"
 * como "parece peça, mas não bateu" e manda pra conferência).
 */
export const PC_ASTERISK_LIST =
  'MDF naval de 18.  1pc96*65. 1pc192*65. 4pc69.5*65. 1pc92*07. 1pc1.90*07. 3pc1.00*66.03. 2pc92*57. ' +
  '4pc92.07*57. 1pc1.77*57. 3pc75*57. 1pc1.73.03*07. 1pc50*75. 2pc90*72.03. 2pc85.5*50. 2pc57*75. ' +
  '1pc59.03*07. 3pc52*24. 8pc50*18. 8pc+13+43. 2pc87*12. 2pc83*12. 2pc42.07*89. 4pc83*11.03. 1pc53*57';

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

/**
 * Lista real de um usuário: cabeçalho SEM "MDF" e sem nenhuma palavra de
 * quantidade — só a cor do MDF seguida da espessura ("cinza jazz 18 mm") —
 * e cada peça declara a própria fita em abreviação curta, sem a palavra
 * "lado(s)" ("1 menor", "2 menor", "sem") ou já na frase clássica ("4
 * lados"). Inclui o "." sobrando de "73x1,20. 2 menor", digitado por
 * engano junto com a fita.
 */
export const CINZA_JAZZ_SHORTHAND_FITA = [
  'cinza jazz 18 mm',
  '1-137x137 sem',
  '2-73x90 1 menor',
  '1-168x78 4 lados',
  '2-73x78 2 menor',
  '1-2,00x1,20 4 lados',
  '2-73x1,20. 2 menor',
  '1- 196,3x20',
  '1- 73x90 2 menor',
  '6- 72,5x42,8 4 lados',
  '4- 46,3x72,5',
].join('\n');

/**
 * Lista real de um usuário no formato "quantidade*compr*larg" (separador
 * "*" em vez de "x"), com três estilos de cabeçalho de material diferentes
 * na MESMA mensagem: "Branco 18 comum" (cor + espessura sem "mm", com
 * palavra de acabamento no final), "MDF branco 15mm comum" (tem "MDF", mas
 * a espessura vem colada sem "de" na frente) e "Freijó Trend" + "18mm" em
 * duas linhas separadas (nome numa linha, espessura solta na linha
 * seguinte). Inclui também um "2"850*515" — troca de propósito de "*" por
 * `"` numa das linhas (erro de digitação real) — e a seção "Ferragens" no
 * final, que não é peça nenhuma.
 */
export const ASTERISK_MULTI_HEADER_MESSAGE = [
  'Segue material ',
  'Branco 18 comum ',
  '',
  '3*624*480 ',
  '1*624*100',
  '2*624*460',
  '2*850*530',
  '2"850*515',
  '1*410*530',
  '1*410*512',
  '1*665*1035',
  '4*655*178',
  '',
  'MDF branco 15mm comum ',
  '',
  '6*710*530',
  '2*710*850',
  '1*710*410',
  '8*584*100',
  '8*450*130',
  '4*450*584',
  '1*624*1010',
  '',
  'Freijó Trend ',
  '',
  '18mm ',
  '',
  '2*2500*550',
  '2*1000*550',
  '2*100*850',
  '1*100*410',
  '5*700*437',
  '2*710*530',
  '',
  'Ferragens ',
  '',
  '1 fita freijó Trend 64',
  '13 dobradiças retas com amortecedor ',
  '2 pacote l fixação ',
  '4corridicas 45 total',
].join('\n');

/**
 * Lista real de um usuário com a quantidade escrita por extenso ("uma",
 * "duas", "cinco", "quatro" — em vez de "1", "2", "5", "4"), uma saudação
 * ("boa tarde") colada na primeira linha, junto com a peça, e a espessura
 * do bloco declarada por extenso DEPOIS das peças ("esses são de 15 ml" —
 * "ml" no lugar de "mm"), com uma peça no final ("fundo") que sobrescreve
 * essa espessura com a própria ("de 6ml").
 */
export const SPELLED_OUT_QUANTITY_MESSAGE = [
  'boa tarde duas lateral de 2050x550',
  'uma de 196.5x550 lateral',
  'uma de 1150 x550 lateral',
  'uma de 1980x550 porta',
  'duas de 1980x58.5 portas',
  'duas de 1700x500 base',
  'uma de 1500x500 base',
  'cinco de 530x500',
  'cinco 57.5x500',
  'duas de 70x1700',
  'duas de 420x1 ',
  'quatro de 450x13',
  'quatro de 42.2x13',
  'esses são de 15 ml',
  'uma de 1730x2000 fundo de 6ml',
].join('\n');
