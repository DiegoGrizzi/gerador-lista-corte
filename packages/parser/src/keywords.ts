/**
 * keywords.ts
 * ---------------------------------------------------------------------------
 * Listas de palavras-chave usadas para classificar linhas de cabeçalho que
 * não são peça nem material (ver classifyHeaderLine em header.ts).
 * ---------------------------------------------------------------------------
 */

/** Palavras que indicam ambiente da casa ou peça de mobiliário → campo Complemento. */
export const ENVIRONMENT_OR_FURNITURE_KEYWORDS = [
  'wc',
  'banheiro',
  'quarto',
  'sala',
  'cozinha',
  'lavanderia',
  'escritório',
  'escritorio',
  'closet',
  'varanda',
  'sacada',
  'hall',
  'corredor',
  'suíte',
  'suite',
  'dormitório',
  'dormitorio',
  'guarda-roupa',
  'guarda roupa',
  'roupeiro',
  'armário',
  'armario',
  'cômoda',
  'comoda',
  'estante',
  'cristaleira',
  'rack',
  'bancada',
  'penteadeira',
  'cabeceira',
  'criado mudo',
  'criado-mudo',
  'beliche',
  'escrivaninha',
  'aparador',
  'buffet',
  'balcão',
  'balcao',
  'home theater',
  'painel de tv',
];

/** Palavras que indicam o papel/nome da peça dentro do móvel → campo Função. */
export const PIECE_ROLE_KEYWORDS = [
  'gaveta',
  'lateral',
  'fundo',
  'tampo',
  'porta',
  'prateleira',
  'divisória',
  'divisoria',
  'teto',
  'base',
  'rodapé',
  'rodape',
  'puxador',
  'testeira',
  'frontal',
  'travessa',
  'montante',
  'saia',
  'sapato',
  'sapateira',
  'petiadera',
  'peiteira',
  'forro',
  'chapeamento',
];
