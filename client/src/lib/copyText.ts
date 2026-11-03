/**
 * Copia um texto para a área de transferência: navigator.clipboard primeiro,
 * e o truque da textarea oculta + execCommand('copy') se a API falhar ou não
 * existir (mesmo caminho de useClipboardCopy). Devolve false se nada funcionou.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // cai para o método antigo
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    // navegador sem suporte a execCommand
  }
  document.body.removeChild(textarea);
  return copied;
}
