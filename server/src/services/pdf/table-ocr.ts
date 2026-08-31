/**
 * table-ocr.ts
 * ---------------------------------------------------------------------------
 * OCR de uma imagem de página com a posição de cada palavra reconhecida
 * (modo TSV do Tesseract) — usado para reconstruir a estrutura de uma
 * tabela (ver table-reconstruct.ts). O texto corrido sozinho (ver
 * ../ocr/tesseract-provider.ts, usado para fotos) não basta aqui: a ordem
 * de leitura escolhida pelo Tesseract pode separar uma coluna do resto da
 * linha em tabelas largas (confirmado testando com um PDF real).
 *
 * Aceita o modo de segmentação de página (--psm) como parâmetro, em vez de
 * fixar um só — testado de verdade: nem o automático (psm 3) nem "assume
 * um único bloco de texto" (psm 6) vencem sempre um contra o outro. Em
 * páginas normais, psm 3 costuma ler o cabeçalho da tabela corretamente;
 * em cabeçalhos com fundo colorido (visto num PDF real), só psm 6
 * reconhecia o texto. Só psm 6, sozinho, também já se mostrou instável de
 * um jeito inesperado (mesmo arquivo, mesmo comando, resultado diferente
 * em execuções diferentes - possivelmente relacionado a aceleração
 * SIMD/AVX2 do motor LSTM do Tesseract nessa máquina). Por isso
 * pdf-table-extractor.ts tenta psm 3 primeiro e só cai para psm 6 se a
 * primeira tentativa não reconhecer uma tabela.
 * ---------------------------------------------------------------------------
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';

import { cleanupTempFile } from '../temp-file.js';
import type { OcrWord } from './table-reconstruct.js';

function runTesseractCli(tesseractPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(tesseractPath, args, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

const ROTATE_DEGREES_RE = /Rotate:\s*(\d+)/;
const VALID_ROTATIONS = new Set([0, 90, 180, 270]);

/**
 * Detecta se a página está rotacionada (comum em tabelas exportadas em
 * orientação paisagem dentro de uma página retrato — confirmado com um PDF
 * real) usando o modo de detecção de orientação do Tesseract. Devolve os
 * graus a rotacionar para corrigir (0, 90, 180 ou 270) — 0 se não
 * conseguir detectar ou se a página já estiver na orientação correta.
 */
export async function detectRotation(tesseractPath: string, imagePath: string): Promise<number> {
  try {
    const stdout = await runTesseractCli(tesseractPath, [imagePath, 'stdout', '--psm', '0']);
    const match = stdout.match(ROTATE_DEGREES_RE);
    if (!match) return 0;
    const degrees = Number(match[1]);
    return VALID_ROTATIONS.has(degrees) ? degrees : 0;
  } catch {
    // Não deu pra detectar (ex: página sem texto nenhum ainda) - assume
    // que já está na orientação correta, sem travar o resto do fluxo.
    return 0;
  }
}

/** Lê as palavras (nível 5 = "palavra", ver documentação do Tesseract) de uma saída TSV. */
function parseWordsFromTsv(tsv: string): OcrWord[] {
  const words: OcrWord[] = [];
  const lines = tsv.split('\n');
  for (const line of lines.slice(1)) {
    const cells = line.split('\t');
    if (cells.length < 12) continue;
    if (cells[0] !== '5') continue;
    const text = cells.slice(11).join('\t').trim();
    if (!text) continue;
    words.push({
      text,
      left: Number(cells[6]),
      top: Number(cells[7]),
      width: Number(cells[8]),
      height: Number(cells[9]),
    });
  }
  return words;
}

/**
 * Roda o Tesseract em modo TSV (posição de cada palavra) numa imagem já
 * salva em disco, com o modo de segmentação de página (--psm) indicado.
 */
export async function recognizeWords(tesseractPath: string, lang: string, imagePath: string, psm: number): Promise<OcrWord[]> {
  const outputBase = `${imagePath.replace(/\.[^.]+$/, '')}-psm${psm}`;
  const outputTsvPath = `${outputBase}.tsv`;
  try {
    await runTesseractCli(tesseractPath, [imagePath, outputBase, '-l', lang, '--psm', String(psm), 'tsv']);
    const tsv = await fs.readFile(outputTsvPath, 'utf8');
    return parseWordsFromTsv(tsv);
  } finally {
    await cleanupTempFile(outputTsvPath);
  }
}
