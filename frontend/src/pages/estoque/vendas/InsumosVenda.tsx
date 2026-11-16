import { Select } from '@/components/shared/FormControls'
import { Icon } from '@/components/shared/Icon'
import { formatBRL } from '@/lib/utils'
import { custoInsumos, somarItens, type ItemInsumo } from '@/lib/insumos'

export interface InsumoOpt { id: string; nome: string; custo_medio: number; ativo: boolean }
export interface GrupoInsumos { chave: string; rotulo: string; titulo: string; itens: ItemInsumo[] }

interface Props {
  grupos: GrupoInsumos[]
  insumos: InsumoOpt[]
  onChange: (chave: string, itens: ItemInsumo[]) => void
}

// Insumos da venda por grupo (cada item + envio), editáveis antes de salvar.
export function InsumosVenda({ grupos, insumos, onChange }: Props) {
  const nome = (id: string) => insumos.find((i) => i.id === id)?.nome ?? 'Insumo'
  const custos = Object.fromEntries(insumos.map((i) => [i.id, Number(i.custo_medio)]))
  const total = custoInsumos(somarItens(...grupos.map((g) => g.itens)), custos)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-[.08em] text-muted">Insumos</span>
      {grupos.map((g) => {
        const candidatos = insumos.filter((i) => i.ativo && !g.itens.some((x) => x.insumoId === i.id))
        return (
          <div key={g.chave} className="flex flex-col gap-1.5 p-3 border border-line rounded-lg">
            <span className="text-sm font-medium">{g.titulo}</span>
            {g.itens.length === 0 && <span className="text-xs text-muted">Nenhum insumo</span>}
            {g.itens.map((it, j) => (
              <div key={it.insumoId} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{nome(it.insumoId)}</span>
                <input
                  aria-label={`${g.rotulo}: ${nome(it.insumoId)}`}
                  type="number" min="0" step="1"
                  className="w-20 px-2 py-1 rounded-lg border border-line bg-surface-2 text-text text-sm"
                  value={it.quantidade}
                  onChange={(e) => onChange(g.chave, g.itens.map((x, k) => (k === j ? { ...x, quantidade: Number(e.target.value) || 0 } : x)))}
                />
                <button
                  type="button"
                  aria-label={`Remover ${nome(it.insumoId)}`}
                  className="text-muted hover:text-down cursor-pointer"
                  onClick={() => onChange(g.chave, g.itens.filter((_, k) => k !== j))}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
            {candidatos.length > 0 && (
              <Select
                aria-label={`Adicionar insumo em ${g.rotulo}`}
                options={candidatos.map((i) => ({ value: i.id, label: `+ ${i.nome}` }))}
                value=""
                onChange={(e) => e.target.value && onChange(g.chave, [...g.itens, { insumoId: e.target.value, quantidade: 1 }])}
              />
            )}
          </div>
        )
      })}
      <div className="flex justify-between text-sm">
        <span className="text-muted">Custo dos insumos</span>
        <span className="font-mono">{formatBRL(total)}</span>
      </div>
    </div>
  )
}
