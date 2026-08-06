import { VendaFormModal, type VendaFormModalProps } from './VendaFormModal'

export function EditarVendaModal(props: Omit<VendaFormModalProps, 'mode'>) {
  return <VendaFormModal {...props} mode="edit" />
}
