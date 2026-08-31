import { describe, expect, it } from 'vitest';
import { reconstructTableText, type OcrWord } from '../services/pdf/table-reconstruct.js';

/**
 * Atalho pra criar uma palavra de teste sem precisar repetir os 4 campos
 * toda vez. Os valores de left/top/width/height nos testes abaixo são
 * baseados em posições reais capturadas de um PDF de verdade (renderizado
 * em alta resolução) — usar alturas realistas (~15-30px) importa: um erro
 * de digitação anterior usando a LARGURA no lugar da ALTURA (caixas
 * artificialmente altas) chegou a quebrar o agrupamento por linha de
 * verdade, então esses valores não são arbitrários.
 */
function word(text: string, left: number, top: number, width: number, height = 18): OcrWord {
  return { text, left, top, width, height };
}

describe('reconstructTableText', () => {
  it('reconstrói uma tabela limpa (cabeçalho + linhas de dados), com colunas mais largas que a palavra do cabeçalho', () => {
    // Espelha um caso real (PDF "Lista de Cortes"): a página tem uma faixa
    // de metadados acima (largura estreita) e a tabela de verdade abaixo,
    // ocupando quase a largura inteira. "Inferior"/"Superior" (coluna
    // Borda) são mais largos que a palavra do cabeçalho "Borda" - testa que
    // isso não vaza pra coluna seguinte.
    const words: OcrWord[] = [
      // metadados acima - poucas palavras, confinadas a uma faixa estreita
      word('Cliente:', 34, 91, 59, 15),
      word('Chapa', 34, 110, 48, 15),
      word('10', 91, 110, 17, 12),
      // cabeçalho da tabela - ocupa quase toda a largura da página
      word('Item', 68, 449, 51, 17),
      word('Descrição', 202, 443, 106, 31),
      word('Dimensão', 733, 447, 109, 19),
      word('Borda', 1031, 448, 62, 18),
      word('do', 1247, 448, 26, 18),
      word('Pai', 1284, 449, 29, 17),
      // linha de dados 1
      word('14.AZ', 70, 476, 64, 17),
      word('Base', 202, 476, 51, 17),
      word('15', 265, 476, 24, 17),
      word('250', 733, 476, 40, 17),
      word('x', 783, 480, 11, 13),
      word('435', 804, 476, 41, 17),
      word('x', 855, 480, 11, 13),
      word('15', 878, 476, 24, 17),
      word('Inferior', 1131, 475, 83, 18), // mais largo que "Borda" - não pode vazar pra coluna seguinte ("do")
      // linha de dados 2
      word('1.BF', 70, 535, 60, 16),
      word('Base', 202, 535, 51, 17),
      word('15', 265, 535, 24, 16),
      word('1700', 733, 535, 55, 17),
      word('x', 795, 539, 11, 12),
      word('70', 855, 535, 24, 17),
      word('x', 888, 539, 11, 12),
      word('15', 908, 535, 24, 16),
      word('Superior', 1131, 534, 83, 17),
    ];

    const result = reconstructTableText(words);
    expect(result).not.toBeNull();
    const lines = result!.split('\n');
    expect(lines[0]).toBe('Item\tDescrição\tDimensão\tBorda\tdo\tPai');
    expect(lines[1]).toBe('14.AZ\tBase 15\t250 x 435 x 15\tInferior\t\t');
    expect(lines[2]).toBe('1.BF\tBase 15\t1700 x 70 x 15\tSuperior\t\t');
  });

  it('não confunde dois blocos de metadados não relacionados na mesma altura com o cabeçalho da tabela', () => {
    // Caso real: "Chapa 10" (bloco à esquerda) e "Acabamento: ... Peças: 23"
    // (bloco à direita) ficam por coincidência quase na mesma altura da
    // página, mas são informações totalmente diferentes - juntos até têm
    // bastante palavra, mas cada bloco sozinho é estreito.
    const words: OcrWord[] = [
      word('Chapa', 34, 110, 48, 15),
      word('10', 91, 110, 17, 12),
      word('Acabamento:', 1663, 110, 102, 15),
      word('Unicolores', 1775, 110, 80, 15),
      word('Peças:', 2200, 110, 60, 15),
      word('23', 2270, 110, 20, 12),
      // cabeçalho de verdade, mais abaixo
      word('Item', 68, 449, 51, 17),
      word('Descrição', 202, 443, 106, 31),
      word('Dimensão', 733, 447, 109, 19),
      word('Borda', 1031, 448, 62, 18),
      word('do', 1247, 448, 26, 18),
      word('Pai', 1284, 449, 29, 17),
      word('14.AZ', 70, 476, 64, 17),
      word('Base', 202, 476, 51, 17),
      word('15', 265, 476, 24, 17),
      word('250', 733, 476, 40, 17),
      word('x', 783, 480, 11, 13),
      word('435', 804, 476, 41, 17),
      word('x', 855, 480, 11, 13),
      word('15', 878, 476, 24, 17),
      word('Inferior', 1131, 475, 83, 18),
    ];

    const result = reconstructTableText(words);
    expect(result).not.toBeNull();
    const lines = result!.split('\n');
    expect(lines[0]).toBe('Item\tDescrição\tDimensão\tBorda\tdo\tPai');
    expect(lines).toHaveLength(2);
  });

  it('devolve null quando a página não tem uma tabela reconhecível (ex: só o desenho do plano de corte)', () => {
    // Rótulos soltos e espalhados, típicos de um desenho de plano de corte
    // - nenhum bate com um nome de coluna conhecido.
    const words: OcrWord[] = [
      word('RET', 178, 240, 40),
      word('AH', 220, 240, 30),
      word('4', 630, 250, 15),
      word('5', 830, 250, 15),
      word('9', 1030, 250, 15),
      word('1419', 610, 500, 50),
      word('723,5', 810, 400, 60),
      word('302', 620, 900, 40),
    ];

    expect(reconstructTableText(words)).toBeNull();
  });

  it('devolve null para uma lista de palavras vazia', () => {
    expect(reconstructTableText([])).toBeNull();
  });

  it('limpa ruído de borda da tabela colado numa palavra do cabeçalho (ex: "|Descrição")', () => {
    const words: OcrWord[] = [
      word('Item', 68, 449, 51, 17),
      word('|Descrição', 202, 443, 106, 31),
      word('Dimensão', 733, 447, 109, 19),
      word('Borda', 1031, 448, 62, 18),
      word('do', 1247, 448, 26, 18),
      word('Pai', 1284, 449, 29, 17),
      word('14.AZ', 70, 476, 64, 17),
      word('Base', 202, 476, 51, 17),
      word('15', 265, 476, 24, 17),
      word('250', 733, 476, 40, 17),
      word('x', 783, 480, 11, 13),
      word('435', 804, 476, 41, 17),
      word('x', 855, 480, 11, 13),
      word('15', 878, 476, 24, 17),
      word('Inferior', 1131, 475, 83, 18),
    ];

    const result = reconstructTableText(words);
    expect(result).not.toBeNull();
    expect(result!.split('\n')[0]).toBe('Item\tDescrição\tDimensão\tBorda\tdo\tPai');
  });
});
