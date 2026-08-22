/**
 * ocr.ts
 * ---------------------------------------------------------------------------
 * Cliente HTTP para POST /api/ocr (@corte-cloud/server). Mesma lógica de
 * tratamento de erro do `requestOcr` do vision.js legado: erro de rede
 * (fetch nem conecta) vira uma mensagem amigável, resposta não-ok surfaça a
 * mensagem `{ error }` do servidor, e texto vazio de volta também é tratado
 * como falha. Usa caminho relativo ('/api/ocr') — em dev o proxy do Vite
 * (ver vite.config.ts) encaminha para http://localhost:5175, em produção o
 * mesmo host deve servir a rota /api.
 * ---------------------------------------------------------------------------
 */

export interface OcrResponse {
  text: string;
  engine: string;
}

interface OcrErrorBody {
  error?: string;
}

export async function requestOcr(base64Image: string): Promise<OcrResponse> {
  let response: Response;
  try {
    response = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image }),
    });
  } catch (err) {
    if (err instanceof TypeError) {
      // erro de rede típico quando o fetch nem consegue conectar
      throw new Error(
        'Não consegui falar com o servidor de OCR local. Confira se ele está rodando (ver /ocr-server/LEIA-ME.md).',
      );
    }
    throw err;
  }

  if (!response.ok) {
    const body: OcrErrorBody = await response.json().catch(() => ({}) as OcrErrorBody);
    throw new Error(body.error || 'O servidor de OCR respondeu com erro (código ' + response.status + ').');
  }

  const data = (await response.json()) as OcrResponse;
  if (!data.text || !data.text.trim()) {
    throw new Error('Não recebi nenhum texto de volta — tente uma foto com melhor luz/foco.');
  }
  return data;
}
