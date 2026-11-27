import { describe, expect, it } from 'vitest';

import { getPastedFiles } from './pasted-files.js';

function clipboard(text: string, files: File[]) {
  return { files, getData: (format: string) => (format === 'text/plain' ? text : '') };
}

const pdf = new File(['%PDF'], 'plano.pdf', { type: 'application/pdf' });
const png = new File(['x'], 'print.png', { type: 'image/png' });

describe('getPastedFiles', () => {
  it('pega o PDF copiado no Explorador de Arquivos', () => {
    expect(getPastedFiles(clipboard('', [pdf]))).toEqual({ pdfs: [pdf], images: [] });
  });

  it('pega um print da tela como foto', () => {
    expect(getPastedFiles(clipboard('', [png]))).toEqual({ pdfs: [], images: [png] });
  });

  it('reconhece o PDF pelo nome quando o tipo vem vazio', () => {
    const semTipo = new File(['%PDF'], 'LISTA.PDF', { type: '' });

    expect(getPastedFiles(clipboard('', [semTipo]))?.pdfs).toEqual([semTipo]);
  });

  it('separa vários arquivos colados de uma vez', () => {
    expect(getPastedFiles(clipboard('', [pdf, png]))).toEqual({ pdfs: [pdf], images: [png] });
  });

  it('deixa passar a colagem de texto: copiar do Excel traz texto e uma imagem da tabela', () => {
    expect(getPastedFiles(clipboard('2\t380\t370', [png]))).toBeNull();
  });

  it('ignora arquivo que não é PDF nem imagem', () => {
    const zip = new File(['x'], 'lista.zip', { type: 'application/zip' });

    expect(getPastedFiles(clipboard('', [zip]))).toBeNull();
  });

  it('devolve null sem arquivo nenhum', () => {
    expect(getPastedFiles(clipboard('', []))).toBeNull();
    expect(getPastedFiles(null)).toBeNull();
  });
});
