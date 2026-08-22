# Gerador de Lista de Corte — CorteCloud

Sistema web local para a **Araújo Madeiras**. Recebe mensagens coladas (WhatsApp, bloco de notas, etc.) com medidas de peças de marcenaria e gera uma lista pronta para colar no [CorteCloud](https://cortecloud.com.br/).

Não precisa de instalação, servidor ou internet — é só abrir o `index.html` num navegador. Funciona bem em qualquer tamanho de tela — no celular, a tabela de peças vira uma lista de cartões (um por peça) em vez de exigir rolagem lateral.

## Como usar

1. Abra `index.html` no navegador
2. Cole a mensagem com as medidas
3. Clique em **Analisar mensagem** — confirme se as medidas já estão em milímetros
4. Confira a tabela de peças identificadas — edite qualquer campo se precisar
5. Clique em **Gerar lista para o CorteCloud**
6. Clique em **Copiar para Excel** e cole direto no CorteCloud

## O que o sistema reconhece automaticamente

- **Material**: blocos de texto contendo "MDF" (cor, espessura, etc.)
- **Peças**: linhas no formato `quantidade=comprimento/largura` (aceita também `x`, `-`, `pç`, `pc`, entre outras variações comuns de digitação)
- **Fitamento**: frases como "fitado um lado maior", "fitado os 4 lados", "não precisa fita", ou fita indicada direto no número (ex: `70 fita x59`)
- **Ambiente/móvel** (ex: "Cozinha", "Guarda-roupa") e **função da peça** (ex: "gaveta", "lateral"), a partir de uma lista de palavras-chave
- **Erros de digitação comuns** (vírgula dupla, ponto duplicado, etc.) — ficam sinalizados na lista de conferência, com uma correção sugerida para você confirmar antes de entrar na lista final
- **Sentido do veio do MDF**: quando a largura de uma peça passa de 1840mm, comprimento e largura são invertidos automaticamente (o veio da chapa sempre acompanha o comprimento), e a fita é remapeada para a mesma borda física. A peça fica destacada em azul na conferência, com uma observação explicando a troca.

Qualquer linha que não se encaixe em nada disso fica de fora silenciosamente, sem virar peça errada.

### Proteções contra erros silenciosos

Além dos formatos já vistos na prática, o parser também está preparado para:

- **Ponto como separador de milhar** — "2.400" é lido como 2400 (não 2,4), seguindo a formatação numérica brasileira. Só se aplica quando há exatamente 3 dígitos depois do ponto; "56.5" continua sendo lido como decimal normalmente.
- **Negrito, itálico ou tachado do WhatsApp** (`*texto*`, `_texto_`, `~texto~`) envolvendo uma linha inteira — a marcação é removida antes de interpretar, então uma peça ou um cabeçalho de material destacado continuam funcionando normalmente.
- **Duas ou mais peças na mesma linha** (ex: "2=47/47, 3=50/60") — cada peça é separada e processada individualmente. Se qualquer uma das peças não puder ser interpretada com confiança, a linha inteira vai para a lista de conferência (em vez de registrar parte errada ou perder informação em silêncio).
- **Variações de marcador de quantidade** — além de "pç"/"pc"/"-"/"=", também reconhece "un", "und", "unid", "unidade".

**Limitação conhecida e proposital:** espaço como separador de milhar (ex: "1 200" para 1200) não é tratado, porque o mesmo padrão — número, espaço, número — é usado o tempo todo para separar quantidade de medida (ex: "2 pç 400 x 60"). Tratar espaço como milhar de forma ampla quebraria esse uso comum sempre que a medida tivesse exatamente 3 dígitos. Se esse formato aparecer na prática, o ideal é revisar caso a caso.

## Enviar foto (opcional)

Além de colar texto, também é possível enviar uma ou **várias fotos** de
uma vez de listas de peças **impressas ou digitais** (não funciona com
letra de mão) — o botão **Enviar foto** manda cada imagem para um pequeno
servidor de OCR rodando no próprio computador, que lê o texto da tabela e
devolve já reorganizado no formato que o sistema entende, deixando na
caixa de mensagem para revisão antes de analisar.

Ao enviar fotos, o sistema pergunta o **material de cada uma** (com uma
pré-visualização da imagem para você confirmar qual é qual) — assim peças
de materiais diferentes, mesmo vindo de fotos separadas, ficam
corretamente identificadas. Na primeira foto, informar o material é
obrigatório; a partir da segunda, também aparece a opção **"Herdar
material anterior"**, para quando várias fotos forem do mesmo material.

Dois formatos de tabela são reconhecidos:
- Tabela com colunas separadas (#, Compr., Largura, Quant., Rotação, Nome, PA)
- Coluna única "Peças" no formato `comprimento X largura - quantidade`
  (ex: "1900 X 350 - 2") — esse formato não carrega fitamento (que na
  imagem é indicado por sublinhado, uma informação visual que se perde na
  leitura de texto); a fita fica em branco para ser marcada manualmente
  na tabela de conferência.

Diferente de uma API paga, esse servidor roda 100% local — sem custo, sem
internet, sem chave de nenhum tipo. Em compensação, precisa ser configurado
uma vez e mantido rodando; veja o passo a passo completo em
[`ocr-server/LEIA-ME.md`](ocr-server/LEIA-ME.md).

Sem essa configuração, o botão "Enviar foto" simplesmente mostra uma
mensagem avisando que o servidor não está disponível — o resto do sistema
(colar texto) continua funcionando normalmente.

**Sempre revise o texto reconhecido antes de clicar em "Analisar mensagem"**
— OCR pode errar números, e um comprimento ou largura errado só é
percebido nessa revisão. Isso importa especialmente para fotos com letra
pequena ou muitas linhas/checkboxes disputando espaço com os números —
nesses casos, fotografar mais de perto (focando só na coluna de medidas)
tende a melhorar bastante a leitura.

## Ícone personalizado (atalho na área de trabalho)

Arquivos `.html` sempre mostram o ícone do navegador associado — não dá
pra mudar isso no próprio arquivo. Mas dá pra ter um ícone personalizado
criando um **atalho** pro `index.html` e aplicando o ícone nesse atalho:

1. Clique com o botão direito no `index.html` → **Criar atalho**
2. Coloque esse atalho na área de trabalho (ou onde preferir)
3. Clique com o botão direito no atalho → **Propriedades**
4. Na aba "Atalho", clique em **Alterar Ícone...**
5. Clique em **Procurar** e selecione o arquivo `assets/icone.ico` (dentro
   da pasta do projeto)
6. **OK** → **Aplicar**

O ícone (`assets/icone.ico`) já vem pronto no projeto, em várias
resoluções — não precisa criar nada, só apontar pra ele nesse passo 5.

## Estrutura do projeto

```
gerador-lista-corte/
├── index.html       → estrutura da página
├── assets/
│   ├── icone.ico     → ícone para usar num atalho (área de trabalho)
│   └── favicon.png   → ícone exibido na aba do navegador
├── css/
│   └── style.css    → estilos, organizados por seção
├── js/
│   ├── parser.js     → motor de interpretação de texto (puro, sem DOM)
│   ├── app.js        → estado da tela, renderização e eventos
│   └── vision.js     → envia fotos ao servidor de OCR local (opcional)
├── ocr-server/
│   ├── server-ocr.js              → servidor local de OCR (Node, sem dependências)
│   ├── iniciar-servidor-oculto.vbs → liga o servidor sem abrir janela
│   └── LEIA-ME.md                 → passo a passo de instalação (Windows)
└── README.md
```

`parser.js` não depende do navegador — ele só recebe texto e devolve dados
(`CutListParser.analyzeText(...)`). Isso facilita testar a lógica de
interpretação isoladamente (inclusive fora do navegador, com Node) sem
precisar simular clique em botão ou preenchimento de formulário.

`app.js` cuida só da tela: chama o `parser.js`, guarda o estado atual
(peças, itens em conferência) e liga os botões.

`vision.js` só sabe conversar com o servidor de OCR local e reorganizar o
texto que ele devolve — nenhuma interpretação de fita/material/ambiente
acontece aqui, isso é sempre trabalho do `parser.js`.

O sistema principal continua sem dependências externas, sem build, sem
`node_modules` — apenas HTML, CSS e JavaScript puro (vanilla). Só o
`ocr-server` (opcional) usa Node.js diretamente, e mesmo assim sem
nenhuma biblioteca de terceiros.

## Desenvolvido por

Diego Grizzi
