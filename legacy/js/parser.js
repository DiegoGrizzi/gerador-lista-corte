/**
 * parser.js
 * ---------------------------------------------------------------------------
 * Motor de interpretação das mensagens de medida (WhatsApp, bloco de notas).
 *
 * Este arquivo é puramente lógico: recebe texto e devolve dados. Ele não
 * toca no DOM em nenhum momento, o que facilita testar e reaproveitar (por
 * exemplo, no console do navegador ou em testes automatizados com Node).
 *
 * API pública, exposta em `window.CutListParser`:
 *   - toNumber(str)            → converte "56'5" / "56,5" / "56.5" em 56.5
 *   - analyzeText(text)        → interpreta a mensagem inteira colada pelo usuário
 *   - quickParseLine(line,ctx) → tenta reinterpretar uma única linha corrigida
 *                                 pelo usuário na lista de conferência
 *
 * Conceitos usados ao longo do arquivo:
 *   - "peça"        → uma linha como "2=47/47" (quantidade, comprimento, largura)
 *   - "contexto"    → material / complemento / função / fita / espessura em
 *                      vigor no ponto da mensagem em que uma peça aparece
 *   - "pendente"    → uma peça (ou item de conferência) cujo material, fita
 *                      ou espessura ainda não foi declarado na mensagem, mas
 *                      pode vir a ser preenchido retroativamente por uma
 *                      linha mais abaixo (ex: material informado só no final)
 * ---------------------------------------------------------------------------
 */
