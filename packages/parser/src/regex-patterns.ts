/**
 * regex-patterns.ts
 * ---------------------------------------------------------------------------
 * Expressões regulares e listas de palavras-chave usadas pelo parser.
 * Portadas literalmente do parser.js legado, incluindo os comentários que
 * explicam cada uma (o "porquê" de cada regex é tão importante quanto o
 * "o quê" para manter esse motor de interpretação manutenível).
 * ---------------------------------------------------------------------------
 */

/**
 * Vocabulário de marcador de quantidade, reaproveitado por QUANTITY_RE,
 * DIMENSION_FIRST_RE e pela separação de múltiplas peças. "pe[çc]as?" aceita
 * tanto "peça"/"peças" quanto a grafia sem cedilha "peca"/"pecas" (comum em
 * mensagens digitadas rápido ou copiadas de fontes sem acentuação).
 */
export const QUANTITY_MARKER_WORDS = 'pe[çc]as?|pças|pça|pç|pc|unidades|unidade|unid|und|un';

/** Quantidade no início da linha: "2=", "2 pç", "2 pc", "2 un", "2 -", ou apenas "2 ". */
export const QUANTITY_RE = new RegExp('^(\\d+)\\s*(' + QUANTITY_MARKER_WORDS + '|=|-)?\\.?\\s*(.+)$', 'i');

/**
 * Duas medidas (comprimento x largura), aceitando:
 *  - separador "x", "pro" (=por) ou "/"
 *  - decimais com ponto, vírgula ou aspa simples (56'5 = 56,5)
 *  - a palavra "fita" colada a um dos números, indicando fita naquele lado
 *  - uma terceira medida opcional (espessura), ex: "820 x 400 x 18"
 *
 * "fita" só é reconhecida como essa marcação quando faz sentido como
 * palavra isolada (antes do separador "x"/"pro", ou no fim, sem mais
 * letras coladas depois) — isso evita confundir com o início de uma
 * palavra maior colada sem espaço, como "49'5fitado os 4 lados", onde
 * "fita" faz parte de "fitado", não é a marcação de fita no número.
 */
