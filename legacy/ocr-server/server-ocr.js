/**
 * server-ocr.js
 * ---------------------------------------------------------------------------
 * Servidor local de OCR para o Gerador de Lista de Corte.
 *
 * O que ele faz: recebe uma foto (enviada pelo botão "Enviar foto" do
 * sistema principal), chama o Tesseract instalado no computador, e devolve
 * o texto reconhecido. Só isso — toda a interpretação da lista de peças
 * continua acontecendo no navegador (js/parser.js e js/vision.js).
 *
 * Como rodar:
 *   node server-ocr.js
 *
 * Não precisa de "npm install" — usa só módulos nativos do Node.js.
 * Precisa do Tesseract instalado separadamente (ver LEIA-ME.md).
 *
 * Fica escutando em http://localhost:5175 — só aceita conexões do próprio
 * computador (127.0.0.1), nunca da rede/internet.
 * ---------------------------------------------------------------------------
 */
'use strict';

var http = require('http');
var { execFile } = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

var PORT = 5175;
var TESSERACT_LANG = 'por';

// Caminho padrão do instalador do Tesseract para Windows (UB-Mannheim).
// Se não existir nesse caminho, tenta chamar só "tesseract" (funciona se
// você marcou a opção de adicionar ao PATH durante a instalação).
var DEFAULT_TESSERACT_PATH = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
var TESSERACT_PATH = fs.existsSync(DEFAULT_TESSERACT_PATH) ? DEFAULT_TESSERACT_PATH : 'tesseract';

function setCorsHeaders(res){
  // Precisa aceitar de origem "null" porque o sistema principal é aberto
  // como arquivo local (file://), não por um endereço http://.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, payload){
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

/** Roda o Tesseract sobre um arquivo de imagem e devolve o texto reconhecido. */
function runTesseract(imagePath, callback){
  var outputBase = imagePath.replace(/\.[^.]+$/, ''); // o tesseract adiciona ".txt" sozinho
  execFile(TESSERACT_PATH, [imagePath, outputBase, '-l', TESSERACT_LANG], function(error){
    if(error){
      if(error.code === 'ENOENT'){
        return callback(new Error('Tesseract não encontrado em "' + TESSERACT_PATH + '". Confira se está instalado e se o caminho no topo deste arquivo está correto.'));
      }
      return callback(error);
    }
    fs.readFile(outputBase + '.txt', 'utf8', function(readErr, text){
      fs.unlink(outputBase + '.txt', function(){});
      if(readErr) return callback(readErr);
      callback(null, text);
    });
  });
}

function handleOcrRequest(req, res){
  var body = '';
  req.on('data', function(chunk){ body += chunk; });
  req.on('end', function(){
    var payload;
    try {
      payload = JSON.parse(body);
    } catch(e){
      return sendJson(res, 400, { error: 'JSON inválido no corpo da requisição.' });
    }

    var base64Data = (payload.image || '').replace(/^data:image\/\w+;base64,/, '');
    if(!base64Data){
      return sendJson(res, 400, { error: 'Nenhuma imagem recebida.' });
    }

    var tempPath = path.join(os.tmpdir(), 'lista-corte-ocr-' + Date.now() + '.png');
    fs.writeFile(tempPath, Buffer.from(base64Data, 'base64'), function(writeErr){
      if(writeErr){
        return sendJson(res, 500, { error: 'Não consegui salvar a imagem temporária: ' + writeErr.message });
      }

      runTesseract(tempPath, function(ocrErr, text){
        fs.unlink(tempPath, function(){});
        if(ocrErr){
          return sendJson(res, 500, { error: ocrErr.message });
        }
        sendJson(res, 200, { text: text });
      });
    });
  });
}

var server = http.createServer(function(req, res){
  setCorsHeaders(res);

  if(req.method === 'OPTIONS'){
    res.writeHead(204);
    res.end();
    return;
  }

  if(req.method === 'POST' && req.url === '/ocr'){
    handleOcrRequest(req, res);
    return;
  }

  sendJson(res, 404, { error: 'Rota não encontrada.' });
});

server.listen(PORT, '127.0.0.1', function(){
  console.log('Servidor de OCR do Gerador de Lista de Corte rodando em http://localhost:' + PORT);
  console.log('Deixe esta janela aberta enquanto for usar o botão "Enviar foto".');
  console.log('Para fechar, feche esta janela ou pressione Ctrl+C.');
});