(function(global){
  'use strict';

  // ===========================================================================
  // Expressões regulares e listas de palavras-chave
  // ===========================================================================

  /** Vocabulário de marcador de quantidade, reaproveitado por QUANTITY_RE e pela separação de múltiplas peças. */
  var QUANTITY_MARKER_WORDS = 'peças|peça|pças|pça|pç|pc|unidades|unidade|unid|und|un';

  /** Quantidade no início da linha: "2=", "2 pç", "2 pc", "2 un", "2 -", ou apenas "2 ". */
  var QUANTITY_RE = new RegExp('^(\\d+)\\s*(' + QUANTITY_MARKER_WORDS + '|=|-)?\\.?\\s*(.+)$', 'i');

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
  var DIMENSIONS_RE = /(\d+(?:[.,']\d+)?)\s*(fita(?=\s*(?:x|pro)))?\s*(?:x|pro|\/)\s*(\d+(?:[.,']\d+)?)\s*(fita(?![a-zà-öø-ÿ]))?(?:\s*(?:x|pro)?\s*(\d+(?:[.,']\d+)?))?/i;

  /**
   * Igual a DIMENSIONS_RE, mas sem aceitar "/" como separador.
   * Usada apenas quando a linha não tem quantidade explícita na frente
   * (ex: "160 x 90 6mm"). Sem essa restrição, uma fração como "1/4 de FCC"
   * seria lida como uma peça de 1x4.
   */
  var DIMENSIONS_NO_SLASH_RE = /(\d+(?:[.,']\d+)?)\s*(fita(?=\s*(?:x|pro)))?\s*(?:x|pro)\s*(\d+(?:[.,']\d+)?)\s*(fita(?![a-zà-öø-ÿ]))?(?:\s*(?:x|pro)?\s*(\d+(?:[.,']\d+)?))?/i;

  /** Linha só com a espessura padrão do bloco: "De 15", "Tudo de 15mm", "Todas de 6 mm". */
  var THICKNESS_ONLY_RE = /^(?:tudo|todos|todas)?\s*de\s+(\d+)\s*(?:mm|m)?\.?$/i;

  /** Espessura mencionada dentro de outra linha: "...de 15mm", "...de 6m". */
  var THICKNESS_SUFFIX_RE = /de\s+(\d+)\s*(?:mm|m)?\.?/i;

  /** Rótulos de seção que devem ir para conferência, mas nunca virar peça ou ambiente. */
  var DISCARD_LABELS = ['ferragens', 'acessórios', 'acessorios', 'hardware', 'acabamentos'];

  /** Linha puramente decorativa, ex: "----------x-------------". */
  var SEPARATOR_LINE_RE = /^[-=_*]{2,}[xX]?[-=_*]{0,}$/;

  /** Texto que é só uma unidade de medida solta ("mm", "cm"), sem valor real. */
  var UNIT_ONLY_RE = /^(mm|cm|m)\.?$/i;

  /**
   * Indica que uma linha provavelmente tentava ser uma peça (duas medidas
   * com algum separador entre elas) mas não bateu com DIMENSIONS_RE — por
   * exemplo, por um erro de digitação. Serve para decidir se a linha vai
   * para a lista de conferência (em vez de ser ignorada silenciosamente,
   * como aconteceria com o nome de um ambiente que tem número, "Quarto 2").
   */
  var LOOKS_LIKE_PIECE_RE = /\d+\s*[.,'+\-*\/x]+\s*\d+/i;

  /**
   * Sinal de número cortado por digitação: um símbolo (. , ' + - * /) colado
   * imediatamente a um dígito, logo depois da medida já interpretada.
   * Ex: em "32..2" a medida capturada seria só "32", sobrando "..2" — o "."
   * seguido de dígito aqui indica que a medida real provavelmente é outra.
   * Um ponto final comum de frase ("70.5.") não cai nessa regra, porque não
   * há dígito depois do símbolo.
   */
  var SUSPICIOUS_ADJACENT_RE = /^[.,'+\-*\/]+\d/;

  /**
   * Indica que depois da primeira peça reconhecida numa linha ainda sobra
   * o início de UMA SEGUNDA peça (ex: "2=47/47, 3=50/60"). O parser lê uma
   * peça por linha só quando não consegue separá-las com segurança (ver
   * splitIntoPieceSegments) — nesses casos a linha inteira vai para a
   * lista de conferência, em vez de perder a segunda peça em silêncio.
   */
  var MULTIPLE_PIECES_RE = new RegExp('[;,]\\s*\\d+\\s*(?:' + QUANTITY_MARKER_WORDS + ')?\\.?\\s*[=\\-]', 'i');

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
  var PIECE_SEPARATOR_RE = new RegExp('[;,]\\s*(?=\\d+\\s*(?:' + QUANTITY_MARKER_WORDS + ')?\\.?\\s*[=\\-])', 'i');

  function splitIntoPieceSegments(line){
    return line.split(PIECE_SEPARATOR_RE).map(function(segment){ return segment.trim(); }).filter(Boolean);
  }

  /** Palavras que indicam ambiente da casa ou peça de mobiliário → campo Complemento. */
  var ENVIRONMENT_OR_FURNITURE_KEYWORDS = [
    'wc', 'banheiro', 'quarto', 'sala', 'cozinha', 'lavanderia', 'escritório', 'escritorio',
    'closet', 'varanda', 'sacada', 'hall', 'corredor', 'suíte', 'suite', 'dormitório', 'dormitorio',
    'guarda-roupa', 'guarda roupa', 'roupeiro', 'armário', 'armario', 'cômoda', 'comoda',
    'estante', 'cristaleira', 'rack', 'bancada', 'penteadeira', 'cabeceira',
    'criado mudo', 'criado-mudo', 'beliche', 'escrivaninha', 'aparador', 'buffet',
    'balcão', 'balcao', 'home theater', 'painel de tv'
  ];

  /** Palavras que indicam o papel/nome da peça dentro do móvel → campo Função. */
  var PIECE_ROLE_KEYWORDS = [
    'gaveta', 'lateral', 'fundo', 'tampo', 'porta', 'prateleira', 'divisória', 'divisoria',
    'teto', 'base', 'rodapé', 'rodape', 'puxador', 'testeira', 'frontal', 'travessa',
    'montante', 'saia', 'sapato', 'sapateira', 'petiadera', 'peiteira', 'forro', 'chapeamento'
  ];

  // ===========================================================================
  // Funções utilitárias pequenas
  // ===========================================================================

  /**
   * Converte um texto de medida em número, aceitando vírgula ou aspa simples
   * como separador decimal (comuns em mensagens digitadas no celular).
   * Ex: toNumber("56'5") === 56.5, toNumber("56,5") === 56.5
   *
   * Trata também o ponto como separador de milhar quando aparecem
   * exatamente 3 dígitos depois dele (padrão brasileiro de formatação:
   * "1.200" significa 1200, não 1,2). Medidas de marcenaria nunca têm essa
   * precisão de 3 casas decimais, então esse padrão é seguro aqui — um
   * ponto com 1 ou 2 dígitos depois (ex: "56.5", "22.50") continua sendo
   * interpretado como decimal normalmente.
   */
  function toNumber(str){
    var text = String(str);
    var thousandsSeparator = text.match(/^(\d+)\.(\d{3})$/);
    if(thousandsSeparator){
      return parseFloat(thousandsSeparator[1] + thousandsSeparator[2]);
    }
    return parseFloat(text.replace(/'/g, '.').replace(',', '.'));
  }

  /**
   * Confirma se uma peça tem valores utilizáveis (nenhum zero, vazio ou NaN).
   * Uma peça inválida nunca deve aparecer na tabela — vai para conferência.
   */
  function isValidPiece(comprimento, largura, quantidade){
    return !isNaN(comprimento) && !isNaN(largura) && !isNaN(quantidade) &&
      comprimento > 0 && largura > 0 && quantidade > 0;
  }

  /**
   * Remove marcação de negrito (*texto*), itálico (_texto_) ou tachado
   * (~texto~) do WhatsApp quando envolve a linha inteira — comum quando o
   * usuário destaca um cabeçalho ou uma peça inteira ao copiar a mensagem.
   */
  function stripWhatsAppFormatting(line){
    return line.replace(/^([*_~])(.+)\1$/, '$2');
  }

  /**
   * Corrige o erro de digitação mais comum: pontuação decimal repetida por
   * engano (32..2, 0,,30, 10''5) → normaliza para um único separador.
   */
  function normalizeTypos(line){
    return line.replace(/[.,']{2,}/g, '.');
  }

  /**
   * Remove palavras de preenchimento ("de", "pro") e pontuação solta de um
   * trecho de texto, para decidir se o que resta é um valor real de Função.
   * Retorna string vazia se não sobrar nada útil.
   */
  function stripFillers(text){
    var cleaned = text.replace(/\b(de|pro)\b/gi, '').replace(/\s+/g, ' ').trim();
    if(UNIT_ONLY_RE.test(cleaned)) return '';
    if(/^[.,;:]*$/.test(cleaned)) return '';
    return cleaned;
  }

  /**
   * Remove acentuação de HTML básica (não usada para segurança de XSS aqui —
   * isso é feito na camada de interface — apenas auxiliar de parsing puro).
   */
  function escapeRegExp(str){
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ===========================================================================
  // Interpretação de frases de fitamento
  // ===========================================================================

  /**
   * Interpreta uma frase sobre fitamento e devolve um dos tipos abaixo,
   * ou null se o texto não menciona fita nenhuma:
   *   'none-explicit' → "não precisa fita" / "sem fita" / "só cortar"
   *   'all'           → "fita tudo" / "fitado os 4 lados"
   *   'maior-um'      → fita em uma borda do lado maior
   *   'maior-dois'    → fita nas duas bordas do lado maior
   *   'menor-um'      → fita em uma borda do lado menor
   *   'menor-dois'    → fita nas duas bordas do lado menor
   */
  function parseFitamentoPhrase(text){
    var lower = text.toLowerCase();
    if(/n[aã]o\s+precisa|sem\s+fita|s[oó]\s+cortar/.test(lower)) return 'none-explicit';
    if(/4\s*lados?|fita\s*tudo|tudo\s*fita/.test(lower)) return 'all';
    if(/dois?\s+lados?\s+(maior|grande)/.test(lower)) return 'maior-dois';
    if(/dois?\s+lados?\s+(menor|pequen[oa])/.test(lower)) return 'menor-dois';
    if(/lado\s+(maior|grande)|parte\s+(maior|grande)/.test(lower)) return 'maior-um';
    if(/lado\s+(menor|pequen[oa])|parte\s+(menor|pequen[oa])/.test(lower)) return 'menor-um';
    return null;
  }

  /**
   * Traduz um tipo de fitamento (ver parseFitamentoPhrase) nas quatro bordas
   * reais da peça: C1/C2 (bordas do comprimento) e L1/L2 (bordas da largura).
   * Quando o tipo é "um lado" ou "dois lados", a comparação comprimento x
   * largura decide qual par de bordas recebe a fita.
   */
  function resolveFitaFromType(type, comprimento, largura){
    var none = { c1: false, c2: false, l1: false, l2: false };
    if(!type || type === 'none-explicit') return none;
    if(type === 'all') return { c1: true, c2: true, l1: true, l2: true };

    var largMaior = largura > comprimento;
    var largMenor = largura < comprimento;

    if(type === 'maior-um') return largMaior ? { c1:false, c2:false, l1:true, l2:false } : { c1:true, c2:false, l1:false, l2:false };
    if(type === 'maior-dois') return largMaior ? { c1:false, c2:false, l1:true, l2:true } : { c1:true, c2:true, l1:false, l2:false };
    if(type === 'menor-um') return largMenor ? { c1:false, c2:false, l1:true, l2:false } : { c1:true, c2:false, l1:false, l2:false };
    if(type === 'menor-dois') return largMenor ? { c1:false, c2:false, l1:true, l2:true } : { c1:true, c2:true, l1:false, l2:false };
    return none;
  }

  // ===========================================================================
  // Classificação de linhas de cabeçalho (Complemento vs Função)
  // ===========================================================================

  /**
   * Decide se uma linha de texto (que não é peça, material nem fita) se
   * refere a um ambiente/móvel (Complemento) ou ao papel da peça (Função),
   * usando as listas de palavras-chave. Retorna 'unknown' se não reconhecer
   * nenhuma palavra — nesse caso a linha é simplesmente ignorada, sem
   * arriscar um palpite.
   */
  function classifyHeaderLine(line){
    var lower = line.toLowerCase();
    for(var i = 0; i < ENVIRONMENT_OR_FURNITURE_KEYWORDS.length; i++){
      if(lower.indexOf(ENVIRONMENT_OR_FURNITURE_KEYWORDS[i]) !== -1) return 'complemento';
    }
    for(var j = 0; j < PIECE_ROLE_KEYWORDS.length; j++){
      if(lower.indexOf(PIECE_ROLE_KEYWORDS[j]) !== -1) return 'funcao';
    }
    return 'unknown';
  }

  // ===========================================================================
  // Leitura de cabeçalhos de material ("MDF ...")
  // ===========================================================================

  /**
   * Extrai de uma linha de material (contém "MDF"): o nome do material sem
   * a espessura/fitamento embutidos, o tipo de fitamento padrão do bloco
   * (se mencionado) e a espessura em mm (se mencionada).
   * Ex: "MDF (titânio de 15mm fitado um lado maior)"
   *     → { material: "MDF titânio", fitamento: "maior-um", thickness: 15 }
   */
  function extractHeaderInfo(rawLine){
    var withoutParens = rawLine.replace(/[()]/g, ' ').trim();
    var fitamento = parseFitamentoPhrase(withoutParens);
    var thicknessMatch = withoutParens.match(THICKNESS_SUFFIX_RE);
    var thickness = thicknessMatch ? toNumber(thicknessMatch[1]) : null;
    var material = withoutParens
      .replace(/fitad[oa]\w*.*$/i, '')   // remove a frase de fitamento e tudo depois dela
      .replace(THICKNESS_SUFFIX_RE, '')  // remove "de Nmm"
      .replace(/\s{2,}/g, ' ')
      .trim();
    return { material: material, fitamento: fitamento, thickness: thickness };
  }

  // ===========================================================================
  // Reconhecimento de uma linha de peça
  // ===========================================================================

  /**
   * Tenta encontrar um padrão de peça (quantidade + duas medidas) dentro de
   * uma linha de texto. Cobre dois casos:
   *   1. Quantidade explícita seguida de medidas em qualquer lugar do resto
   *      da linha (ex: "6 = MDF branco 30x273", "2 pç 70 fita x59").
   *   2. Sem quantidade nenhuma na frente — assume-se 1 peça, desde que as
   *      medidas comecem já no início da linha (ex: "160 x 90 6mm").
   *
   * Devolve null se a linha não parecer uma peça, ou um objeto com:
   *   { qty, prefix, dimensionMatch, suffix, rawSuffix }
   * onde `rawSuffix` mantém espaços/pontuação originais (necessário para
   * detectar digitação suspeita) e `suffix` é a versão já cortada (trim).
   */
  function tryMatchPieceLine(line){
    var quantityMatch = line.match(QUANTITY_RE);
    if(!quantityMatch) return null;

    var qty = parseInt(quantityMatch[1], 10);
    var explicitMarker = quantityMatch[2];
    var rest = quantityMatch[3];

    var dimensionMatch = DIMENSIONS_RE.exec(rest);
    if(dimensionMatch){
      var rawSuffix = rest.substring(dimensionMatch.index + dimensionMatch[0].length);
      return {
        qty: qty,
        prefix: rest.substring(0, dimensionMatch.index).trim(),
        dimensionMatch: dimensionMatch,
        suffix: rawSuffix.trim(),
        rawSuffix: rawSuffix
      };
    }

    // Sem separador explícito de quantidade (=, -, pç...): tenta a linha
    // inteira como uma única peça de quantidade implícita 1.
    if(!explicitMarker){
      var fullLineMatch = DIMENSIONS_NO_SLASH_RE.exec(line);
      if(fullLineMatch && fullLineMatch.index === 0){
        var rawSuffixFull = line.substring(fullLineMatch.index + fullLineMatch[0].length);
        return {
          qty: 1,
          prefix: '',
          dimensionMatch: fullLineMatch,
          suffix: rawSuffixFull.trim(),
          rawSuffix: rawSuffixFull
        };
      }
    }

    return null;
  }

  /**
   * Monta o objeto de peça a partir de um resultado de tryMatchPieceLine e
   * do contexto (material/complemento/função/fita/espessura) em vigor.
   *
   * Função pura: não altera o contexto recebido, apenas lê dele. Quando a
   * própria linha declara um material novo (prefixo com "MDF"), isso é
   * devolvido em `newMaterialInfo` para quem chamou decidir se propaga esse
   * novo contexto para as peças seguintes — isso só faz sentido durante a
   * leitura sequencial da mensagem inteira (analyzeText), não ao reprocessar
   * uma única linha resgatada da conferência.
   *
   * @param {number} qty
   * @param {string} prefix       texto antes das medidas na linha
   * @param {RegExpMatchArray} dimensionMatch  resultado de DIMENSIONS_RE/DIMENSIONS_NO_SLASH_RE
   * @param {string} suffix       texto depois das medidas na linha
   * @param {object} ctx          { material, complemento, funcao, fitaType, thicknessMm }
   * @returns {{piece: object, newMaterialInfo: (object|null), fitaPending: boolean, thicknessPending: boolean}}
   */
  function buildPieceFromMatch(qty, prefix, dimensionMatch, suffix, ctx){
    var comprimento = toNumber(dimensionMatch[1]);
    var largura = toNumber(dimensionMatch[3]);
    var fitaNoComprimento = !!dimensionMatch[2]; // "fita" colada ao 1º número
    var fitaNaLargura = !!dimensionMatch[4];     // "fita" colada ao 2º número
    var inlineThickness = dimensionMatch[5] != null ? toNumber(dimensionMatch[5]) : null;

    var funcao = '';
    var material = ctx.material;
    var fitamentoType = ctx.fitaType;
    var thickness = ctx.thicknessMm;
    var newMaterialInfo = null;

    if(prefix && /mdf/i.test(prefix)){
      // A própria linha declara um material novo (ex: "6 = MDF branco 30x273").
      var headerInfo = extractHeaderInfo(prefix);
      material = headerInfo.material;
      fitamentoType = headerInfo.fitamento;
      thickness = headerInfo.thickness;
      newMaterialInfo = headerInfo;
    } else if(prefix){
      var funcaoFromPrefix = stripFillers(prefix);
      if(funcaoFromPrefix) funcao = funcaoFromPrefix;
    }

    // Espessura mencionada no restante da linha (ex: "... de 6mm").
    var thicknessInSuffix = suffix.match(THICKNESS_SUFFIX_RE);
    if(thicknessInSuffix){
      thickness = toNumber(thicknessInSuffix[1]);
      suffix = suffix.replace(thicknessInSuffix[0], '').trim();
    }
    var pieceThickness = inlineThickness != null ? inlineThickness : thickness;

    // Se havia "fita" colada ao 2º número, reconstrói a frase para checar se
    // na verdade era o início de algo maior, como "fita os 4 lados".
    var tailPhrase = (fitaNaLargura ? 'fita ' : '') + suffix;
    var tailPhraseType = tailPhrase.trim() ? parseFitamentoPhrase(tailPhrase) : null;

    var fitaType = null;
    var customFita = null;
    if(tailPhraseType){
      fitaType = tailPhraseType;
    } else if(fitaNoComprimento || fitaNaLargura){
      customFita = { c1: fitaNoComprimento, c2: false, l1: fitaNaLargura, l2: false };
    } else {
      fitaType = fitamentoType;
      if(!funcao){
        var funcaoFromSuffix = stripFillers(suffix);
        if(funcaoFromSuffix) funcao = funcaoFromSuffix;
      }
    }
    if(!funcao) funcao = ctx.funcao;

    /*
     * Marca como "alterado por observação" quando a própria peça declarou
     * um fitamento explícito (tailPhraseType). Duas situações contam:
     *
     *   1. "não precisa fita" / "sem fita" / "só cortar" (none-explicit) —
     *      sempre digno de destaque, é uma decisão explícita e deliberada,
     *      com ou sem um padrão de bloco pra comparar.
     *   2. Qualquer outro tipo (ex: "fitado os 4 lados") só conta como
     *      override quando existe um padrão de bloco (fitamentoType) E o
     *      resultado da peça é DIFERENTE desse padrão — evita marcar
     *      formatos onde cada peça sempre declara o próprio fitamento
     *      (sem nenhum "MDF (...) fitado ..." por perto), onde isso é o
     *      jeito normal de informar, não uma exceção a nada.
     */
    var isOverride = false;
    if(tailPhraseType === 'none-explicit'){
      isOverride = true;
    } else if(tailPhraseType && fitamentoType != null){
      var defaultFita = resolveFitaFromType(fitamentoType, comprimento, largura);
      var explicitFita = resolveFitaFromType(tailPhraseType, comprimento, largura);
      isOverride = defaultFita.c1 !== explicitFita.c1 || defaultFita.c2 !== explicitFita.c2 ||
        defaultFita.l1 !== explicitFita.l1 || defaultFita.l2 !== explicitFita.l2;
    }
    var piece = {
      id: null, // preenchido por quem cria a peça (precisa de um contador global)
      material: material,
      complemento: ctx.complemento,
      funcao: funcao,
      qtd: qty,
      compr: comprimento,
      larg: largura,
      thicknessMm: pieceThickness,
      fitaType: fitaType,
      customFita: customFita,
      isOverride: isOverride,
      note: isOverride ? (suffix || tailPhrase).trim() : ''
    };

    return {
      piece: piece,
      newMaterialInfo: newMaterialInfo,
      fitaPending: fitaType == null && !customFita,
      thicknessPending: pieceThickness == null
    };
  }

  /**
   * Chapas de MDF têm veio/desenho impresso no sentido do comprimento.
   * Quando a largura de uma peça vem maior que uma chapa permite, é sinal
   * de que ela foi digitada com comprimento e largura trocados — inverte
   * os dois valores para que o maior sempre vire o comprimento.
   *
   * A fita é remapeada junto, seguindo a MEDIDA física, não o rótulo:
   * se a fita estava em L1 (numa largura de 2000mm), depois da inversão
   * essa mesma borda passa a se chamar C1 (porque 2000 agora é o
   * comprimento) — por isso C1↔L1 e C2↔L2 trocam de lugar.
   */
  var GRAIN_INVERSION_THRESHOLD_MM = 1840;

  function applyGrainOrientationRule(piece){
    if(piece.larg <= GRAIN_INVERSION_THRESHOLD_MM) return;

    var oldCompr = piece.compr;
    var oldLarg = piece.larg;
    piece.compr = oldLarg;
    piece.larg = oldCompr;

    var oldFita = piece.fita;
    piece.fita = { c1: oldFita.l1, c2: oldFita.l2, l1: oldFita.c1, l2: oldFita.c2 };

    piece.wasInverted = true;
  }

  /**
   * Calcula os booleanos finais de fita (c1/c2/l1/l2) e junta a espessura
   * ao nome do material (ex: "MDF branco" + 15 → "MDF branco 15mm").
   * Deve ser chamada uma única vez por peça, depois que todo contexto
   * pendente (material/fita/espessura que só aparecem mais abaixo na
   * mensagem) já foi resolvido.
   *
   * Não aplica a regra do sentido do veio aqui de propósito — nesse ponto
   * a medida pode ainda não estar em milímetros (a pergunta "já está em
   * mm?" só é respondida depois). Ver convertPieceToMm.
   */
  function finalizePiece(piece){
    piece.fita = piece.customFita || resolveFitaFromType(piece.fitaType, piece.compr, piece.larg);
    var label = piece.material || '';
    if(piece.thicknessMm != null) label += (label ? ' ' : '') + piece.thicknessMm + 'mm';
    piece.material = label;
  }

  /**
   * Converte uma peça já finalizada para milímetros (multiplicando pelo
   * fator escolhido pelo usuário: 1 se já estava em mm, 10 para cm→mm,
   * 1000 para m→mm) e só então aplica a regra do sentido do veio — que
   * exige a medida real em mm para funcionar corretamente (chapas de MDF
   * têm um limite físico de largura; medir em cm ou m confundiria essa
   * checagem se aplicada antes da conversão).
   */
  function convertPieceToMm(piece, factor){
    piece.compr = Math.round(piece.compr * factor);
    piece.larg = Math.round(piece.larg * factor);
    applyGrainOrientationRule(piece);
  }

  // ===========================================================================
  // Análise da mensagem completa
  // ===========================================================================

  /**
   * Interpreta a mensagem colada pelo usuário, linha por linha, mantendo o
   * "contexto corrente" (material, complemento, função, fita e espessura em
   * vigor) e aplicando retroativamente a peças já lidas quando alguma dessas
   * informações só aparece mais abaixo no texto (comum quando o material
   * vem no fim da lista de peças).
   *
   * @param {string} text  mensagem colada pelo usuário
   * @param {function} nextId  função que devolve um novo id único por peça
   * @returns {{pieces: object[], discarded: object[], materialMentioned: boolean}}
   */
  function analyzeText(text, nextId){
    var pieces = [];
    var discarded = [];

    var currentMaterial = '';
    var currentFitamentoType = null;
    var currentThickness = null;
    var currentComplemento = '';
    var currentFuncao = '';
    var materialMentioned = false;

    // Peças/itens de conferência que ainda esperam por material, fita ou
    // espessura declarados mais abaixo na mensagem.
    var pendingMaterial = [];
    var pendingFitamento = [];
    var pendingThickness = [];

    function snapshotContext(){
      return {
        material: currentMaterial,
        complemento: currentComplemento,
        funcao: currentFuncao,
        fitaType: currentFitamentoType,
        thicknessMm: currentThickness
      };
    }

    /** Registra uma linha na lista de conferência, junto com o contexto do momento. */
    function pushDiscarded(text, suggested){
      var ctx = snapshotContext();
      discarded.push({ text: text, suggested: suggested || null, context: ctx });
      // O contexto capturado é o mesmo objeto usado pela peça, então, se
      // for atualizado depois (ver setNewMaterial), o item na conferência
      // também recebe o valor correto ao ser resgatado.
      if(!currentMaterial) pendingMaterial.push(ctx);
      if(currentFitamentoType == null) pendingFitamento.push(ctx);
      if(currentThickness == null) pendingThickness.push(ctx);
    }

    /** Atualiza o contexto corrente ao encontrar um novo cabeçalho de material,
     * propagando o valor retroativamente para tudo que estava pendente. */
    function setNewMaterial(materialText, fitType, thicknessVal){
      pendingMaterial.forEach(function(entry){ entry.material = materialText; });
      pendingMaterial = [];
      pendingFitamento.forEach(function(entry){ entry.fitaType = entry.fitaType || 'none-explicit'; });
      pendingFitamento = [];
      pendingThickness = [];
      currentMaterial = materialText;
      currentFitamentoType = fitType;
      currentThickness = thicknessVal;
      materialMentioned = true;
    }

    /** Constrói e registra uma peça a partir de um resultado de tryMatchPieceLine já validado. */
    function addSinglePiece(match, ctx){
      var built = buildPieceFromMatch(match.qty, match.prefix, match.dimensionMatch, match.suffix, ctx);
      built.piece.id = nextId();
      pieces.push(built.piece);

      if(built.newMaterialInfo){
        setNewMaterial(built.newMaterialInfo.material, built.newMaterialInfo.fitamento, built.newMaterialInfo.thickness);
      }
      if(!currentMaterial) pendingMaterial.push(built.piece);
      if(built.fitaPending) pendingFitamento.push(built.piece);
      if(built.thicknessPending) pendingThickness.push(built.piece);
    }

    /**
     * Trata uma linha com mais de uma peça (ex: "2=47/47, 3=50/60"): separa
     * em segmentos e só aceita se TODOS os segmentos resultarem em peças
     * válidas — caso contrário, mantém a linha inteira na conferência, para
     * evitar registrar parte da linha errada ou perder informação calada.
     */
    function addPiecesFromMultiSegmentLine(line){
      var segments = splitIntoPieceSegments(line);
      var segmentMatches = segments.map(tryMatchPieceLine);

      var allValid = segments.length > 1 && segmentMatches.every(function(segMatch){
        if(!segMatch) return false;
        var segComprimento = toNumber(segMatch.dimensionMatch[1]);
        var segLargura = toNumber(segMatch.dimensionMatch[3]);
        return isValidPiece(segComprimento, segLargura, segMatch.qty) && !SUSPICIOUS_ADJACENT_RE.test(segMatch.rawSuffix);
      });

      if(!allValid){
        pushDiscarded(line);
        return;
      }

      var ctx = snapshotContext();
      segmentMatches.forEach(function(segMatch){ addSinglePiece(segMatch, ctx); });
    }

    text.split('\n').forEach(function(rawLine){
      var line = stripWhatsAppFormatting(rawLine.trim());
      if(!line) return;

      var quantityMatch = line.match(QUANTITY_RE);
      if(quantityMatch){
        var match = tryMatchPieceLine(line);
        if(match){
          if(MULTIPLE_PIECES_RE.test(match.rawSuffix)){
            addPiecesFromMultiSegmentLine(line);
            return;
          }

          var comprimento = toNumber(match.dimensionMatch[1]);
          var largura = toNumber(match.dimensionMatch[3]);
          var looksLikeTypo = SUSPICIOUS_ADJACENT_RE.test(match.rawSuffix);

          if(!isValidPiece(comprimento, largura, match.qty) || looksLikeTypo){
            // Provável erro de digitação: sugere a versão corrigida (se
            // ela resultar numa peça válida) para o usuário só confirmar.
            var normalizedLine = normalizeTypos(line);
            var suggestion = null;
            if(normalizedLine !== line){
              var normalizedMatch = tryMatchPieceLine(normalizedLine);
              if(normalizedMatch){
                var normComprimento = toNumber(normalizedMatch.dimensionMatch[1]);
                var normLargura = toNumber(normalizedMatch.dimensionMatch[3]);
                if(isValidPiece(normComprimento, normLargura, normalizedMatch.qty)){
                  suggestion = normalizedLine;
                }
              }
            }
            pushDiscarded(line, suggestion);
            return;
          }

          addSinglePiece(match, snapshotContext());
          return;
        }
        // Tinha formato de quantidade, mas não achou medidas depois dela —
        // segue analisando o restante da linha como possível cabeçalho.
        line = quantityMatch[3];
      }

      var thicknessMatch = line.match(THICKNESS_ONLY_RE);
      if(thicknessMatch){
        currentThickness = toNumber(thicknessMatch[1]);
        pendingThickness.forEach(function(entry){ if(entry.thicknessMm == null) entry.thicknessMm = currentThickness; });
        pendingThickness = [];
        return;
      }

      var fitamentoType = parseFitamentoPhrase(line);
      if(fitamentoType && !/mdf/i.test(line)){
        currentFitamentoType = fitamentoType;
        pendingFitamento.forEach(function(entry){ if(entry.fitaType == null) entry.fitaType = currentFitamentoType; });
        pendingFitamento = [];
        return;
      }

      if(/mdf/i.test(line)){
        var headerInfo = extractHeaderInfo(line);
        setNewMaterial(headerInfo.material, headerInfo.fitamento, headerInfo.thickness);
        return;
      }

      var normalizedLabel = line.toLowerCase().replace(/[.:]/g, '').trim();
      if(DISCARD_LABELS.indexOf(normalizedLabel) !== -1){
        pushDiscarded(line);
        return;
      }
      if(SEPARATOR_LINE_RE.test(line)){
        pushDiscarded(line);
        return;
      }
      if(LOOKS_LIKE_PIECE_RE.test(line)){
        // Parece uma tentativa de peça que não bateu com o padrão esperado.
        pushDiscarded(line);
        return;
      }

      var headerCategory = classifyHeaderLine(line);
      if(headerCategory === 'complemento'){
        currentComplemento = line;
        currentFuncao = '';
      } else if(headerCategory === 'funcao'){
        currentFuncao = line;
      }
      // headerCategory === 'unknown': linha não reconhecida, ignorada em
      // silêncio (não é peça, não é ambiente/função conhecidos).
    });

    pendingFitamento.forEach(function(entry){ entry.fitaType = entry.fitaType || 'none-explicit'; });
    pieces.forEach(finalizePiece);

    return { pieces: pieces, discarded: discarded, materialMentioned: materialMentioned };
  }

  // ===========================================================================
  // Resgate de uma linha editada na lista de conferência
  // ===========================================================================

  /**
   * Tenta reinterpretar uma única linha (já editada pelo usuário na lista de
   * conferência) usando o contexto que estava em vigor quando ela foi
   * descartada. Diferente de analyzeText, resolve tudo imediatamente — não
   * há "pendências" para uma única linha isolada.
   *
   * @param {string} line   texto (possivelmente corrigido) da linha
   * @param {object} ctx    contexto capturado no momento em que foi descartada
   * @param {function} nextId  função que devolve um novo id único
   * @returns {(object|null)} a peça pronta, ou null se ainda não for possível interpretar
   */
  function quickParseLine(line, ctx, nextId){
    line = normalizeTypos(stripWhatsAppFormatting(line.trim()));
    if(!line) return null;

    var match = tryMatchPieceLine(line);
    if(!match) return null;

    var comprimento = toNumber(match.dimensionMatch[1]);
    var largura = toNumber(match.dimensionMatch[3]);
    if(!isValidPiece(comprimento, largura, match.qty)) return null;
    if(SUSPICIOUS_ADJACENT_RE.test(match.rawSuffix) || MULTIPLE_PIECES_RE.test(match.rawSuffix)) return null;

    var built = buildPieceFromMatch(match.qty, match.prefix, match.dimensionMatch, match.suffix, ctx);
    built.piece.id = nextId();
    finalizePiece(built.piece);
    return built.piece;
  }

  // ===========================================================================
  // API pública
  // ===========================================================================

  global.CutListParser = {
    toNumber: toNumber,
    analyzeText: analyzeText,
    quickParseLine: quickParseLine,
    convertPieceToMm: convertPieceToMm
  };

})(window);