export const DIMENSIONS_RE =
  /(\d+(?:[.,']\d+)?)\s*(fita(?=\s*(?:x|pro)))?\s*(?:x|pro|\/)\s*(\d+(?:[.,']\d+)?)\s*(fita(?![a-zà-öø-ÿ]))?(?:\s*(?:x|pro)?\s*(\d+(?:[.,']\d+)?))?/i;

/**
 * Igual a DIMENSIONS_RE, mas sem aceitar "/" como separador.
 * Usada apenas quando a linha não tem quantidade explícita na frente
 * (ex: "160 x 90 6mm"). Sem essa restrição, uma fração como "1/4 de FCC"
 * seria lida como uma peça de 1x4.
 */
export const DIMENSIONS_NO_SLASH_RE =
  /(\d+(?:[.,']\d+)?)\s*(fita(?=\s*(?:x|pro)))?\s*(?:x|pro)\s*(\d+(?:[.,']\d+)?)\s*(fita(?![a-zà-öø-ÿ]))?(?:\s*(?:x|pro)?\s*(\d+(?:[.,']\d+)?))?/i;

/**
 * Formato alternativo, com as medidas ANTES da quantidade e separadas dela
 * por dois-pontos: "760x395: 2 peças", "210x 356: 1 peça". Vem de listas
 * exportadas de outros programas de otimização de corte, onde a convenção é
 * "comprimento x largura: quantidade" em vez de "quantidade=comprimento/
 * largura". A quantidade é opcional — "465x650: peça" (sem número) tem
 * quantidade implícita 1, mesma regra usada em outros formatos sem marcador
 * explícito. Diferente do formato principal, aqui não há como a peça
 * carregar fita/espessura/material inline: sempre herda do contexto
 * corrente (ver buildPieceFromDimensionFirstMatch).
 */
export const DIMENSION_FIRST_RE = new RegExp(
  '^(\\d+(?:[.,\']\\d+)?)\\s*x\\s*(\\d+(?:[.,\']\\d+)?)\\s*:\\s*(\\d+)?\\s*(?:' + QUANTITY_MARKER_WORDS + ')?\\.?$',
  'i',
);

/**
 * Terceiro formato alternativo: uma lista inteira de peças na mesma linha,
 * separada por ponto, cada peça no formato "quantidade+pc+comprimento*
 * largura" (ex: "1pc96*65. 1pc192*65. 4pc69.5*65"). Usada em conjunto com
 * `expandPcSeparatedPieces` (ver text-normalize.ts), que já separou cada
 * peça na própria linha antes desta regex rodar — aqui só falta reconhecer
 * uma peça isolada. Mesma limitação do formato "comprimento x largura:
 * quantidade": sem fita/espessura/material inline, sempre herda do
 * contexto corrente.
 */
export const PC_ASTERISK_RE = /^(\d+)\s*pc\s*([\d.,']+)\s*\*\s*([\d.,']+)$/i;

/** Linha só com a espessura padrão do bloco: "De 15", "Tudo de 15mm", "Todas de 6 mm". */
export const THICKNESS_ONLY_RE = /^(?:tudo|todos|todas)?\s*de\s+(\d+)\s*(?:mm|m)?\.?$/i;

/** Espessura mencionada dentro de outra linha: "...de 15mm", "...de 6m". */
export const THICKNESS_SUFFIX_RE = /de\s+(\d+)\s*(?:mm|m)?\.?/i;

/** Rótulos de seção que devem ir para conferência, mas nunca virar peça ou ambiente. */
export const DISCARD_LABELS = ['ferragens', 'acessórios', 'acessorios', 'hardware', 'acabamentos'];

/** Linha puramente decorativa, ex: "----------x-------------". */
export const SEPARATOR_LINE_RE = /^[-=_*]{2,}[xX]?[-=_*]{0,}$/;

/** Texto que é só uma unidade de medida solta ("mm", "cm"), sem valor real. */
export const UNIT_ONLY_RE = /^(mm|cm|m)\.?$/i;

/**
 * Indica que uma linha provavelmente tentava ser uma peça (duas medidas
 * com algum separador entre elas) mas não bateu com DIMENSIONS_RE — por
 * exemplo, por um erro de digitação. Serve para decidir se a linha vai
 * para a lista de conferência (em vez de ser ignorada silenciosamente,
 * como aconteceria com o nome de um ambiente que tem número, "Quarto 2").
 */
export const LOOKS_LIKE_PIECE_RE = /\d+\s*[.,'+\-*/x]+\s*\d+/i;

/**
 * Sinal de número cortado por digitação: um símbolo (. , ' + - * /) colado
 * imediatamente a um dígito, logo depois da medida já interpretada.
 * Ex: em "32..2" a medida capturada seria só "32", sobrando "..2" — o "."
 * seguido de dígito aqui indica que a medida real provavelmente é outra.
 * Um ponto final comum de frase ("70.5.") não cai nessa regra, porque não
 * há dígito depois do símbolo.
 */
export const SUSPICIOUS_ADJACENT_RE = /^[.,'+\-*/]+\d/;

/**
 * Indica que depois da primeira peça reconhecida numa linha ainda sobra
 * o início de UMA SEGUNDA peça (ex: "2=47/47, 3=50/60"). O parser lê uma
 * peça por linha só quando não consegue separá-las com segurança (ver
 * splitIntoPieceSegments) — nesses casos a linha inteira vai para a
 * lista de conferência, em vez de perder a segunda peça em silêncio.
 */
export const MULTIPLE_PIECES_RE = new RegExp(
  '[;,]\\s*\\d+\\s*(?:' + QUANTITY_MARKER_WORDS + ')?\\.?\\s*[=\\-]',
  'i',
);

/**
 * Divide uma linha com mais de uma peça separada por vírgula ou
 * ponto-e-vírgula (ex: "2=47/47, 3=50/60") em segmentos individuais,
 * cada um processado depois como uma peça própria.
 *
 * O corte só acontece IMEDIATAMENTE ANTES do início de uma nova
 * quantidade (dígitos seguidos de "=" ou "-", com ou sem marcador entre
 * eles) — isso evita cortar por engano uma vírgula decimal, como em
 * "2=56,5/42, 3=50/60" (a vírgula depois do "56" não é seguida de
 * "número=", então não é tratada como separador de peças).
 */
export const PIECE_SEPARATOR_RE = new RegExp(
  '[;,]\\s*(?=\\d+\\s*(?:' + QUANTITY_MARKER_WORDS + ')?\\.?\\s*[=\\-])',
  'i',
);
