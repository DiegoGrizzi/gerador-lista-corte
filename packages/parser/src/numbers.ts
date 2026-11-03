/**
 * numbers.ts
 * ---------------------------------------------------------------------------
 * Conversão de texto de medida para número (ver toNumber no parser.js legado).
 * ---------------------------------------------------------------------------
 */

/**
 * Converte um texto de medida em número, aceitando vírgula ou aspa simples
 * como separador decimal (comuns em mensagens digitadas no celular).
 * Ex: toNumber("56'5") === 56.5, toNumber("56,5") === 56.5
 *
 * Trata também o ponto como separador de milhar quando aparecem
 * exatamente 3 dígitos depois dele (padrão brasileiro de formatação:
 * "1.200" significa 1200, não 1,2). Medidas de marcenaria nunca têm essa
 * precisão de 3 casas decimais, então esse padrão é seguro aqui — um
 * ponto com 1 ou 2 dígitos depois (ex: "56.5", "22.50") continua sendo
 * interpretado como decimal normalmente.
 */
export function toNumber(str: string | number): number {
  const text = String(str);
  const thousandsSeparator = text.match(/^(\d+)\.(\d{3})$/);
  if (thousandsSeparator) {
    // Os dois grupos são obrigatórios na regex (nenhum é opcional), então,
    // se o match existe, ambos existem.
    return parseFloat(thousandsSeparator[1]! + thousandsSeparator[2]!);
  }
  return parseFloat(text.replace(/'/g, '.').replace(',', '.'));
}

/**
 * Verdadeiro quando o texto da medida tem um ponto decimal DE VERDADE
 * ("44.3", "55.5") — e não um número inteiro escrito com ".0" ("2480.0",
 * comum em listas exportadas) nem um separador de milhar ("1.200").
 * Quem escreve em mm costuma usar o ponto para marcar cm ("2450 x 44.3" =
 * 2450 x 443 mm) — ver convertPieceToMm.
 */
export function isDecimalDotMeasure(text: string): boolean {
  if (!/^\d+\.\d+$/.test(text)) return false;
  return !Number.isInteger(toNumber(text));
}
