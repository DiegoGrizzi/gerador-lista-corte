/**
 * analyze.ts
 * ---------------------------------------------------------------------------
 * Análise da mensagem completa, linha por linha, com contexto corrente e
 * backfill retroativo de material/fita/espessura pendentes. Ver equivalente
 * (analyzeText) no parser.js legado — a máquina de estados (closures +
 * arrays de pendências) foi portada tal como está, apenas tipada.
 * ---------------------------------------------------------------------------
 */

import {
  QUANTITY_RE,
  THICKNESS_ONLY_RE,
  THICKNESS_WITH_TRAILING_MATERIAL_RE,
  stripTrailingAcknowledgement,
  PECAS_HEADER_RE,
  GENERIC_THICKNESS_HEADER_RE,
  BARE_THICKNESS_HEADER_RE,
  NAME_ONLY_LINE_RE,
  DISCARD_LABELS,
  HARDWARE_ITEM_RE,
  SEPARATOR_LINE_RE,
  LOOKS_LIKE_PIECE_RE,
  SUSPICIOUS_ADJACENT_RE,
  MULTIPLE_PIECES_RE,
} from './regex-patterns.js';
import { toNumber } from './numbers.js';
import {
  stripWhatsAppFormatting,
  stripGreetingPrefix,
  normalizeLeadingNumberWord,
  normalizeTypos,
  expandPcSeparatedPieces,
  stripWhatsAppExportPrefixes,
  normalizeDotAfterQuantity,
  joinSplitQuantityLines,
  mergeMdfThicknessAndColorLines,
  detectStatedUnitFactor,
  extractStatedTotal,
  stripMeasureUnits,
} from './text-normalize.js';
import { parseFitamentoPhrase } from './fitamento.js';
import { extractTrailingFitaCodes, extractTrailingFitaSigns, applyFitaCodesToPiece } from './fita-codes.js';
import { parseFitaByDimensionLine, applyFitaByDimensionRules } from './fita-by-dimension.js';
import type { FitaByDimensionRule } from './fita-by-dimension.js';
import { classifyHeaderLine, extractAboveDeclaration, extractHeaderInfo } from './header.js';
import { isMarkdownTableSeparatorLine, parseMarkdownTableHeader, parseMarkdownTableRow } from './markdown-table.js';
import { parseTsvTableHeader, parseTsvTableRow } from './tsv-table.js';
import type { TableColumns, TableRow } from './table-columns.js';
import {
  isValidPiece,
  tryMatchPieceLine,
  buildPieceFromMatch,
  splitIntoPieceSegments,
  tryMatchDimensionFirstLine,
  tryMatchDimensionsThicknessLine,
  tryMatchPcAsteriskLine,
  buildPieceFromDimensionFirstMatch,
} from './piece-matcher.js';
import type { PieceMatch, DimensionFirstMatch } from './piece-matcher.js';
import {
  addAssumption,
  ASSUMED_NO_FITA_NOTE,
  finalizePiece,
  looksLikeNoMaterial,
  markFitaUnknownIfNeeded,
  MIN_EDGE_BANDING_THICKNESS_MM,
} from './finalize.js';
import type { AnalyzeResult, DiscardedItem, FitamentoType, NextIdFn, ParseContext, Piece, RawPiece } from './types.js';

/**
 * Rótulo de seção numa linha própria, terminado em dois-pontos e opcionalmente
 * seguido de uma nota de fita entre parênteses: "Nichos:", "Portas:  (todas
 * fitado 4 lados )".
 */
/**
 * Rótulo de seção terminado em ponto, com o material opcional depois:
 * "Laterias. Naval", "Base. Naval.", "Portas.", "Portas .". Só vale quando a
 * primeira palavra é uma Função conhecida (classifyHeaderLine), para não
 * confundir com frase ("Obrigado. Abraço.").
 */
const SECTION_DOT_LABEL_RE = /^([a-zà-öø-ÿ][a-zà-öø-ÿ ]{0,28}?)\s*\.\s*([a-zà-öø-ÿ][a-zà-öø-ÿ ]{0,28}?)?\s*\.?\s*$/i;

/**
 * Declaração sobre as peças já listadas: "Essas peças acima MDF branco de 15
 * mm o MDF mais em conta", "Essa peças acima MDF de 6mm". Vale para as peças
 * lidas desde a declaração anterior desse tipo (ou desde o começo) e não vira
 * o material das peças seguintes.
 */
const ABOVE_PIECES_DECLARATION_RE =
  /^(?:tod[ao]s\s+)?(?:essas?|estas?|esses|estes|as|os)\s+(?:\S+\s+){0,2}?acima\b[\s,:.\-–]*(?:(?:s[ãa]o|[ée]|em|de)\s+)?(.+)$/i;

/** Verbo de instrução na frente da peça ("cortar: 2750 x 610 = 06"): só enfeite, a peça é o que vem depois. */
const CUT_VERB_PREFIX_RE = /^cort(?:ar|es?)\s*:\s*/i;

const SECTION_LABEL_RE = /^([a-zà-öø-ÿ][a-zà-öø-ÿ ]{0,28}?)\s*:\s*(?:\(\s*([^()]*?)\s*\)?)?\s*$/i;

