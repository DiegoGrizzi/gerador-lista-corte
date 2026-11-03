/**
 * text-normalize.ts
 * ---------------------------------------------------------------------------
 * Pequenas limpezas de texto aplicadas antes de tentar interpretar uma linha
 * (formatação do WhatsApp, erros de digitação comuns, palavras de
 * preenchimento). Ver equivalentes no parser.js legado.
 * ---------------------------------------------------------------------------
 */

import { UNIT_ONLY_RE, QUANTITY_MARKER_WORDS } from './regex-patterns.js';

/**
 * Prefixo que o WhatsApp acrescenta a cada linha ao copiar várias mensagens
 * de uma conversa: "[15:29, 15/10/2026] Nome: " (iPhone) ou "15/10/2026
 * 15:29 - Nome: " (Android). Cada linha da lista costuma ser uma mensagem
 * separada, então o prefixo aparece em todas.
 */
const WHATSAPP_EXPORT_PREFIX_RE =
  /^[‎‏\s]*(?:\[\d{1,2}[:.]\d{2}(?::\d{2})?,\s*\d{1,2}\/\d{1,2}\/\d{2,4}\]|\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*-)\s*[^:\n]{1,60}:[ \t]?/;

/** Remove o prefixo "[hora, data] Nome:" de cada linha de uma conversa do WhatsApp copiada. */
export function stripWhatsAppExportPrefixes(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(WHATSAPP_EXPORT_PREFIX_RE, ''))
    .join('\n');
}

const DOT_AFTER_QUANTITY_RE = new RegExp('^(\\s*\\d+)\\.(?=\\s*(?:' + QUANTITY_MARKER_WORDS + ')\\b)', 'gim');

/** "2.peca 83x40" (ponto digitado no lugar do espaço depois da quantidade) vira "2 peca 83x40". */
export function normalizeDotAfterQuantity(text: string): string {
  return text.replace(DOT_AFTER_QUANTITY_RE, '$1 ');
}

const QUANTITY_ONLY_RE = new RegExp('^(\\d+)\\s*(?:' + QUANTITY_MARKER_WORDS + ')\\.?$', 'i');
// Aceita ponto sobrando colado ao número ("15.x35.", comum em mensagem digitada rápido).
const DIMENSIONS_ONLY_RE = /^(\d+(?:[.,]\d+)?)\.?\s*[x×]\s*(\d+(?:[.,]\d+)?)\.?$/i;

/**
 * Junta quantidade e medidas escritas em linhas SEPARADAS ("8 peça" numa
 * linha, "15.x35." na seguinte — cada uma geralmente uma mensagem diferente
 * do WhatsApp) numa linha só no formato principal ("8=15x35"). A quantidade
 * normalmente vem ANTES da medida; quando uma medida aparece sem quantidade
 * antes dela, a próxima linha só de quantidade é dela (quantidade depois).
 * Uma quantidade que não encontra nenhuma medida volta como estava.
 */
export function joinSplitQuantityLines(text: string): string {
  const out: string[] = [];
  let pendingQty: number | null = null;
  let pendingRaw = '';
  let danglingIndex: number | null = null;
  let danglingDims = '';

  const flushPending = (): void => {
    if (pendingQty != null) out.push(pendingRaw);
    pendingQty = null;
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      out.push(raw);
      continue;
    }

    const quantityMatch = line.match(QUANTITY_ONLY_RE);
    if (quantityMatch) {
      const qty = parseInt(quantityMatch[1]!, 10);
      if (danglingIndex != null) {
        out[danglingIndex] = qty + '=' + danglingDims;
        danglingIndex = null;
      } else {
        flushPending();
        pendingQty = qty;
        pendingRaw = raw;
      }
      continue;
    }

    const dimensionsMatch = line.match(DIMENSIONS_ONLY_RE);
    if (dimensionsMatch) {
      const dims = dimensionsMatch[1] + 'x' + dimensionsMatch[2];
      if (pendingQty != null) {
        out.push(pendingQty + '=' + dims);
        pendingQty = null;
        danglingIndex = null;
      } else {
        // Sem quantidade antes: assume 1 (uma "quantidade depois" pode
        // trocar isso). Reescrever já como "1=medidas" evita que o parser
        // leia o comprimento decimal ("75.0x50.0") como quantidade.
        danglingIndex = out.length;
        danglingDims = dims;
        out.push('1=' + dims);
      }
      continue;
    }

    flushPending();
    danglingIndex = null;
    out.push(raw);
  }
  flushPending();
  return out.join('\n');
}

