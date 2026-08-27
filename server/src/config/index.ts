import 'dotenv/config';
import { existsSync } from 'node:fs';

/**
 * Caminhos onde o instalador oficial do Tesseract costuma colocar o
 * executável, por sistema operacional. Usado apenas quando TESSERACT_PATH
 * não foi definido no .env — o instalador do Windows (UB-Mannheim) não
 * adiciona ao PATH por padrão, então sem isso o Tesseract "instalado mas
 * não encontrado" seria a experiência padrão em toda máquina Windows nova.
 */
const COMMON_TESSERACT_PATHS = [
  'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
  'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
  '/opt/homebrew/bin/tesseract',
  '/usr/local/bin/tesseract',
  '/usr/bin/tesseract',
];

function detectTesseractPath(): string {
  const found = COMMON_TESSERACT_PATHS.find((path) => existsSync(path));
  return found ?? 'tesseract';
}

interface OcrSpaceConfig {
  apiKey: string | undefined;
  endpoint: string;
}

interface TesseractConfig {
  path: string;
  lang: string;
}

interface OcrFallbackConfig {
  minUsefulChars: number;
}

export interface AppConfig {
  port: number;
  clientOrigin: string;
  tesseract: TesseractConfig;
  ocrSpace: OcrSpaceConfig;
  ocrFallback: OcrFallbackConfig;
  bodyLimit: string;
  autoUpdateEnabled: boolean;
}

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config: AppConfig = {
  port: readNumber(process.env['OCR_SERVER_PORT'], 5175),
  clientOrigin: process.env['CLIENT_ORIGIN'] || 'http://localhost:5173',
  tesseract: {
    path: process.env['TESSERACT_PATH'] || detectTesseractPath(),
    lang: process.env['TESSERACT_LANG'] || 'por',
  },
  ocrSpace: {
    apiKey: process.env['OCR_SPACE_API_KEY'] || undefined,
    endpoint: process.env['OCR_SPACE_ENDPOINT'] || 'https://api.ocr.space/parse/image',
  },
  ocrFallback: {
    minUsefulChars: readNumber(process.env['OCR_MIN_USEFUL_CHARS'], 15),
  },
  bodyLimit: process.env['OCR_BODY_LIMIT'] || '15mb',
  // Só desativa se explicitamente "false"/"0" — vale por padrão, mesmo sem
  // a variável definida no .env (instalações já existentes).
  autoUpdateEnabled: !['false', '0'].includes((process.env['AUTO_UPDATE_ENABLED'] || '').toLowerCase()),
};

if (!config.ocrSpace.apiKey) {
  console.warn(
    'Aviso: OCR_SPACE_API_KEY não definida. O fallback via OCR.space ficará desativado; apenas o Tesseract local será usado.',
  );
}
