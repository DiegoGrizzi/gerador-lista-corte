import { describe, expect, it } from 'vitest';

import { analyzeText } from '../src/analyze.js';
import { locateDiscardedLines } from '../src/discarded-location.js';
import type { DiscardedItem } from '../src/types.js';

const CONTEXT = { material: '', complemento: '', funcao: '', fitaType: null, thicknessMm: null };

function item(text: string): DiscardedItem {
  return { text, suggested: null, context: { ...CONTEXT } };
}

function makeNextId(): () => string {
  let n = 0;
  return () => String(++n);
}

describe('locateDiscardedLines', () => {
  it('acha a linha do texto original, contando as linhas em branco', () => {
    const items = [item('abc 123 xyz')];
    locateDiscardedLines('primeira\n\nsegunda\nabc 123 xyz\n', items);
    expect(items[0]!.line).toBe(4);
  });

  it('ignora maiúsculas, espaços e pontuação na comparação', () => {
    const items = [item('Quantidade não lida: 80 x 200')];
    locateDiscardedLines('a\nquantidade nao lida - 80x200\nb', items);
    expect(items[0]!.line).toBe(2);
  });

  it('linhas repetidas pegam as ocorrências seguintes, na ordem', () => {
    const items = [item('lixo 55'), item('lixo 55')];
    locateDiscardedLines('lixo 55\nx\nlixo 55', items);
    expect(items.map((i) => i.line)).toEqual([1, 3]);
  });

  it('acha a linha mesmo depois de o leitor tirar a unidade (mm) do texto', () => {
    const items = [item('1630 x 65 xyz')];
    locateDiscardedLines('titulo\n1630mm x 65mm abc', items);
    expect(items[0]!.line).toBe(2);
  });

  it('acha a linha emendada pelo leitor (quantidade em linha separada)', () => {
    const items = [item('lateral 700x300 3')];
    locateDiscardedLines('mdf branco\nlateral 700x300\n3', items);
    expect(items[0]!.line).toBe(2);
  });

  it('sem achar, deixa o item sem linha', () => {
    const items = [item('texto que não existe')];
    locateDiscardedLines('uma\noutra', items);
    expect(items[0]!.line).toBeUndefined();
  });
});

describe('analyzeText — linha dos itens da conferência', () => {
  it('as linhas que vão para a conferência dizem em que linha do texto estão', () => {
    // "x15" / "x18" sem resposta: o leitor não sabe se é quantidade ou espessura e manda para a conferência.
    const text = ['MDF branco', '', '230x25x15', '107x25x18', '46x25x18'].join('\n');
    const result = analyzeText(text, makeNextId());
    expect(result.thirdNumberAmbiguous).toBe(true);
    expect(result.discarded.map((d) => [d.text, d.line])).toEqual([
      ['230x25x15', 3],
      ['107x25x18', 4],
      ['46x25x18', 5],
    ]);
  });

  it('com CRLF o número da linha é o mesmo', () => {
    const text = ['MDF branco', '', '230x25x15', '107x25x18', '46x25x18'].join('\r\n');
    const result = analyzeText(text, makeNextId());
    expect(result.discarded.map((d) => d.line)).toEqual([3, 4, 5]);
  });
});