// "MDF 6", "Fundo em MDF 6", "MDF 15, duas face naval" — espessura sem unidade,
// opcionalmente com um descritor depois da vírgula.
const MDF_THICKNESS_ONLY_RE = /^(?:fundo\s+em\s+)?mdf\s+(\d+(?:[.,]\d+)?)\s*(?:mm)?(?:\s*,\s*(.+))?$/i;
const COLOR_ONLY_RE = /^[a-zà-öø-ÿ][a-zà-öø-ÿ\s]{1,29}$/i;

/**
 * "MDF 6" (espessura sem unidade) seguido da cor numa linha própria
 * ("Branco", ou "Cor Louro Freijó") vira "MDF Branco 6mm" — a forma que o
 * resto do parser já entende. Um descritor depois da vírgula ("MDF 15, duas
 * face naval") é mantido depois da cor. Sem cor na linha seguinte, vira só
 * "MDF 6mm".
 */
export function mergeMdfThicknessAndColorLines(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.trim().match(MDF_THICKNESS_ONLY_RE);
    if (!match) {
      out.push(lines[i]!);
      continue;
    }
    const descriptor = (match[2] ?? '').trim();
    let next = i + 1;
    while (next < lines.length && !lines[next]!.trim()) next++;
    const color = next < lines.length ? lines[next]!.trim().replace(/^cor\s*:?\s+/i, '') : '';
    const hasColor = COLOR_ONLY_RE.test(color);
    out.push(['MDF', hasColor ? color : '', descriptor, match[1] + 'mm'].filter(Boolean).join(' '));
    if (hasColor) i = next;
  }
  return out.join('\n');
}

/**
 * Remove marcação de negrito (*texto*), itálico (_texto_) ou tachado
 * (~texto~) do WhatsApp quando envolve a linha inteira — comum quando o
 * usuário destaca um cabeçalho ou uma peça inteira ao copiar a mensagem.
 */
export function stripWhatsAppFormatting(line: string): string {
  return line.replace(/^([*_~])(.+)\1$/, '$2');
}

/**
 * Corrige o erro de digitação mais comum: pontuação decimal repetida por
 * engano (32..2, 0,,30, 10''5) → normaliza para um único separador.
 */
