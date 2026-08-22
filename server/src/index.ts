import { createApp } from './app.js';
import { config } from './config/index.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`Servidor de OCR do Gerador de Lista de Corte rodando em http://localhost:${config.port}`);
});
