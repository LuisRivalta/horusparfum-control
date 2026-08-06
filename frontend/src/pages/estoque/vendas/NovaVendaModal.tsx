import { VendaFormModal, type VendaFormModalProps } from './VendaFormModal'

export function NovaVendaModal(props: Omit<VendaFormModalProps, 'mode'>) {
  return <VendaFormModal {...props} mode="create" />
}
