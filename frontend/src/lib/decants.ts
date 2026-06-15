export function podeFrasco(
  produto: { estoque_atual: number },
  abertos: { id: string }[]
): boolean {
  return produto.estoque_atual > 0 && abertos.length === 0
}

export function calcularNovoML(mlRestante: number, mlDecant: number): number | null {
  if (mlDecant <= 0) return null
  const resultado = mlRestante - mlDecant
  return resultado < 0 ? null : resultado
}

export function statusAposDecant(novoML: number): 'ativo' | 'esgotado' {
  return novoML <= 0 ? 'esgotado' : 'ativo'
}