export function normalizeTypos(line: string): string {
  return line.replace(/[.,']{2,}/g, '.');
}

/**
 * Expande uma lista de peças escrita numa única linha, separada por ponto,
 * no formato "quantidade + pc + comprimento*largura" (ex:
 * "1pc96*65. 1pc192*65. 4pc69.5*65"), transformando cada peça numa linha
 * própria — permite que o resto do analisador processe cada uma
 * normalmente, como se tivesse vindo em linhas separadas desde o início.
 *
 * O ponto só é tratado como separador de peça quando vem seguido (depois
 * de espaço) de um "número+pc" — ou seja, só nos pontos que realmente
 * separam uma peça da próxima. Um ponto decimal dentro de uma medida (ex:
 * "69.5", "1.90") nunca é seguido de espaço + "número+pc", então nunca é
 * confundido com esse separador e permanece intacto na mesma linha.
 */
export function expandPcSeparatedPieces(text: string): string {
  // Sem \b depois de "pc" de propósito: "pc" vem sempre colado direto no
  // número seguinte ("1pc96"), sem espaço — "c" e "9" são os dois
  // caracteres de palavra, então não há fronteira de palavra ali (\b não
  // bateria nunca, e a expansão inteira silenciosamente não faria nada).
  return text.replace(/\.\s+(?=\d+\s*pc)/gi, '\n');
}

/**
 * Saudação solta no começo da linha ("Boa tarde duas laterais de
 * 2050x550") — comum quando a mensagem inteira do WhatsApp começa com uma
 * saudação na mesma linha da primeira peça, em vez de numa linha própria.
 * Sem remover isso, a quantidade por extenso (ver normalizeLeadingNumberWord)
 * nunca fica no início da linha, e a peça inteira não é reconhecida.
 */
const GREETING_PREFIX_RE = /^(?:boa\s+tarde|boa\s+noite|bom\s+dia|ol[aá]|oi)[,.]?\s+/i;

export function stripGreetingPrefix(line: string): string {
  return line.replace(GREETING_PREFIX_RE, '');
}

/**
 * Quantidade por extenso, em português, no início da linha ("uma", "duas",
 * "cinco"...) — comum em mensagens digitadas/faladas em vez de copiadas de
 * uma lista. Cobre 1 a 20 (além disso, quem escreve por extenso quase
 * sempre já troca pra algarismo). "um"/"uma" e "dois"/"duas" têm as duas
 * formas de gênero; os demais não variam em português.
 *
 * Só troca a PRIMEIRA palavra da linha pelo algarismo equivalente — o
 * resto da linha (incluindo "de", medidas, função...) continua intacto e
 * já é tratado normalmente pelo resto do motor de análise depois disso.
 */
const NUMBER_WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  três: 3,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
};

const LEADING_NUMBER_WORD_RE = new RegExp('^(' + Object.keys(NUMBER_WORDS).join('|') + ')\\b', 'i');

export function normalizeLeadingNumberWord(line: string): string {
  const match = line.match(LEADING_NUMBER_WORD_RE);
  if (!match) return line;
  const value = NUMBER_WORDS[match[1]!.toLowerCase()];
  if (value == null) return line;
  return value + line.slice(match[0].length);
}

/**
 * Remove palavras de preenchimento ("de", "pro") e pontuação solta de um
 * trecho de texto, para decidir se o que resta é um valor real de Função.
 * Retorna string vazia se não sobrar nada útil.
 */
export function stripFillers(text: string): string {
  const cleaned = text
    .replace(/\b(de|pro)\b/gi, '')
    .replace(/(^|\s)c\/(?=\s|$)/gi, ' ') // "c/" = "com" (ex: "2 peças c/ 75x1800")
    .replace(/\s+/g, ' ')
    .trim();
  if (UNIT_ONLY_RE.test(cleaned)) return '';
  if (/^[.,;:]*$/.test(cleaned)) return '';
  return cleaned;
}

const UNIT_FACTORS: { re: RegExp; factor: number }[] = [
  { re: /^(?:mil[ií]metros?|mm)$/i, factor: 1 },
  { re: /^(?:cent[ií]metros?|cm)$/i, factor: 10 },
  { re: /^metros?$/i, factor: 1000 },
];

/**
 * Frase que diz a unidade das medidas, numa linha própria ou no meio de um
 * texto: "As medidas seguem em milímetros", "medidas em cm", "tudo em
 * centímetros", "as medidas estão em metros". Exige "medidas"/"tudo"/
 * "valores" E um conector ("em", "são", "estão", "seguem") antes da unidade —
 * "Medidas MDF 15mm" (cabeçalho de material) não conta. Linhas que começam
 * com número (peças) nunca contam.
 */
const STATED_UNIT_RE =
  /^(?!\s*\d)[^\n]*?\b(?:medidas?|tudo|valores)\b[^\n]*?\b(?:em|s[ãa]o|est[ãa]o|seguem)\s+(?:em\s+)?(mil[ií]metros?|mm|cent[ií]metros?|cm|metros?)\b/im;

/** Fator mm da unidade que a mensagem diz usar (1, 10 ou 1000), ou null quando não diz nenhuma. */
export function detectStatedUnitFactor(text: string): number | null {
  const match = text.match(STATED_UNIT_RE);
  if (!match) return null;
  const unit = match[1]!;
  return UNIT_FACTORS.find((entry) => entry.re.test(unit))?.factor ?? null;
}


/**
 * Linha que informa o TOTAL de peças da lista ("Total de peças: 116",
 * "Total: 116 peças", "116 peças no total"). Exige a palavra "peças"/"pç"
 * (no rótulo ou depois do número) — "Total: 116" sozinho pode ser área ou
 * valor, então não conta. A interface usa o número para conferir a soma das
 * quantidades lidas.
 */
const PIECE_WORD = 'pe[çc]as?|pcs?|p[çc]s?';
const STATED_TOTAL_LINE_RES: RegExp[] = [
  new RegExp(`^\\s*total\\s+(?:geral\\s+)?(?:de\\s+)?(?:${PIECE_WORD})\\s*[:=\\-–]?\\s*(\\d+)\\s*$`, 'i'),
  new RegExp(`^\\s*total\\s*(?:geral\\s*)?[:=\\-–]?\\s*(\\d+)\\s*(?:${PIECE_WORD})\\s*$`, 'i'),
  new RegExp(`^\\s*(\\d+)\\s*(?:${PIECE_WORD})\\s+no\\s+total\\s*$`, 'i'),
];

/**
 * Tira do texto a linha que informa o total de peças (para ela não ir parar
 * na conferência como item não reconhecido) e devolve o número informado.
 * Sem linha de total, devolve o texto como está e total null.
 */
export function extractStatedTotal(text: string): { text: string; total: number | null } {
  let total: number | null = null;
  const kept = text.split('\n').filter((line) => {
    for (const re of STATED_TOTAL_LINE_RES) {
      const match = line.match(re);
      if (match) {
        total = Number(match[1]);
        return false;
      }
    }
    return true;
  });
  return total == null ? { text, total: null } : { text: kept.join('\n'), total };
}
