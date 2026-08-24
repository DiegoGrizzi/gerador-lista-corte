import { describe, expect, it } from 'vitest';
import { buildMaterialHeader, looksLikeCheckboxArtifact, reformatTableText } from './reformat-table-text.js';

/** Atalho para os testes que só se importam com o texto reformatado, não as contagens. */
function reformat(raw: string): string {
  return reformatTableText(raw).text;
}

describe('reformatTableText', () => {
  it('reconhece o formato de colunas separadas (Compr., Largura, Quant., Rotação, Nome)', () => {
    const raw = ['#  Compr.  Largura  Quant.  Rotação  Nome  PA', '1. 720 400 2 Não Lateral', '2. 900 350 4 Sim Prateleira'].join(
      '\n',
    );

    expect(reformat(raw)).toBe('2=720/400 Lateral\n4=900/350 Prateleira');
  });

  it('descarta a coluna Rotação opcional mesmo sem nome de peça', () => {
    const raw = '7 406 478 6 Não';
    expect(reformat(raw)).toBe('6=406/478');
  });

  it('trata resíduo de checkbox (colchetes, símbolos curtos) como "sem nome"', () => {
    const raw = ['3. 500 300 1 Não [1]', '4. 610 250 2 Sim D'].join('\n');
    expect(reformat(raw)).toBe('1=500/300\n2=610/250');
  });

  it('reconhece o segundo formato de tabela, coluna única "Peças" (comprimento X largura - quantidade)', () => {
    const raw = ['Peças', '1900 X 350 - 2', '800 x 400 - 1'].join('\n');
    expect(reformat(raw)).toBe('2=1900/350\n1=800/400');
  });

  it('reconhece o formato "Peças" mesmo quando o Tesseract engole o "X" (caso real testado)', () => {
    // Confirmado com uma foto real: "1900 X 350 - 2" sai do OCR como
    // "1900 350 - 2" (o "X" sozinho entre dois números desaparece).
    const raw = ['Pecas', '1900 350 - 2', '1600 350 - 1'].join('\n');
    expect(reformat(raw)).toBe('2=1900/350\n1=1600/350');
  });

  it('ignora silenciosamente linhas que não batem com nenhum dos dois formatos', () => {
    const raw = ['Lista de corte', 'Compr. Largura Quant. Rotação Nome PA', ''].join('\n');
    expect(reformat(raw)).toBe('');
  });

  it('tenta o formato de colunas separadas antes do formato "Peças" por linha', () => {
    // Uma linha que bate com os dois formatos deve usar o primeiro.
    const raw = '10 20 30';
    expect(reformat(raw)).toBe('30=10/20');
  });
});

describe('reformatTableText — contagem de candidatas vs. reconhecidas', () => {
  it('candidateLineCount e recognizedLineCount batem quando tudo é reconhecido', () => {
    const raw = ['# Compr. Largura Quant. Rotação Nome PA', '1. 720 400 2 Não', '2. 900 350 4 Sim'].join('\n');
    const result = reformatTableText(raw);
    expect(result.recognizedLineCount).toBe(2);
    expect(result.candidateLineCount).toBe(2);
  });

  it('candidateLineCount fica maior que recognizedLineCount quando uma linha perde um número (caso real testado)', () => {
    // Confirmado com uma foto real: a coluna Quant. da linha 29 saiu como
    // a letra "à" em vez de "2" — sobram só 2 números na linha (nenhum
    // dos dois formatos bate, exige 3), mas ela ainda "parece" ter sido
    // uma peça, o que deve aparecer na contagem de candidatas.
    const raw = [
      '28. 470 485 1 Não',
      '29, 2090 485 à Não',
      '30. 440 485 3 Não',
    ].join('\n');
    const result = reformatTableText(raw);
    expect(result.recognizedLineCount).toBe(2);
    expect(result.candidateLineCount).toBe(3);
  });

  it('cabeçalho e linhas sem 2+ números não contam como candidatas', () => {
    const raw = ['# Compr. Largura Quant. Rotação Nome PA', 'Lista de corte', ''].join('\n');
    const result = reformatTableText(raw);
    expect(result.recognizedLineCount).toBe(0);
    expect(result.candidateLineCount).toBe(0);
  });
});

describe('looksLikeCheckboxArtifact', () => {
  it('detecta colchetes e dois-pontos', () => {
    expect(looksLikeCheckboxArtifact('[1]')).toBe(true);
    expect(looksLikeCheckboxArtifact(': 0]')).toBe(true);
  });

  it('detecta símbolos curtos parecidos com checkbox vazio', () => {
    expect(looksLikeCheckboxArtifact('D')).toBe(true);
    expect(looksLikeCheckboxArtifact('I:I'.replace(':', ''))).toBe(true); // "II" também bate no padrão curto
  });

  it('não marca nomes de peça reais como artefato', () => {
    expect(looksLikeCheckboxArtifact('Lateral')).toBe(false);
    expect(looksLikeCheckboxArtifact('Prateleira')).toBe(false);
  });
});

describe('buildMaterialHeader', () => {
  it('devolve string vazia quando não há material', () => {
    expect(buildMaterialHeader('')).toBe('');
  });

  it('prefixa "MDF " quando o material não começa com mdf', () => {
    expect(buildMaterialHeader('branco 15mm')).toBe('MDF branco 15mm\n');
  });

  it('não duplica o prefixo quando o usuário já escreveu MDF', () => {
    expect(buildMaterialHeader('MDF branco 15mm')).toBe('MDF branco 15mm\n');
    expect(buildMaterialHeader('mdf branco 15mm')).toBe('mdf branco 15mm\n');
  });
});
