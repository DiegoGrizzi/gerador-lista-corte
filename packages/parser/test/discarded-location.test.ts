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

  it('acha a linha quando o leitor tirou o "X" depois da quantidade e o código de fita do fim ("3L")', () => {
    const items = [item('4 0,6a0 X 0,258')];
    locateDiscardedLines('PEÇAS 15mm NAVAL BR\n1 X 1,00 X 0,505  1M\n4 X 0,6a0 X 0,258  3L', items);
    expect(items[0]!.line).toBe(3);
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

  it('lista em metros com um erro de digitação ("0,6a0"): a conferência diz a linha 13', () => {
    const text = [
      'PEÇAS 15mm NAVAL BR',
      '3 X 0,80 X 0,505  1M  1m',
      '1 X 1,46 X 0,505  1M',
      '1 X 1,46 X 0,060  1M',
      '2 X 0,80 X 0,485  3L',
      '4 X 0,19 X 0,485  3L',
      '1 X 1,00 X 0,505  1M',
      '3 X 0,80 X 0,505  1M',
      '2 X 1,22 X 0,505  1M',
      '1 X 1,22 X 0,060  1M',
      '3 X 0,80 X 0,405  3L',
      '1 X 0,20 X 0,60    3L',
      '4 X 0,6a0 X 0,258  3L',
    ].join('\n');
    const result = analyzeText(text, makeNextId());
    expect(result.pieces).toHaveLength(11);
    expect(result.discarded.map((d) => d.line)).toEqual([13]);
  });

  it('com CRLF o número da linha é o mesmo', () => {
    const text = ['MDF branco', '', '230x25x15', '107x25x18', '46x25x18'].join('\r\n');
    const result = analyzeText(text, makeNextId());
    expect(result.discarded.map((d) => d.line)).toEqual([3, 4, 5]);
  });
});

describe('analyzeText — linha de tabela recusada (quantidade 0)', () => {
  const text = [
    'Descrição\tQuantidade\tDimensão\tMaterial',
    'Base 15\t1\t1080 x 350 x 15\tMDF Duratex Trama Titânio 15mm',
    'QUANTIDADE NÃO LIDA (página 6, linha 2): Sarrafo 15mm (Frontal)\t0\t80 x 200 x 15\tMDF Duratex Trama Titânio 15mm',
    'Rodapé Linear\t2\t620 x 80 x 15\tMDF Duratex Trama Titânio 15mm',
  ].join('\n');
  const result = analyzeText(text, makeNextId());

  it('as outras linhas da tabela seguem sendo lidas', () => {
    expect(result.pieces.map((p) => [p.qtd, p.compr, p.larg])).toEqual([
      [1, 1080, 350],
      [2, 620, 80],
    ]);
  });

  it('a descrição vira o rótulo e o campo de edição traz "? = medidas", esperando a quantidade', () => {
    expect(result.discarded).toHaveLength(1);
    const item = result.discarded[0]!;
    expect(item.line).toBe(3);
    expect(item.label).toBe('QUANTIDADE NÃO LIDA (página 6, linha 2): Sarrafo 15mm (Frontal)');
    expect(item.editText).toBe('? = 80 x 200');
  });

  it('o contexto do item já traz o material da linha, para o "Tentar novamente"', () => {
    const item = result.discarded[0]!;
    expect(item.context.material).toBe('MDF Duratex Trama Titânio');
    expect(item.context.thicknessMm).toBe(15);
  });
});
