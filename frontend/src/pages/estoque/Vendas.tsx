import { Icon } from '@/components/shared/Icon'
import { Button } from '@/components/shared/FormControls'

export function EstVendas() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque / Vendas</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Vendas</h1>
          <p className="text-muted text-sm mt-1">Registro de vendas com baixa de estoque e lançamento no caixa</p>
        </div>
        <Button>
          <Icon name="plus" size={16} />
          Nova venda
        </Button>
      </div>
      <div className="py-12 text-center text-muted border border-dashed border-line rounded-xl">
        <Icon name="cart" size={32} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Nenhuma venda registrada</p>
      </div>
    </div>
  )
}