/** Rótulos com dois-pontos que NÃO são seção de peças (observação, total...) — continuam sendo ignorados como antes. */
const NON_SECTION_LABELS = [
  'obs',
  'observacao',
  'observação',
  'observacoes',
  'observações',
  'nota',
  'notas',
  'total',
  'material',
  'materiais',
  'cliente',
  'data',
  'medidas',
];

/**
 * Uma entrada de pendência é ou o contexto capturado de um item de
 * conferência (ParseContext), ou a própria peça (RawPiece) — ambos têm os
 * campos material/fitaType/thicknessMm mutados quando a informação
 * correspondente é declarada mais abaixo na mensagem.
 */
type PendingEntry = ParseContext | RawPiece;

/**
 * Interpreta a mensagem colada pelo usuário, linha por linha, mantendo o
 * "contexto corrente" (material, complemento, função, fita e espessura em
 * vigor) e aplicando retroativamente a peças já lidas quando alguma dessas
 * informações só aparece mais abaixo no texto (comum quando o material
 * vem no fim da lista de peças).
 */
export function analyzeText(text: string, nextId: NextIdFn): AnalyzeResult {
  const pieces: RawPiece[] = [];
  const discarded: DiscardedItem[] = [];

  let currentMaterial = '';
  let currentFitamentoType: FitamentoType | null = null;
  let currentThickness: number | null = null;
  let currentComplemento = '';
  let currentFuncao = '';
  let materialMentioned = false;

  /**
   * Contexto de material em vigor ANTES do último cabeçalho de material, e
   * quantas peças já existiam nesse momento — usado para voltar ao material
   * anterior quando um bloco de material FINO (ex: "Branco 6mm comum", só
   * para fundos) termina num novo rótulo de seção ("Nichos:").
   */
  let materialBeforeHeader: {
    material: string;
    fitaType: FitamentoType | null;
    thickness: number | null;
    pieceCount: number;
  } | null = null;

  /**
   * Candidato a nome de material declarado numa linha própria, sem
   * nenhum número junto (ex: "Freijó Trend"), aguardando a espessura que
   * vem numa linha SEGUINTE também sozinha (ex: "18mm") — ver o
   * tratamento de THICKNESS_ONLY_RE mais abaixo. Fica `null` na maior
   * parte do tempo; só é preenchido entre essas duas linhas.
   */
  let pendingMaterialName: string | null = null;

  // Peças/itens de conferência que ainda esperam por material, fita ou
  // espessura declarados mais abaixo na mensagem.
  let pendingMaterial: PendingEntry[] = [];
  let pendingFitamento: PendingEntry[] = [];
  let pendingThickness: PendingEntry[] = [];

  /**
   * Mapeamento de colunas de uma tabela em andamento (Markdown ou TSV, ver
   * markdown-table.ts/tsv-table.ts), lido da linha de cabeçalho — `null`
   * fora de uma tabela. Precisa ser estado entre linhas: uma linha de
   * dados sozinha não diz qual coluna é Quantidade/Comprimento/Largura, só
   * o cabeçalho (lido antes) sabe disso. `tableDelimiter` guarda qual dos
   * dois formatos está em andamento, já que cada um divide a linha de dados
   * de um jeito diferente ("|" vs tabulação).
   */
  let tableColumns: TableColumns | null = null;
  let tableDelimiter: 'markdown' | 'tsv' | null = null;

  /** Linhas "1200 × 700: nos 4 lados" (ver fita-by-dimension.ts), aplicadas às peças só no fim — a fita pode vir antes OU depois da peça na mensagem. */
  const fitaByDimensionRules: FitaByDimensionRule[] = [];

  /**
   * Verdadeiro quando alguma peça trouxe fita na PRÓPRIA linha (frase entre
   * parênteses, códigos 1M/2m, sinais "+"/"-"...). Quem escreve assim informa
   * a fita peça a peça, então uma peça sem nada dito é "sem fita" — não
   * "fita desconhecida" (que faria a interface perguntar) — ver o fim da
   * análise.
   */
  let perPieceFitaSeen = false;

  /** Índice da primeira peça ainda não coberta por uma declaração "peças acima ..." (ver ABOVE_PIECES_DECLARATION_RE). */
  let aboveBlockStart = 0;

  /**
   * Materiais já declarados em cabeçalhos, com a espessura de cada um — uma
   * peça que cita a própria espessura ("fundo 6mm") usa o material
   * declarado com essa espessura (ex: "Branco 6mm comum"), em vez de misturar
   * a cor do bloco atual com a espessura citada.
   */
  const declaredMaterials: { material: string; thickness: number }[] = [];

  function snapshotContext(): ParseContext {
    return {
      material: currentMaterial,
      complemento: currentComplemento,
      funcao: currentFuncao,
      fitaType: currentFitamentoType,
      thicknessMm: currentThickness,
    };
  }

  /** Registra uma linha na lista de conferência, junto com o contexto do momento. */
  function pushDiscarded(text: string, suggested?: string | null): void {
    const ctx = snapshotContext();
    discarded.push({ text, suggested: suggested || null, context: ctx });
    // O contexto capturado é o mesmo objeto usado pela peça, então, se
    // for atualizado depois (ver setNewMaterial), o item na conferência
    // também recebe o valor correto ao ser resgatado.
    if (!currentMaterial) pendingMaterial.push(ctx);
    if (currentFitamentoType == null) pendingFitamento.push(ctx);
    if (currentThickness == null) pendingThickness.push(ctx);
  }

  /** Atualiza o contexto corrente ao encontrar um novo cabeçalho de material,
   * propagando o valor retroativamente para tudo que estava pendente. */
  function setNewMaterial(materialText: string, fitType: FitamentoType | null, thicknessVal: number | null): void {
    materialBeforeHeader = currentMaterial
      ? { material: currentMaterial, fitaType: currentFitamentoType, thickness: currentThickness, pieceCount: pieces.length }
      : null;
    if (thicknessVal != null) declaredMaterials.push({ material: materialText, thickness: thicknessVal });
    pendingMaterialName = null;
    pendingMaterial.forEach((entry) => {
      entry.material = materialText;
    });
    pendingMaterial = [];
    pendingFitamento.forEach((entry) => {
      // Um novo cabeçalho SEM fita própria encerra o bloco anterior: as peças
      // dele que nunca tiveram informação de fita continuam "desconhecidas"
      // (a interface pergunta), em vez de virarem "sem fita" em silêncio.
      // Só peças (contextos da conferência não têm fitaUnknown).
      if (fitType == null && 'qtd' in entry) markFitaUnknownIfNeeded(entry);
      entry.fitaType = entry.fitaType || 'none-explicit';
    });
    pendingFitamento = [];
    pendingThickness = [];
    currentMaterial = materialText;
    currentFitamentoType = fitType;
    currentThickness = thicknessVal;
    materialMentioned = true;
  }

  /** Constrói e registra uma peça a partir de um resultado de tryMatchPieceLine já validado. */
  function addSinglePiece(match: PieceMatch, ctx: ParseContext): void {
    pendingMaterialName = null;
    const built = buildPieceFromMatch(match.qty, match.prefix, match.dimensionMatch, match.suffix, ctx);
    built.piece.id = nextId();
    pieces.push(built.piece);
    if (built.explicitFita) perPieceFitaSeen = true;
    if (!built.newMaterialInfo && built.inlineThicknessMm != null && built.inlineThicknessMm !== ctx.thicknessMm) {
      const declared = [...declaredMaterials].reverse().find((d) => d.thickness === built.inlineThicknessMm);
      if (declared) {
        built.piece.material = declared.material;
        addAssumption(built.piece, 'material do bloco de ' + built.inlineThicknessMm + 'mm declarado acima: ' + declared.material);
      }
    }

    if (built.newMaterialInfo) {
      setNewMaterial(built.newMaterialInfo.material, built.newMaterialInfo.fitamento, built.newMaterialInfo.thickness);
    }
    if (!currentMaterial) pendingMaterial.push(built.piece);
    if (built.fitaPending) pendingFitamento.push(built.piece);
    if (built.thicknessPending) pendingThickness.push(built.piece);
  }

  /** Sobrescritas vindas de uma linha de tabela (Markdown ou TSV) — cada campo da própria linha tem prioridade sobre o contexto corrente. */
  interface DimensionFirstOverrides {
    funcao?: string | null;
    complemento?: string | null;
    material?: string | null;
    thicknessMm?: number | null;
    customFita?: RawPiece['customFita'];
  }

  /**
   * Constrói e registra uma peça a partir de um resultado já validado de
   * tryMatchDimensionFirstLine, tryMatchPcAsteriskLine OU de uma linha de
   * tabela (Markdown ou TSV, ver markdown-table.ts/tsv-table.ts) — todos
   * têm o mesmo formato de resultado (qty/compr/larg), então compartilham
   * esta mesma função. `overrides` só vem preenchido pelas tabelas, quando
   * a linha tem colunas próprias de nome da peça, material ou fita
   * explícita — nesses casos a própria linha é a fonte da verdade,
   * sobrescrevendo o que estiver em vigor no contexto corrente.
   */
  function addDimensionFirstPiece(match: DimensionFirstMatch, ctx: ParseContext, overrides?: DimensionFirstOverrides): void {
    pendingMaterialName = null;
    const piece = buildPieceFromDimensionFirstMatch(match, ctx);
    if (overrides?.funcao) piece.funcao = overrides.funcao;
    if (overrides?.complemento) piece.complemento = overrides.complemento;
    if (overrides?.material) piece.material = overrides.material;
    if (overrides?.thicknessMm != null) piece.thicknessMm = overrides.thicknessMm;
    if (overrides?.customFita) piece.customFita = overrides.customFita;
    piece.id = nextId();
    pieces.push(piece);

    if (!piece.material) pendingMaterial.push(piece);
    if (piece.fitaType == null && !piece.customFita) pendingFitamento.push(piece);
    if (piece.thicknessMm == null) pendingThickness.push(piece);
  }

  /**
   * Trata uma linha com mais de uma peça (ex: "2=47/47, 3=50/60"): separa
   * em segmentos e só aceita se TODOS os segmentos resultarem em peças
   * válidas — caso contrário, mantém a linha inteira na conferência, para
   * evitar registrar parte da linha errada ou perder informação calada.
   */
  function addPiecesFromMultiSegmentLine(line: string): void {
    const segments = splitIntoPieceSegments(line);
    const segmentMatches = segments.map(tryMatchPieceLine);

    const allValid =
      segments.length > 1 &&
      segmentMatches.every((segMatch) => {
        if (!segMatch) return false;
        const segComprimento = toNumber(segMatch.dimensionMatch[1]!);
        const segLargura = toNumber(segMatch.dimensionMatch[3]!);
        return isValidPiece(segComprimento, segLargura, segMatch.qty) && !SUSPICIOUS_ADJACENT_RE.test(segMatch.rawSuffix);
      });

    if (!allValid) {
      pushDiscarded(line);
      return;
    }

    const ctx = snapshotContext();
    segmentMatches.forEach((segMatch) => {
      addSinglePiece(segMatch as PieceMatch, ctx);
    });
  }

  // Expande uma lista "1pc96*65. 1pc192*65. ..." (tudo numa única linha,
  // separada por ponto) em uma linha por peça, antes de mais nada — o resto
  // da função processa cada peça normalmente a partir daqui.
  const { text: textWithoutTotal, total: statedTotal } = extractStatedTotal(text);
  const { text: textWithoutUnits, unitFactor: measureUnitFactor } = stripMeasureUnits(
    normalizeDotAfterQuantity(stripWhatsAppExportPrefixes(textWithoutTotal)),
  );
  const expandedText = expandPcSeparatedPieces(joinSplitQuantityLines(mergeMdfThicknessAndColorLines(textWithoutUnits)));

  expandedText.split('\n').forEach((rawLine) => {
    // Marcador de lista ("* 4 peças ...", "• ...", "- ...") — só quando
    // seguido de espaço, pra não confundir com "*negrito*" do WhatsApp nem
    // com um sinal de menos colado a um número.
    let line = stripWhatsAppFormatting(rawLine.trim().replace(/^[*•–-]\s+/, ''));
    if (!line) return;

    // Saudação solta ("Boa tarde duas laterais...") e quantidade por
    // extenso ("uma", "duas", "cinco"...) — ver text-normalize.ts. Sempre
    // no início do processamento da linha: sem isso, a quantidade por
    // extenso nunca fica no começo da linha (onde QUANTITY_RE espera um
    // dígito) e a peça inteira não é reconhecida.
    line = normalizeLeadingNumberWord(stripGreetingPrefix(line)).replace(CUT_VERB_PREFIX_RE, '');

    // Tabela em formato Markdown (delimitada por "|", ver
    // markdown-table.ts) ou colada de planilha (delimitada por tabulação,
    // ver tsv-table.ts). Checado antes de tudo o mais: nenhum outro
    // formato usa "|" nem tabulação, então não há risco de conflito, e a
    // máquina de estado (tableColumns/tableDelimiter) precisa ver o
    // cabeçalho antes das linhas de dados que vêm depois dele.
    if (tableColumns && tableDelimiter === 'markdown' && isMarkdownTableSeparatorLine(line)) {
      // Linha separadora do Markdown ("| ---: | ---: |") - só existe entre
      // o cabeçalho e as linhas de dados, nada a fazer além de pular. A
      // checagem de tableColumns aqui evita engolir em silêncio uma linha
      // qualquer de hifens que não seja de tabela nenhuma.
      return;
    }
    if (!tableColumns) {
      const markdownHeaderMatch = parseMarkdownTableHeader(line);
      if (markdownHeaderMatch) {
        tableColumns = markdownHeaderMatch;
        tableDelimiter = 'markdown';
        return;
      }
      const tsvHeaderMatch = parseTsvTableHeader(line);
      if (tsvHeaderMatch) {
        tableColumns = tsvHeaderMatch;
        tableDelimiter = 'tsv';
        return;
      }
    }
    if (tableColumns) {
      const tableRow: TableRow | null =
        tableDelimiter === 'markdown' ? parseMarkdownTableRow(line, tableColumns) : parseTsvTableRow(line, tableColumns);
      if (tableRow) {
        if (!isValidPiece(tableRow.compr, tableRow.larg, tableRow.qty)) {
          pushDiscarded(line);
          return;
        }
        addDimensionFirstPiece(tableRow, snapshotContext(), {
          funcao: tableRow.funcao,
          complemento: tableRow.complemento,
          material: tableRow.material,
          thicknessMm: tableRow.thicknessMm,
          customFita: tableRow.customFita,
        });
        return;
      }
      // Linha não é mais uma linha de dados válida da tabela em andamento
      // (ou a linha nem é de tabela mais) - a tabela terminou.
      tableColumns = null;
      tableDelimiter = null;

      // Antes de desistir, confere se essa MESMA linha é o cabeçalho de uma
      // tabela nova - caso real: um PDF de várias páginas repete a linha de
      // cabeçalho em toda página nova (comum em relatórios paginados). Sem
      // essa checagem, essa repetição batia aqui como "linha de dados
      // inválida" (encerrando a tabela em andamento) e SUMIA em silêncio,
      // sem nunca reabrir uma tabela nova - fazendo o resto daquela página
      // inteira (até a página seguinte repetir o cabeçalho de novo) cair
      // pra fora do reconhecimento de tabela, uma por uma, como linhas
      // soltas não reconhecidas.
      const markdownHeaderRetry = parseMarkdownTableHeader(line);
      if (markdownHeaderRetry) {
        tableColumns = markdownHeaderRetry;
        tableDelimiter = 'markdown';
        return;
      }
      const tsvHeaderRetry = parseTsvTableHeader(line);
      if (tsvHeaderRetry) {
        tableColumns = tsvHeaderRetry;
        tableDelimiter = 'tsv';
        return;
      }
    }

    // "1200 × 700: nos 4 lados" — fita de uma peça já listada, identificada
    // pelas medidas (ver fita-by-dimension.ts). Antes do bloco de códigos
    // abaixo, que troca um "450 x 100" inicial por "450 100".
    const fitaByDimensionRule = parseFitaByDimensionLine(line);
    if (fitaByDimensionRule) {
      fitaByDimensionRules.push(fitaByDimensionRule);
      return;
    }

    // "550 X 660 X 15 = 8": comprimento x largura x espessura = quantidade.
    // Antes do tratamento de "3 X 0,80 X 0,505" (quantidade primeiro) logo
    // abaixo, que desmontaria esta linha.
    const dimensionThicknessMatch = tryMatchDimensionsThicknessLine(line);
    if (dimensionThicknessMatch) {
      if (!isValidPiece(dimensionThicknessMatch.compr, dimensionThicknessMatch.larg, dimensionThicknessMatch.qty)) {
        pushDiscarded(line);
        return;
      }
      addDimensionFirstPiece(dimensionThicknessMatch, snapshotContext(), { thicknessMm: dimensionThicknessMatch.lineThicknessMm });
      return;
    }

    // Códigos de fita colados ao final da linha (ex: "... 1M 1m", "... 3L")
    // — ver fita-codes.ts. Só tenta em linhas que começam com dígito (a
    // quantidade), o mesmo universo de linhas que os formatos de peça
    // abaixo reconhecem — evita mexer em cabeçalhos/complementos que por
    // acaso terminem com algo parecido (ex: "Quarto 2").
    let fitaCodes: string[] = [];
    if (/^\d/.test(line)) {
      const stripped = extractTrailingFitaCodes(line);
      if (stripped.codes.length > 0) {
        line = stripped.line;
        fitaCodes = stripped.codes;
        perPieceFitaSeen = true;
      } else {
        const signs = extractTrailingFitaSigns(line);
        if (signs.codes.length > 0) {
          line = signs.line;
          fitaCodes = signs.codes;
          perPieceFitaSeen = true;
        }
      }
      // Formato "quantidade X comprimento X largura" (ex: "3 X 0,80 X
      // 0,505") repete o separador "X" também entre a quantidade e o
      // comprimento — sem remover esse "X" solto, ele sobraria como prefixo
      // da linha e viraria (erroneamente) a Função da peça.
      // Não vale para "2750 x 610 = 06" (medidas primeiro): ali o primeiro número já é o comprimento.
      if (!tryMatchDimensionFirstLine(line)) line = line.replace(/^(\d+)\s+[xX]\s+/, '$1 ');
    }

    // Linha inteira só de espessura (ex: "De 15mm", "18mm" sozinha) —
    // checada ANTES da tentativa de quantidade/peça de propósito: uma
    // linha como "18mm" começa com dígito, então QUANTITY_RE a
    // interpretaria como "quantidade 18" + sufixo "mm" sem medida
    // nenhuma — cairia no fallback de cabeçalho abaixo já com o "18"
    // perdido (só sobraria "mm" solto, sem número, pra THICKNESS_ONLY_RE
    // reconhecer). Como THICKNESS_ONLY_RE exige a linha INTEIRA (^...$)
    // e uma peça de verdade sempre tem duas medidas, não corre risco de
    // engolir por engano uma peça real aqui.
    const earlyThicknessMatch = line.match(THICKNESS_ONLY_RE);
    if (earlyThicknessMatch) {
      const thicknessVal = toNumber((earlyThicknessMatch[1] || earlyThicknessMatch[2])!);
      if (pendingMaterialName) {
        setNewMaterial(pendingMaterialName, null, thicknessVal);
        return;
      }
      currentThickness = thicknessVal;
      pendingThickness.forEach((entry) => {
        if (entry.thicknessMm == null) entry.thicknessMm = currentThickness;
      });
      pendingThickness = [];
      return;
    }

    // Formato "comprimento x largura: quantidade" (ver DIMENSION_FIRST_RE) e
    // "quantidade+pc+comprimento*largura" (ver PC_ASTERISK_RE) — checados
    // antes do formato principal porque são linhas inteiras ancoradas
    // (^...$) que nunca deveriam ser reinterpretadas pelas regras abaixo.
    // Em particular, QUANTITY_RE trataria o "pc" de "1pc96*65" como um
    // marcador de quantidade válido (está na mesma lista de "pç"/"pc"
    // usada no formato principal) e cortaria a linha no lugar errado.
    const dimensionFirstMatch = tryMatchDimensionFirstLine(line);
    if (dimensionFirstMatch) {
      if (!isValidPiece(dimensionFirstMatch.compr, dimensionFirstMatch.larg, dimensionFirstMatch.qty)) {
        pushDiscarded(line);
        return;
      }
      addDimensionFirstPiece(dimensionFirstMatch, snapshotContext());
      if (fitaCodes.length > 0) applyFitaCodesToPiece(pieces[pieces.length - 1]!, fitaCodes);
      return;
    }

    const pcAsteriskMatch = tryMatchPcAsteriskLine(line);
    if (pcAsteriskMatch) {
      if (!isValidPiece(pcAsteriskMatch.compr, pcAsteriskMatch.larg, pcAsteriskMatch.qty)) {
        pushDiscarded(line);
        return;
      }
      addDimensionFirstPiece(pcAsteriskMatch, snapshotContext());
      if (fitaCodes.length > 0) applyFitaCodesToPiece(pieces[pieces.length - 1]!, fitaCodes);
      return;
    }

    const quantityMatch = line.match(QUANTITY_RE);
    if (quantityMatch) {
      const match = tryMatchPieceLine(line);
      if (match) {
        if (MULTIPLE_PIECES_RE.test(match.rawSuffix)) {
          addPiecesFromMultiSegmentLine(line);
          return;
        }

        const comprimento = toNumber(match.dimensionMatch[1]!);
        const largura = toNumber(match.dimensionMatch[3]!);
        const looksLikeTypo = SUSPICIOUS_ADJACENT_RE.test(match.rawSuffix);

        if (!isValidPiece(comprimento, largura, match.qty) || looksLikeTypo) {
          // Provável erro de digitação: sugere a versão corrigida (se
          // ela resultar numa peça válida) para o usuário só confirmar.
          const normalizedLine = normalizeTypos(line);
          let suggestion: string | null = null;
          if (normalizedLine !== line) {
            const normalizedMatch = tryMatchPieceLine(normalizedLine);
            if (normalizedMatch) {
              const normComprimento = toNumber(normalizedMatch.dimensionMatch[1]!);
              const normLargura = toNumber(normalizedMatch.dimensionMatch[3]!);
              if (isValidPiece(normComprimento, normLargura, normalizedMatch.qty)) {
                suggestion = normalizedLine;
              }
            }
          }
          pushDiscarded(line, suggestion);
          return;
        }

        addSinglePiece(match, snapshotContext());
        if (fitaCodes.length > 0) applyFitaCodesToPiece(pieces[pieces.length - 1]!, fitaCodes);
        return;
      }
      // Ferragem com quantidade e sem medidas: ignorada, não é cabeçalho.
      if (HARDWARE_ITEM_RE.test(quantityMatch[3]!)) return;
      // Tinha formato de quantidade, mas não achou medidas depois dela —
      // segue analisando o restante da linha como possível cabeçalho.
      line = quantityMatch[3]!;
    }

    const thicknessMatch = line.match(THICKNESS_ONLY_RE);
    if (thicknessMatch) {
      const thicknessVal = toNumber((thicknessMatch[1] || thicknessMatch[2])!);
      if (pendingMaterialName) {
        // A linha anterior era só um nome, sem número nenhum (ex: "Freijó
        // Trend") — junto com essa espessura solta, forma um cabeçalho de
        // material em DUAS linhas (ver captura de pendingMaterialName mais
        // abaixo). Conta como uma declaração de material nova de verdade,
        // não só um ajuste retroativo de espessura.
        setNewMaterial(pendingMaterialName, null, thicknessVal);
        return;
      }
      currentThickness = thicknessVal;
      pendingThickness.forEach((entry) => {
        if (entry.thicknessMm == null) entry.thicknessMm = currentThickness;
      });
      pendingThickness = [];
      return;
    }

    // Declaração retroativa de espessura QUE TAMBÉM traz o material na
    // mesma linha, depois de um ponto (ex: "Todas essas pesas de 15mm.
    // Branca ok" — ver THICKNESS_WITH_TRAILING_MATERIAL_RE). Checada antes
    // de parseFitamentoPhrase/"mdf" porque essa frase não menciona fita nem
    // a palavra MDF, cairia batendo em nenhum dos dois e só seria
    // reconhecida (na melhor das hipóteses) como um cabeçalho de material
    // solto SEM aproveitar a espessura, perdendo a peça de "15mm".
    const aboveMatch = line.match(ABOVE_PIECES_DECLARATION_RE);
    const aboveDeclaration = aboveMatch ? extractAboveDeclaration(aboveMatch[1]!) : null;
    if (aboveDeclaration) {
      const block = pieces.slice(aboveBlockStart);
      block.forEach((piece) => {
        piece.material = aboveDeclaration.material;
        if (aboveDeclaration.thickness != null) piece.thicknessMm = aboveDeclaration.thickness;
      });
      // Já resolvidas: um cabeçalho de material mais abaixo não pode reescrevê-las.
      pendingMaterial = pendingMaterial.filter((entry) => !block.includes(entry as RawPiece));
      pendingThickness = pendingThickness.filter((entry) => !block.includes(entry as RawPiece));
      aboveBlockStart = pieces.length;
      if (aboveDeclaration.thickness != null) {
        declaredMaterials.push({ material: aboveDeclaration.material, thickness: aboveDeclaration.thickness });
      }
      materialMentioned = true;
      return;
    }

    const thicknessWithMaterialMatch = line.match(THICKNESS_WITH_TRAILING_MATERIAL_RE);
    if (thicknessWithMaterialMatch) {
      const thicknessVal = toNumber(thicknessWithMaterialMatch[1]!);
      const materialCandidate = stripTrailingAcknowledgement(thicknessWithMaterialMatch[2]!.trim());
      if (materialCandidate) {
        // setNewMaterial (ver acima) backfilla pendingMaterial, mas só
        // LIMPA pendingThickness sem escrever de volta nas entradas (é
        // assim mesmo no motor legado — ver o teste "retroactive backfill"
        // em analyze.test.ts) — então a espessura desta linha (que
        // TAMBÉM é retroativa, ao contrário do "MDF ... de Nmm" comum)
        // precisa ser aplicada aqui, ANTES de chamar setNewMaterial.
        pendingThickness.forEach((entry) => {
          if (entry.thicknessMm == null) entry.thicknessMm = thicknessVal;
        });
        setNewMaterial(materialCandidate, null, thicknessVal);
        return;
      }
    }

    // Rótulo de seção ("Nichos:", "Portas:  (todas fitado 4 lados )"): vira a
    // Função padrão das peças seguintes, e a nota de fita entre parênteses
    // vale só DAQUI PARA FRENTE (diferente de uma frase de fita solta, que
    // também vale para as peças já lidas sem fita). Fica de fora tudo que é
    // ambiente/móvel (Complemento, tratado mais abaixo), "Ferragens:" e
    // companhia, e "Fita de borda:".
    const dotLabelMatch = line.match(SECTION_DOT_LABEL_RE);
    if (dotLabelMatch && classifyHeaderLine(dotLabelMatch[1]!.trim()) === 'funcao') {
      const dotMaterial = dotLabelMatch[2]?.trim();
      pendingMaterialName = null;
      currentFuncao = dotLabelMatch[1]!.trim();
      // O mesmo material repetido em cada seção não reabre o bloco.
      if (dotMaterial && dotMaterial.toLowerCase() !== currentMaterial.toLowerCase()) {
        setNewMaterial(dotMaterial, null, null);
      }
      return;
    }

    const sectionLabelMatch = line.match(SECTION_LABEL_RE);
    if (sectionLabelMatch && !/mdf/i.test(line)) {
      const label = sectionLabelMatch[1]!.trim();
      const lowerLabel = label.toLowerCase();
      if (
        DISCARD_LABELS.indexOf(lowerLabel) === -1 &&
        NON_SECTION_LABELS.indexOf(lowerLabel) === -1 &&
        !/\bfita\b/i.test(label) &&
        classifyHeaderLine(label) !== 'complemento'
      ) {
        // Um bloco de material fino (ex: fundos de 6mm) acabou: volta ao
        // material de antes dele.
        if (
          materialBeforeHeader &&
          currentThickness != null &&
          currentThickness < MIN_EDGE_BANDING_THICKNESS_MM &&
          pieces.length > materialBeforeHeader.pieceCount
        ) {
          currentMaterial = materialBeforeHeader.material;
          currentFitamentoType = materialBeforeHeader.fitaType;
          currentThickness = materialBeforeHeader.thickness;
          materialBeforeHeader = null;
        }
        pendingMaterialName = null;
        currentFuncao = label;
        const noteType = sectionLabelMatch[2] ? parseFitamentoPhrase(sectionLabelMatch[2]) : null;
        if (noteType) currentFitamentoType = noteType;
        return;
      }
    }

    const fitamentoType = parseFitamentoPhrase(line);
    if (fitamentoType && !/mdf/i.test(line)) {
      currentFitamentoType = fitamentoType;
      pendingFitamento.forEach((entry) => {
        if (entry.fitaType == null) entry.fitaType = currentFitamentoType;
      });
      pendingFitamento = [];
      return;
    }

    if (/mdf/i.test(line)) {
      const headerInfo = extractHeaderInfo(line);
      setNewMaterial(headerInfo.material, headerInfo.fitamento, headerInfo.thickness);
      return;
    }

    // Cabeçalho sem "MDF" (ex: "PEÇAS 15mm NAVAL BR") — fitamento fica
    // null de propósito: nesse formato cada peça declara a própria fita
    // através de códigos ao final da linha (ver fita-codes.ts), não há um
    // padrão de bloco a aplicar retroativamente.
    const pecasHeaderMatch = line.match(PECAS_HEADER_RE);
    if (pecasHeaderMatch) {
      setNewMaterial(pecasHeaderMatch[2]!.trim(), null, toNumber(pecasHeaderMatch[1]!));
      return;
    }

    // Cabeçalho ainda mais genérico, sem palavra-marcador nenhuma (ex:
    // "cinza jazz 18 mm" — só a cor do MDF e a espessura). Testado por
    // último entre os cabeçalhos porque não tem nenhuma palavra-chave para
    // se ancorar, só o "Nmm" no final da linha.
    const genericHeaderMatch = line.match(GENERIC_THICKNESS_HEADER_RE);
    if (genericHeaderMatch) {
      // A palavra de acabamento depois da espessura ("Branco 6mm comum") faz
      // parte do nome do material.
      const finish = genericHeaderMatch[3] ? ' ' + genericHeaderMatch[3] : '';
      setNewMaterial(genericHeaderMatch[1]!.trim() + finish, null, toNumber(genericHeaderMatch[2]!));
      return;
    }

    const normalizedLabel = line.toLowerCase().replace(/[.:]/g, '').trim();
    if (DISCARD_LABELS.indexOf(normalizedLabel) !== -1) {
      pushDiscarded(line);
      return;
    }
    if (SEPARATOR_LINE_RE.test(line)) {
      pushDiscarded(line);
      return;
    }
    if (LOOKS_LIKE_PIECE_RE.test(line)) {
      // Parece uma tentativa de peça que não bateu com o padrão esperado.
      pushDiscarded(line);
      return;
    }

    const headerCategory = classifyHeaderLine(line);
    if (headerCategory === 'complemento') {
      pendingMaterialName = null;
      currentComplemento = line;
      currentFuncao = '';
    } else if (headerCategory === 'funcao') {
      pendingMaterialName = null;
      currentFuncao = line;
    } else {
      // 'unknown': não é ambiente/função conhecidos — tenta como último
      // recurso um cabeçalho de material sem nenhuma palavra-chave nem
      // unidade (ex: "Branco 18 comum"). Só chega aqui depois que
      // classifyHeaderLine já teve a chance de reconhecer um ambiente
      // terminado em número (ex: "Quarto 2") como Complemento, então o
      // risco de confundir os dois é baixo.
      const bareHeaderMatch = line.match(BARE_THICKNESS_HEADER_RE);
      if (bareHeaderMatch) {
        setNewMaterial(bareHeaderMatch[1]!.trim(), null, toNumber(bareHeaderMatch[2]!));
      } else if (NAME_ONLY_LINE_RE.test(line)) {
        // Nome de material sozinho, sem espessura junto (ex: "Freijó
        // Trend") — guarda como candidato até a próxima linha, que pode
        // ser só a espessura (ex: "18mm"), ver THICKNESS_ONLY_RE acima.
        // Só letras/espaços (nada de dígito) e uma linha curta, pra não
        // engolir por engano uma frase qualquer não reconhecida.
        pendingMaterialName = line.trim();
      } else {
        pendingMaterialName = null;
      }
      // Senão, linha não reconhecida, ignorada em silêncio.
    }
  });

  applyFitaByDimensionRules(pieces, fitaByDimensionRules).forEach((unmatchedLine) => pushDiscarded(unmatchedLine));

  // Marca ANTES de defaultar fitaType pendente pra 'none-explicit' logo
  // abaixo - só nesse momento "fitaType == null" significa de verdade que
  // nada foi dito sobre fita em lugar nenhum da mensagem (ver
  // RawPiece.fitaUnknown e markFitaUnknownIfNeeded em finalize.ts).
  if (perPieceFitaSeen) {
    pieces.forEach((piece) => {
      // fitaUnknown também entra: um cabeçalho de material seguinte pode já
      // ter marcado a peça como "desconhecida" (e dado fitaType) antes daqui.
      if (!piece.customFita && (piece.fitaType == null || piece.fitaUnknown)) {
        piece.fitaType = 'none-explicit';
        delete piece.fitaUnknown;
        addAssumption(piece, ASSUMED_NO_FITA_NOTE);
      }
    });
  }

  pieces.forEach(markFitaUnknownIfNeeded);

  pendingFitamento.forEach((entry) => {
    entry.fitaType = entry.fitaType || 'none-explicit';
  });
  // finalizePiece muta e devolve a mesma referência, já tipada como Piece.
  const finalizedPieces: Piece[] = pieces.map(finalizePiece);

  // materialMentioned começa marcado só quando uma declaração de material
  // em TEXTO LIVRE foi vista em algum lugar da mensagem (ver
  // setNewMaterial acima) — isso NUNCA acontece para peças vindas de uma
  // tabela com coluna própria de material/Chapa (ver overrides.material em
  // addDimensionFirstPiece, table-columns.ts), já que essas nunca passam
  // por setNewMaterial. Caso real: um PDF inteiro em formato de tabela,
  // cada peça já com material preenchido pela própria coluna, mas o
  // sistema perguntava "não encontrei material" mesmo assim. Corrige aqui,
  // no fim: se TODAS as peças já têm material de verdade (não vazio, não
  // só a espessura sozinha), não há nada a perguntar, mesmo que nenhuma
  // declaração de texto livre tenha sido vista.
  if (!materialMentioned && finalizedPieces.length > 0) {
    materialMentioned = finalizedPieces.every((p) => !looksLikeNoMaterial(p.material));
  }

  const unitFactor = detectStatedUnitFactor(text) ?? measureUnitFactor;
  const result: AnalyzeResult = { pieces: finalizedPieces, discarded, materialMentioned };
  if (unitFactor != null) result.unitFactor = unitFactor;
  if (statedTotal != null) result.statedTotal = statedTotal;
  return result;
}
