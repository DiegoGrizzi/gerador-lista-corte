import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Grava um buffer de imagem em um arquivo temporário e devolve o caminho.
 * O nome é único por chamada para evitar colisões entre requisições
 * concorrentes.
 */
export async function writeTempImage(imageBuffer: Buffer, extension = '.png'): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `lista-corte-ocr-${Date.now()}-${randomUUID()}${extension}`);
  await fs.writeFile(tempPath, imageBuffer);
  return tempPath;
}

/**
 * Remove um arquivo temporário, ignorando erros (ex.: arquivo já removido).
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignora — o arquivo pode já ter sido removido ou nunca ter sido criado.
  }
}
