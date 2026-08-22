/**
 * app.js
 * ---------------------------------------------------------------------------
 * Camada de interface: estado da tela, renderização das tabelas e ligação
 * dos botões/eventos. Toda a interpretação de texto fica em parser.js
 * (exposto aqui como `CutListParser`) — este arquivo não faz nenhum parsing,
 * só chama o parser e mostra o resultado.
 * ---------------------------------------------------------------------------
 */
(function(){
  'use strict';

  var Parser = window.CutListParser;

  // ===========================================================================
  // Estado da aplicação
  // ===========================================================================

  /** Peças atualmente na tabela de conferência (editáveis pelo usuário). */
  var pieces = [];

  /** Linhas que não puderam ser interpretadas como peça, aguardando correção. */
  var discardedItems = [];

  /** Contador simples para dar um id único a cada peça criada na sessão. */
  var idCounter = 0;
  function nextId(){ return 'p' + (idCounter++); }

  /** Se o usuário já foi perguntado sobre o material nesta mensagem (confirmado ou pulado). */
  var materialAsked = false;

  /** Material informado manualmente pelo usuário via pop-up, aplicado a peças sem material. */
  var materialFallback = '';

  /** Se a pergunta "já está em mm?" já foi respondida nesta mensagem. */
  var mmAsked = false;

  /** Fator de conversão confirmado (1 = já em mm, 10 = cm→mm, 1000 = m→mm). */
  var mmFactor = 1;

  /**
   * Peça resgatada da conferência enquanto a pergunta de mm ainda não
   * tinha sido feita (só acontece se a primeira peça válida da sessão vier
   * de um resgate, não da análise inicial) — fica guardada aqui até o
   * modal de mm ser respondido, para então ser convertida e adicionada.
   */
  var pendingRescuedPiece = null;

  // ===========================================================================
  // Utilidades de DOM
  // ===========================================================================

  function el(id){ return document.getElementById(id); }

  /** Escapa texto para uso seguro dentro de HTML (conteúdo ou atributos). */
  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g, function(char){
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  // ===========================================================================
  // Regras de material ausente
  // ===========================================================================

  /** Verdadeiro quando o material está vazio, ou é só a espessura sem nome ("15mm"). */
  function looksLikeNoMaterial(material){
    return !material || /^\d+(?:[.,]\d+)?mm$/i.test(material);
  }

  /** Aplica o material informado pelo usuário a uma peça que ainda não tem um. */
  function applyMaterialFallback(piece){
    if(materialFallback && looksLikeNoMaterial(piece.material)){
      piece.material = piece.material ? (materialFallback + ' ' + piece.material) : materialFallback;
    }
  }

  // ===========================================================================
  // Renderização — tabela de conferência (peças identificadas)
  // ===========================================================================

  function renderPreview(){
    el('pv-count').textContent = pieces.length;
    var body = el('pv-body');
    body.innerHTML = '';

    pieces.forEach(function(piece, index){
      var row = document.createElement('tr');
      row.className = piece.wasInverted ? 'inverted' : (piece.isOverride ? 'override' : '');
      row.dataset.id = piece.id;
      row.innerHTML = renderPieceRow(piece, index + 1);
      body.appendChild(row);
    });

    el('preview-card').classList.remove('hidden');
  }

  /** Monta as células editáveis de uma linha da tabela de conferência. */
  function renderPieceRow(piece, displayNumber){
    var notes = [];
    if(piece.note) notes.push(piece.note);
    if(piece.wasInverted) notes.push('comprimento/largura invertidos (fitamento ajustado)');

    return (
      '<td class="note-tag" data-label="#">' + displayNumber + '</td>' +
      '<td data-label="Qtd"><input type="text" data-field="qtd" class="col-qty" value="' + piece.qtd + '"></td>' +
      '<td data-label="Compr."><input type="text" data-field="compr" class="col-dim" value="' + piece.compr + '"></td>' +
      '<td data-label="Larg."><input type="text" data-field="larg" class="col-dim" value="' + piece.larg + '"></td>' +
      '<td data-label="Função"><input type="text" data-field="funcao" class="col-funcao" value="' + escapeHtml(piece.funcao) + '"></td>' +
      '<td class="check-cell" data-label="C1"><input type="checkbox" data-field="c1" ' + (piece.fita.c1 ? 'checked' : '') + '></td>' +
      '<td class="check-cell" data-label="C2"><input type="checkbox" data-field="c2" ' + (piece.fita.c2 ? 'checked' : '') + '></td>' +
      '<td class="check-cell" data-label="L1"><input type="checkbox" data-field="l1" ' + (piece.fita.l1 ? 'checked' : '') + '></td>' +
      '<td class="check-cell" data-label="L2"><input type="checkbox" data-field="l2" ' + (piece.fita.l2 ? 'checked' : '') + '></td>' +
      '<td class="mat-cell" data-label="Material"><input type="text" data-field="material" value="' + escapeHtml(piece.material) + '"></td>' +
      '<td class="mat-cell" data-label="Compl."><input type="text" data-field="complemento" value="' + escapeHtml(piece.complemento) + '"></td>' +
      '<td class="note-tag obs-cell" data-label="Obs.">' + (notes.length ? escapeHtml(notes.join(' — ')) : '') + '</td>' +
      '<td data-label=""><button class="danger-ghost" data-action="remove">remover</button></td>'
    );
  }

  // ===========================================================================
  // Renderização — lista de conferência (linhas não interpretadas)
  // ===========================================================================

  function renderDiscarded(){
    var box = el('discard-box');

    if(discardedItems.length === 0){
      box.innerHTML = 'Nenhuma linha descartada.';
      return;
    }

    var html = '<strong>Linhas descartadas (' + discardedItems.length + '):</strong>' +
      '<p class="discard-hint">Parecem ter medidas, mas não consegui interpretar. Confira e tente novamente.</p>';

    discardedItems.forEach(function(item, index){
      html += renderDiscardedItem(item, index);
    });

    box.innerHTML = html;
  }

  /** Monta um item editável da lista de conferência, com sugestão de correção quando houver. */
  function renderDiscardedItem(item, index){
    var prefillValue = item.suggested || item.text;
    var html = '<div class="discard-item" data-idx="' + index + '">';

    if(item.suggested){
      html += '<p class="discard-suggestion">Original: <span class="mono">' + escapeHtml(item.text) +
        '</span> — parece um erro de digitação. Confirme a correção abaixo:</p>';
    }

    html +=
      '<div class="discard-item-row">' +
        '<input type="text" class="discard-edit" value="' + escapeHtml(prefillValue) + '">' +
        '<button class="ghost" data-action="retry">Tentar novamente</button>' +
      '</div>' +
      '<div class="discard-error"></div>' +
      '</div>';

    return html;
  }

  // ===========================================================================
  // Renderização — lista final pronta para o CorteCloud
  // ===========================================================================

  var RESULT_COLUMNS = ['Quantidade', 'Comprimento', 'Largura', 'Função', 'Fita C1', 'Fita C2', 'Fita L1', 'Fita L2', 'Material', 'Complemento'];

  /**
   * Gera a tabela final. As medidas já chegam aqui em milímetros — a
   * conversão de unidade acontece antes, logo depois de "Analisar
   * mensagem" (ver handleMmAnswered), não nesta etapa.
   */
  function renderResult(){
    el('result-head').innerHTML = RESULT_COLUMNS.map(function(header){ return '<th>' + header + '</th>'; }).join('');

    var body = el('result-body');
    body.innerHTML = '';
    pieces.forEach(function(piece){
      var row = document.createElement('tr');
      var cells = [
        piece.qtd,
        piece.compr,
        piece.larg,
        piece.funcao,
        piece.fita.c1 ? 'X' : '',
        piece.fita.c2 ? 'X' : '',
        piece.fita.l1 ? 'X' : '',
        piece.fita.l2 ? 'X' : '',
        piece.material,
        piece.complemento
      ];
      row.innerHTML = cells.map(function(cell, i){
        return '<td data-label="' + RESULT_COLUMNS[i] + '">' + escapeHtml(cell) + '</td>';
      }).join('');
      body.appendChild(row);
    });

    el('result-card').classList.remove('hidden');
    el('result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Lê a tabela final já renderizada e copia como texto separado por tabulação (sem cabeçalho). */
  function copyResultToClipboard(){
    var rows = [];
    el('result-body').querySelectorAll('tr').forEach(function(tr){
      var row = [];
      tr.querySelectorAll('td').forEach(function(td){ row.push(td.textContent); });
      rows.push(row);
    });

    var tsv = rows.map(function(row){ return row.join('\t'); }).join('\n');

    var textarea = document.createElement('textarea');
    textarea.value = tsv;
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); } catch(err) { /* navegador sem suporte a execCommand */ }
    document.body.removeChild(textarea);

    var feedback = el('copy-feedback');
    feedback.style.display = 'inline';
    setTimeout(function(){ feedback.style.display = 'none'; }, 2200);
  }

  // ===========================================================================
  // Fluxo: modal de erro/validação (substitui alert() do navegador)
  // ===========================================================================

  function showErrorModal(message){
    el('error-modal-message').textContent = message;
    el('error-modal-wrap').classList.add('open');
  }

  function closeErrorModal(){
    el('error-modal-wrap').classList.remove('open');
  }

  // ===========================================================================
  // Fluxo: pergunta "já está em mm?" (logo após analisar, antes de conferir)
  // ===========================================================================

  function openMmModal(){
    el('mm-modal-step1').classList.remove('hidden');
    el('mm-modal-step2').classList.add('hidden');
    el('mm-modal-wrap').classList.add('open');
  }

  function closeMmModal(){
    el('mm-modal-wrap').classList.remove('open');
  }

  /**
   * Aplica a conversão de unidade a todas as peças atuais (e à peça
   * pendente de resgate, se houver), depois disso já com a medida real em
   * mm, segue para a checagem de material / conferência de peças.
   */
  function handleMmAnswered(factor){
    mmAsked = true;
    mmFactor = factor;
    closeMmModal();

    pieces.forEach(function(piece){ Parser.convertPieceToMm(piece, factor); });

    if(pendingRescuedPiece){
      var rescued = pendingRescuedPiece;
      pendingRescuedPiece = null;
      Parser.convertPieceToMm(rescued, factor);
      applyMaterialFallback(rescued);
      pieces.push(rescued);
    }

    if(!materialAsked && pieces.length > 0){
      openMaterialModal();
    } else {
      renderPreview();
    }
  }

  // ===========================================================================
  // Fluxo: analisar mensagem
  // ===========================================================================

  function handleAnalyze(){
    var text = el('raw-text').value;

    if(!text.trim()){
      showErrorModal('Cole a mensagem com as medidas antes de clicar em "Analisar mensagem".');
      return;
    }

    var result = Parser.analyzeText(text, nextId);

    if(result.pieces.length === 0 && result.discarded.length === 0){
      showErrorModal('Não encontrei nenhuma peça nessa mensagem. Confira se o texto colado está no formato esperado.');
      return;
    }

    pieces = result.pieces;
    discardedItems = result.discarded;
    renderDiscarded();

    materialAsked = result.materialMentioned;
    materialFallback = '';
    mmAsked = false;
    mmFactor = 1;
    pendingRescuedPiece = null;

    if(pieces.length > 0){
      openMmModal();
    } else {
      renderPreview();
    }
  }

  function handleClearInput(){
    el('raw-text').value = '';
    el('preview-card').classList.add('hidden');
    el('result-card').classList.add('hidden');
    pieces = [];
    discardedItems = [];
    materialAsked = false;
    materialFallback = '';
    mmAsked = false;
    mmFactor = 1;
    pendingRescuedPiece = null;
    el('discard-box').innerHTML = '';
  }

  // ===========================================================================
  // Fluxo: pop-up de material ausente
  // ===========================================================================

  function openMaterialModal(){
    el('material-input').value = '';
    el('material-modal-wrap').classList.add('open');
  }

  function closeMaterialModal(){
    el('material-modal-wrap').classList.remove('open');
  }

  function handleMaterialConfirm(){
    var material = el('material-input').value.trim();
    if(material){
      materialFallback = material;
      pieces.forEach(applyMaterialFallback);
    }
    materialAsked = true;
    closeMaterialModal();
    renderPreview();
  }

  function handleMaterialSkip(){
    materialAsked = true;
    closeMaterialModal();
    renderPreview();
  }

  // ===========================================================================
  // Fluxo: lista de conferência (editar e tentar novamente)
  // ===========================================================================

  function handleDiscardRetry(target){
    var itemDiv = target.closest('.discard-item');
    var index = parseInt(itemDiv.dataset.idx, 10);
    var item = discardedItems[index];
    var input = itemDiv.querySelector('.discard-edit');
    var errorBox = itemDiv.querySelector('.discard-error');

    var rescued = Parser.quickParseLine(input.value, item.context, nextId);

    if(!rescued){
      errorBox.textContent = 'Ainda não consegui interpretar esta linha. Confira o formato (ex: 2=25,2x30,5).';
      errorBox.style.display = 'block';
      return;
    }

    discardedItems.splice(index, 1);
    renderDiscarded();

    if(!mmAsked){
      // Essa é a primeira peça válida da sessão (a análise inicial não
      // tinha nenhuma) — pergunta sobre mm antes de finalizar, do mesmo
      // jeito que faria logo após "Analisar mensagem".
      pendingRescuedPiece = rescued;
      openMmModal();
      return;
    }

    Parser.convertPieceToMm(rescued, mmFactor);
    applyMaterialFallback(rescued);
    pieces.push(rescued);
    renderPreview();

    if(!materialAsked && looksLikeNoMaterial(rescued.material)){
      openMaterialModal();
    }
  }

  // ===========================================================================
  // Fluxo: tabela de conferência (editar campos e remover peça)
  // ===========================================================================

  var EDITABLE_FITA_FIELDS = ['c1', 'c2', 'l1', 'l2'];

  function handlePieceFieldEdit(target){
    var row = target.closest('tr');
    if(!row) return;
    var piece = pieces.find(function(p){ return p.id === row.dataset.id; });
    if(!piece) return;

    var field = target.dataset.field;
    if(!field) return;

    if(field === 'qtd') piece.qtd = parseInt(target.value, 10) || 0;
    else if(field === 'compr') piece.compr = Parser.toNumber(target.value) || 0;
    else if(field === 'larg') piece.larg = Parser.toNumber(target.value) || 0;
    else if(field === 'material') piece.material = target.value;
    else if(field === 'complemento') piece.complemento = target.value;
    else if(field === 'funcao') piece.funcao = target.value;
    else if(EDITABLE_FITA_FIELDS.indexOf(field) !== -1) piece.fita[field] = target.checked;
  }

  function handlePieceRemove(target){
    var row = target.closest('tr');
    pieces = pieces.filter(function(p){ return p.id !== row.dataset.id; });
    renderPreview();
  }

  // ===========================================================================
  // Fluxo: gerar lista final (perguntar mm e converter)
  // ===========================================================================

  function handleGenerateClick(){
    if(pieces.length === 0){
      showErrorModal('Adicione ao menos uma peça antes de gerar a lista.');
      return;
    }
    renderResult();
  }

  function handleNewList(){
    el('raw-text').value = '';
    pieces = [];
    discardedItems = [];
    materialAsked = false;
    materialFallback = '';
    mmAsked = false;
    mmFactor = 1;
    pendingRescuedPiece = null;
    el('discard-box').innerHTML = '';
    el('preview-card').classList.add('hidden');
    el('result-card').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ===========================================================================
  // Ligação dos eventos (executada uma única vez, ao carregar a página)
  // ===========================================================================

  function init(){
    el('btn-analyze').addEventListener('click', handleAnalyze);
    el('btn-clear-input').addEventListener('click', handleClearInput);
    el('btn-new-list').addEventListener('click', handleNewList);

    el('btn-material-confirm').addEventListener('click', handleMaterialConfirm);
    el('btn-material-skip').addEventListener('click', handleMaterialSkip);

    el('btn-error-modal-close').addEventListener('click', closeErrorModal);

    el('btn-generate').addEventListener('click', handleGenerateClick);
    el('btn-mm-sim').addEventListener('click', function(){ handleMmAnswered(1); });
    el('btn-mm-nao').addEventListener('click', function(){
      el('mm-modal-step1').classList.add('hidden');
      el('mm-modal-step2').classList.remove('hidden');
    });
    el('btn-convert').addEventListener('click', function(){
      handleMmAnswered(parseFloat(el('unit-select').value));
    });

    el('btn-copy').addEventListener('click', copyResultToClipboard);

    // Eventos delegados: os elementos filhos são recriados a cada
    // renderização, então os listeners ficam nos contêineres estáveis.
    el('discard-box').addEventListener('click', function(e){
      if(e.target.dataset.action === 'retry') handleDiscardRetry(e.target);
    });
    el('pv-body').addEventListener('input', function(e){ handlePieceFieldEdit(e.target); });
    el('pv-body').addEventListener('click', function(e){
      if(e.target.dataset.action === 'remove') handlePieceRemove(e.target);
    });
  }

  init();
})();
