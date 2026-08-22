/**
 * vision.js
 * ---------------------------------------------------------------------------
 * Transcrição de fotos de listas de peças (tabelas impressas/digitais, sem
 * suporte a letra de mão) usando um Tesseract OCR nativo rodando num
 * servidor local (ver pasta /ocr-server). Este módulo só faz três coisas:
 *
 *   1. Pergunta (opcionalmente) o material de cada foto enviada — útil
 *      quando fotos diferentes são de materiais diferentes.
 *   2. Manda cada imagem para o servidor local e recebe o texto bruto do OCR.
 *   3. Reorganiza esse texto bruto (que vem na ordem das colunas da tabela:
 *      Compr., Largura, Quant., Rotação, Nome, PA) para o formato que o
 *      parser.js já entende: quantidade=comprimento/largura [nome], com um
 *      cabeçalho "MDF <material>" na frente das peças de cada foto (quando
 *      o material foi informado) — o parser.js já sabe separar blocos de
 *      material assim, sem precisar de nenhuma mudança nele.
 *
 * Não faz nenhuma interpretação de fita, ambiente ou função — isso
 * continua sendo trabalho exclusivo do parser.js.
 *
 * Pode receber uma ou várias fotos de uma vez — são processadas uma de
 * cada vez, na ordem selecionada. Precisa do servidor local rodando (ver
 * /ocr-server/LEIA-ME.md). Se ele não estiver ligado, mostra uma mensagem
 * de erro clara — o resto do sistema continua funcionando normalmente sem
 * essa função.
 * ---------------------------------------------------------------------------
 */
