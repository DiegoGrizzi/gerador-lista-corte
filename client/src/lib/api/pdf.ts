/**
 * pdf.ts
 * ---------------------------------------------------------------------------
 * Cliente HTTP para POST /api/pdf (@corte-cloud/server) — mesmo padrão de
 * tratamento de erro do `requestOcr` (ver ocr.ts): erro de rede vira uma
 * mensagem amigável, resposta não-ok surfaça a mensagem `{ error }` do
 * servidor. Texto vazio de volta NÃO é tratado como falha aqui (diferente do
 * OCR de foto): um PDF sem nenhuma página de "Lista de Cortes" reconhecível
 * (ex: só desenhos) é um resultado válido, tratado pelo chamador.
 * ---------------------------------------------------------------------------
 */

export interface PdfResponse {
  text: string;
}

interface PdfErrorBody {
  error?: string;
}

export async function requestPdfText(base64Pdf: string): Promise<PdfResponse> {
  let response: Response;
  try {
    response = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf: base64Pdf }),
    });
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('Não consegui falar com o servidor. Confira se ele está rodando.');
    }
    throw err;
  }

  if (!response.ok) {
    const body: PdfErrorBody = await response.json().catch(() => ({}) as PdfErrorBody);
    throw new Error(body.error || 'O servidor respondeu com erro ao processar o PDF (código ' + response.status + ').');
  }

  return (await response.json()) as PdfResponse;
}
