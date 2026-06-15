// frontend/src/pages/estoque/decants/DecantModal.tsx
interface FrascoComProduto {
  id: string
  produto_id: string
  ml_total: number
  ml_restante: number
  status: 'ativo' | 'esgotado'
  aberto_em: string
  produtos: { nome: string; foto_url: string | null }
}

interface Props {
  frasco: FrascoComProduto
  onClose: () => void
  onSaved: () => void
}

export function DecantModal(_: Props) {
  return null
}