(function(){
  'use strict';

  var OCR_SERVER_URL = 'http://localhost:5175/ocr';

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
  var TABLE_ROW_RE = /(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)(?!\s*\d)\s*(?:\S{1,6}\s*)?(.*)$/;

  /**
   * Segundo formato de tabela suportado, na coluna "Peças": cada peça é
   * escrita como "comprimento X largura - quantidade" (ex: "1900 X 350 -
   * 2"). Esse formato não tem fitamento reconhecível por OCR (a fita é
   * indicada por sublinhado na imagem, que se perde na leitura de texto) —
   * a fita fica sempre em branco aqui, para o usuário preencher manualmente
   * na tabela de conferência.
   */
  var PECAS_COLUMN_ROW_RE = /(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/;

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
  var CHECKBOX_ARTIFACT_RE = /[[\]:]/;
  var SHORT_SYMBOL_ARTIFACT_RE = /^[dioIl|0]{1,3}$/i;

  function looksLikeCheckboxArtifact(text){
    return CHECKBOX_ARTIFACT_RE.test(text) || SHORT_SYMBOL_ARTIFACT_RE.test(text);
  }

  /**
   * Converte o texto bruto do OCR (uma linha por linha da tabela) para o
   * formato quantidade=comprimento/largura [nome], uma peça por linha.
   * Tenta os dois formatos de tabela suportados por linha — o segundo só
   * quando o primeiro não bate. Linhas que não batem com nenhum dos dois
   * (cabeçalho da tabela, ruído do OCR) são simplesmente ignoradas.
   */
  function reformatTableText(rawText){
    var pieceLines = [];
    rawText.split('\n').forEach(function(line){
      var match = line.match(TABLE_ROW_RE);
      if(match){
        var comprimento = match[1];
        var largura = match[2];
        var quantidade = match[3];
        var nome = (match[4] || '').trim();
        if(looksLikeCheckboxArtifact(nome)) nome = '';

        var pieceLine = quantidade + '=' + comprimento + '/' + largura;
        if(nome) pieceLine += ' ' + nome;
        pieceLines.push(pieceLine);
        return;
      }

      var pecasMatch = line.match(PECAS_COLUMN_ROW_RE);
      if(pecasMatch){
        pieceLines.push(pecasMatch[3] + '=' + pecasMatch[1] + '/' + pecasMatch[2]);
      }
    });
    return pieceLines.join('\n');
  }

  // ===========================================================================
  // Comunicação com o servidor local
  // ===========================================================================

  function readFileAsBase64(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onerror = function(){ reject(new Error('Não consegui ler o arquivo.')); };
      reader.onload = function(){ resolve(reader.result.split(',')[1]); };
      reader.readAsDataURL(file);
    });
  }

  function requestOcr(base64Image){
    return fetch(OCR_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image })
    }).then(function(response){
      if(!response.ok){
        return response.json().catch(function(){ return {}; }).then(function(body){
          throw new Error(body.error || ('O servidor de OCR respondeu com erro (código ' + response.status + ').'));
        });
      }
      return response.json();
    }).then(function(data){
      if(!data.text || !data.text.trim()){
        throw new Error('Não recebi nenhum texto de volta — tente uma foto com melhor luz/foco.');
      }
      return data.text;
    }).catch(function(err){
      if(err instanceof TypeError){
        // erro de rede típico quando o fetch nem consegue conectar
        throw new Error('Não consegui falar com o servidor de OCR local. Confira se ele está rodando (ver /ocr-server/LEIA-ME.md).');
      }
      throw err;
    });
  }

  // ===========================================================================
  // Ligação com a interface
  // ===========================================================================

  function el(id){ return document.getElementById(id); }

  function setStatus(message, isError){
    var statusEl = el('photo-status');
    statusEl.textContent = message;
    statusEl.className = 'photo-status' + (isError ? ' error' : '');
  }

  /** Lê o arquivo só para gerar uma pré-visualização (data URL), sem enviar nada. */
  function readFileAsDataUrl(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onerror = function(){ reject(new Error('Não consegui ler o arquivo.')); };
      reader.onload = function(){ resolve(reader.result); };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Mostra o modal perguntando o material de uma foto específica (com
   * pré-visualização), e devolve uma Promise que resolve com o material
   * digitado, ou string vazia se o usuário optar por herdar o material da
   * foto anterior (só disponível a partir da 2ª foto — a 1ª sempre exige
   * que o material seja digitado).
   */
  function askMaterialForPhoto(file, index, total){
    return readFileAsDataUrl(file).then(function(dataUrl){
      return new Promise(function(resolve){
        var isFirst = index === 0;

        el('photo-material-preview').src = dataUrl;
        el('photo-material-title').textContent = total > 1
          ? 'Qual o material da foto ' + (index + 1) + ' de ' + total + '?'
          : 'Qual o material dessa foto?';
        el('photo-material-sub').textContent = isFirst
          ? 'Informe o material dessa foto para continuar.'
          : 'Informe o material dessa foto, ou clique em "Herdar material anterior" para usar o mesmo material da foto anterior.';
        el('photo-material-input').value = '';
        el('photo-material-modal-wrap').classList.add('open');

        var confirmBtn = el('btn-photo-material-confirm');
        var inheritBtn = el('btn-photo-material-inherit');
        var input = el('photo-material-input');

        confirmBtn.disabled = true;
        inheritBtn.classList.toggle('hidden', isFirst);

        function updateConfirmState(){
          confirmBtn.disabled = !input.value.trim();
        }

        function finish(material){
          confirmBtn.removeEventListener('click', onConfirm);
          inheritBtn.removeEventListener('click', onInherit);
          input.removeEventListener('input', updateConfirmState);
          el('photo-material-modal-wrap').classList.remove('open');
          resolve(material);
        }
        function onConfirm(){ if(!confirmBtn.disabled) finish(input.value.trim()); }
        function onInherit(){ finish(''); }

        confirmBtn.addEventListener('click', onConfirm);
        inheritBtn.addEventListener('click', onInherit);
        input.addEventListener('input', updateConfirmState);
      });
    });
  }

  /** Monta o cabeçalho "MDF <material>" a partir do que o usuário digitou
   * (sem exigir que ele mesmo escreva "MDF"), ou string vazia se não informado. */
  function buildMaterialHeader(material){
    if(!material) return '';
    var jaComecaComMdf = /^mdf\b/i.test(material);
    return (jaComecaComMdf ? material : 'MDF ' + material) + '\n';
  }

  /** Processa uma lista de fotos em sequência: pergunta o material de cada
   * uma, manda pro OCR, e junta tudo num único texto pra revisão. */
  function handlePhotoFiles(fileList){
    var files = Array.prototype.slice.call(fileList || []);
    if(!files.length) return;

    var blocks = [];
    var hadError = false;

    function processNext(index){
      if(index >= files.length){
        finishAll();
        return;
      }

      askMaterialForPhoto(files[index], index, files.length).then(function(material){
        setStatus('Lendo foto ' + (index + 1) + ' de ' + files.length + '...', false);

        readFileAsBase64(files[index])
          .then(requestOcr)
          .then(function(rawText){
            var reformatted = reformatTableText(rawText);
            if(!reformatted){
              hadError = true;
              setStatus('Não consegui reconhecer peças na foto ' + (index + 1) + ' de ' + files.length + '.', true);
            } else {
              blocks.push(buildMaterialHeader(material) + reformatted);
            }
            processNext(index + 1);
          })
          .catch(function(err){
            hadError = true;
            setStatus('Erro na foto ' + (index + 1) + ' de ' + files.length + ': ' + (err.message || 'falha desconhecida'), true);
            processNext(index + 1);
          });
      });
    }

    function finishAll(){
      if(!blocks.length) return;

      var existing = el('raw-text').value.trim();
      var combined = blocks.join('\n\n');
      el('raw-text').value = existing ? (existing + '\n\n' + combined) : combined;

      if(!hadError){
        setStatus('Transcrito! Confira o texto antes de clicar em "Analisar mensagem".', false);
      }
    }

    processNext(0);
  }

  function init(){
    el('btn-send-photo').addEventListener('click', function(){
      el('photo-input').click();
    });
    el('photo-input').addEventListener('change', function(e){
      handlePhotoFiles(e.target.files);
      e.target.value = ''; // permite selecionar as mesmas fotos de novo depois
    });
  }

  init();
})();
