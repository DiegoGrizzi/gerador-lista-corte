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
  PECAS_HEADER_RE,
  GENERIC_THICKNESS_HEADER_RE,
  BARE_THICKNESS_HEADER_RE,
  NAME_ONLY_LINE_RE,
  DISCARD_LABELS,
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
} from './text-normalize.js';
import { parseFitamentoPhrase } from './fitamento.js';
import { extractTrailingFitaCodes, applyFitaCodesToPiece } from './fita-codes.js';
import { classifyHeaderLine, extractHeaderInfo } from './header.js';
import { isMarkdownTableSeparatorLine, parseMarkdownTableHeader, parseMarkdownTableRow } from './markdown-table.js';
import { parseTsvTableHeader, parseTsvTableRow } from './tsv-table.js';
import type { TableColumns, TableRow } from './table-columns.js';
import {
  isValidPiece,
  tryMatchPieceLine,
  buildPieceFromMatch,
  splitIntoPieceSegments,
  tryMatchDimensionFirstLine,
  tryMatchPcAsteriskLine,
  buildPieceFromDimensionFirstMatch,
} from './piece-matcher.js';
import type { PieceMatch, DimensionFirstMatch } from './piece-matcher.js';
import { finalizePiece } from './finalize.js';
import type { AnalyzeResult, DiscardedItem, FitamentoType, NextIdFn, ParseContext, Piece, RawPiece } from './types.js';

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
    pendingMaterialName = null;
    pendingMaterial.forEach((entry) => {
      entry.material = materialText;
    });
    pendingMaterial = [];
    pendingFitamento.forEach((entry) => {
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
  const expandedText = expandPcSeparatedPieces(text);

  expandedText.split('\n').forEach((rawLine) => {
    let line = stripWhatsAppFormatting(rawLine.trim());
    if (!line) return;

    // Saudação solta ("Boa tarde duas laterais...") e quantidade por
    // extenso ("uma", "duas", "cinco"...) — ver text-normalize.ts. Sempre
    // no início do processamento da linha: sem isso, a quantidade por
    // extenso nunca fica no começo da linha (onde QUANTITY_RE espera um
    // dígito) e a peça inteira não é reconhecida.
    line = normalizeLeadingNumberWord(stripGreetingPrefix(line));

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
      }
      // Formato "quantidade X comprimento X largura" (ex: "3 X 0,80 X
      // 0,505") repete o separador "X" também entre a quantidade e o
      // comprimento — sem remover esse "X" solto, ele sobraria como prefixo
      // da linha e viraria (erroneamente) a Função da peça.
      line = line.replace(/^(\d+)\s+[xX]\s+/, '$1 ');
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
      setNewMaterial(genericHeaderMatch[1]!.trim(), null, toNumber(genericHeaderMatch[2]!));
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

  pendingFitamento.forEach((entry) => {
    entry.fitaType = entry.fitaType || 'none-explicit';
  });
  // finalizePiece muta e devolve a mesma referência, já tipada como Piece.
  const finalizedPieces: Piece[] = pieces.map(finalizePiece);

  return { pieces: finalizedPieces, discarded, materialMentioned };
}
