import { NovaVendaModal } from './NovaVendaModal'

interface Props {
  open: boolean
  vendaId: string
  onClose: () => void
  onSaved: () => void
}

export function EditarVendaModal({ open, vendaId, onClose, onSaved }: Props) {
  return <NovaVendaModal open={open} vendaId={vendaId} onClose={onClose} onSaved={onSaved} />
}
