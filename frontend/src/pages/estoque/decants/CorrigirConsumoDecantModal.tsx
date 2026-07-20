import { Modal } from '@/components/shared/Modal'
import { Button } from '@/components/shared/FormControls'

export interface TransacaoDecantParaCorrigir {
  id: string
  descricao: string
  valor: number
  responsavel: string | null
  decant_id?: string | null
}

interface Props {
  open: boolean
  transacao: TransacaoDecantParaCorrigir | null
  onClose: () => void
  onSaved: () => void
}

export function CorrigirConsumoDecantModal({ open, transacao, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Corrigir consumo de decant">
      <div className="flex flex-col gap-4 text-text-2">
        <p>A funcionalidade completa de correção de decant está em desenvolvimento (Task 4 do plano).</p>
        <p>Quando finalizada, ela permitirá estornar os mL e o custo gerencial de <strong>{transacao?.descricao}</strong>.</p>
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={onClose} variant="secondary">Fechar</Button>
        </div>
      </div>
    </Modal>
  )
}
