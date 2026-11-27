/**
 * Arquivos colados com Ctrl+V: um PDF (ou foto) copiado no Explorador de
 * Arquivos, ou um print da tela. Só vale quando a área de transferência NÃO
 * traz texto: copiar células do Excel traz texto e também uma imagem da
 * tabela, e nesse caso o que importa é o texto (a lista colada de sempre).
 */
export interface PastedFiles {
  pdfs: File[];
  images: File[];
}

interface ClipboardLike {
  files?: ArrayLike<File> | null;
  getData: (format: string) => string;
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || (file.type === '' && /\.pdf$/i.test(file.name));
}

function isImage(file: File): boolean {
  return file.type.startsWith('image/');
}

/** Devolve os PDFs e as fotos colados, ou null quando não há arquivo útil (ou há texto). */
export function getPastedFiles(clipboard: ClipboardLike | null | undefined): PastedFiles | null {
  if (!clipboard) return null;
  if (clipboard.getData('text/plain').trim() !== '') return null;
  const files = Array.from(clipboard.files ?? []);
  const pdfs = files.filter(isPdf);
  const images = files.filter(isImage);
  return pdfs.length + images.length > 0 ? { pdfs, images } : null;
}

/** FileList a partir de uma lista de arquivos: os leitores de upload recebem o mesmo tipo do botão. */
export function toFileList(files: File[]): FileList {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  return transfer.files;
}
