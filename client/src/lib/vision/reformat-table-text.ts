/**
 * reformat-table-text.ts
 * ---------------------------------------------------------------------------
 * Reorganiza o texto bruto do OCR (que vem na ordem das colunas da tabela:
 * Compr., Largura, Quant., Rotação, Nome, PA) para o formato que
 * @corte-cloud/parser já entende: quantidade=comprimento/largura [nome].
 * Portado verbatim de `legacy/js/vision.js` (mesmas regexes, mesmos
 * comentários) — fica no client, não no pacote parser, porque é específico
 * de "limpar saída de OCR", não de "interpretar sintaxe de corte".
 * ---------------------------------------------------------------------------
 */

/**
 * Uma linha de peça na tabela impressa, na ordem #, Compr., Largura,
 * Quant., Rotação, Nome, PA. Não ancora no início da linha de propósito:
 * a coluna "#" costuma sair ilegível no OCR (testado com fotos reais —
 * vem como "P", "B", "191" em vez de "1.", "2.", "11."), então é mais
 * confiável procurar direto pela sequência Compr./Largura/Quant. em
 * qualquer posição da linha, ignorando o que vier antes dela.
 *
 * Depois da 3ª medida, exige que NÃO venha outro número em seguida
 * ((?!\s*\d)) — sem essa checagem, o número da linha (#) mal lido, que
 * geralmente vem colado às medidas reais (ex: "7 406 478 6 Não"), seria
 * confundido com uma das três medidas, embaralhando tudo uma posição
 * para a esquerda.
 *
 * A coluna Rotação (grupo não-capturado depois das 3 medidas) é
 * totalmente opcional e aceita qualquer "palavra" curta — não exige que
 * o OCR tenha lido "Não"/"Sim" perfeitamente, nem que tenha lido algo
 * ali de fato. Em testes reais essa palavra às vezes sai corrompida (ou
 * nem aparece) o suficiente para não bater com um padrão mais rígido, o
 * que fazia a linha inteira ser perdida silenciosamente.
 */
export const TABLE_ROW_RE = /(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)(?!\s*\d)\s*(?:\S{1,6}\s*)?(.*)$/;

/**
 * Segundo formato de tabela suportado, na coluna "Peças": cada peça é
 * escrita como "comprimento X largura - quantidade" (ex: "1900 X 350 -
 * 2"). Esse formato não tem fitamento reconhecível por OCR (a fita é
 * indicada por sublinhado na imagem, que se perde na leitura de texto) —
 * a fita fica sempre em branco aqui, para o usuário preencher manualmente
 * na tabela de conferência.
 *
 * O "x"/"X" entre as duas medidas é tratado como opcional: em fotos reais
 * o Tesseract frequentemente "come" essa letra sozinha entre dois números
 * (confirmado testando com fotos reais — "1900 X 350 - 2" vira "1900 350
 * - 2"), sobrando só o espaço. Sem essa tolerância a linha inteira era
 * perdida silenciosamente. Ainda exige a letra OU pelo menos um espaço
 * entre as medidas, para não juntar dois números colados sem separador
 * nenhum como se fossem um só.
 */
export const PECAS_COLUMN_ROW_RE =
  /(\d+(?:[.,]\d+)?)(?:\s*[xX]\s*|\s+)(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/;

/**
 * Resíduo de checkbox vazio da coluna "PA" mal reconhecido pelo OCR (o
 * quadradinho ☐ virando letras/símbolos soltos). Em vez de tentar prever
 * cada padrão específico que o OCR pode inventar (o que varia de foto
 * pra foto — já vimos "D", "O", "I:I", mas também "[1]", ": 0]", "01]"),
 * usa duas regras mais gerais:
 *   - contém colchete ou dois-pontos → nenhum nome de peça real teria isso
 *   - é bem curto (até 3 caracteres) e não parece uma palavra de verdade
 * Quando bate com qualquer uma, trata como "sem nome", em vez de guardar
 * esse lixo no campo Função.
 */
export const CHECKBOX_ARTIFACT_RE = /[[\]:]/;
export const SHORT_SYMBOL_ARTIFACT_RE = /^[dioIl|0]{1,3}$/i;

export function looksLikeCheckboxArtifact(text: string): boolean {
  return CHECKBOX_ARTIFACT_RE.test(text) || SHORT_SYMBOL_ARTIFACT_RE.test(text);
}

/** Resultado de reformatTableText — ver campos abaixo para o propósito de cada contagem. */
export interface ReformatResult {
  /** Peças já no formato quantidade=comprimento/largura, uma por linha. */
  text: string;
  /**
   * Quantas linhas do texto bruto do OCR "pareciam" ser uma peça da tabela
   * (heurística: pelo menos 2 números na linha — cabeçalho e ruído puro não
   * têm isso). Comparar com `recognizedLineCount` é o que permite avisar
   * quando o OCR perdeu uma peça de um jeito imprevisível (ex: um dígito
   * da quantidade virou uma letra) — um erro que não dá pra prever com uma
   * regex específica, mas que sempre muda essa contagem.
   */
  candidateLineCount: number;
  /** Quantas dessas linhas realmente viraram uma peça reconhecida. */
  recognizedLineCount: number;
}

/**
 * Converte o texto bruto do OCR (uma linha por linha da tabela) para o
 * formato quantidade=comprimento/largura [nome], uma peça por linha.
 * Tenta os dois formatos de tabela suportados por linha — o segundo só
 * quando o primeiro não bate. Linhas que não batem com nenhum dos dois
 * (cabeçalho da tabela, ruído do OCR) são simplesmente ignoradas — mas
 * contadas em `candidateLineCount` quando parecem ter sido uma tentativa
 * de peça, para permitir avisar sobre uma possível perda (ver
 * ReformatResult).
 */
export function reformatTableText(rawText: string): ReformatResult {
  const pieceLines: string[] = [];
  let candidateLineCount = 0;

  rawText.split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const looksLikeRowAttempt = (line.match(/\d+/g) ?? []).length >= 2;

    const match = line.match(TABLE_ROW_RE);
    if (match) {
      if (looksLikeRowAttempt) candidateLineCount++;
      const comprimento = match[1];
      const largura = match[2];
      const quantidade = match[3];
      let nome = (match[4] || '').trim();
      if (looksLikeCheckboxArtifact(nome)) nome = '';

      let pieceLine = quantidade + '=' + comprimento + '/' + largura;
      if (nome) pieceLine += ' ' + nome;
      pieceLines.push(pieceLine);
      return;
    }

    const pecasMatch = line.match(PECAS_COLUMN_ROW_RE);
    if (pecasMatch) {
      if (looksLikeRowAttempt) candidateLineCount++;
      pieceLines.push(pecasMatch[3] + '=' + pecasMatch[1] + '/' + pecasMatch[2]);
      return;
    }

    if (looksLikeRowAttempt) candidateLineCount++;
  });

  return { text: pieceLines.join('\n'), candidateLineCount, recognizedLineCount: pieceLines.length };
}

/**
 * Monta o cabeçalho "MDF <material>" a partir do que o usuário digitou
 * (sem exigir que ele mesmo escreva "MDF"), ou string vazia se não informado.
 */
export function buildMaterialHeader(material: string): string {
  if (!material) return '';
  const jaComecaComMdf = /^mdf\b/i.test(material);
  return (jaComecaComMdf ? material : 'MDF ' + material) + '\n';
}
