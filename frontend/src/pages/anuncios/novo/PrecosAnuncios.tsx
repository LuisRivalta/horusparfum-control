import { formatBRL, cn } from '@/lib/utils'
import type { TipoML } from '@/lib/apiAnuncios'
import { card, rotulo, sigPreco, tituloSecao, TIPOS_ML, type Cotacoes, type ItemAnuncio } from './item'

interface Props {
  itens: ItemAnuncio[]
  cotacoes: Cotacoes
  calculando: boolean
  erro: string | null
  onMargem: (chave: string, margem: number) => void
  onTipo: (chave: string, tipo: TipoML) => void
}

const pct = (m: number) => String(Math.round(m * 10000) / 100)

export function PrecosAnuncios({ itens, cotacoes, calculando, erro, onMargem, onTipo }: Props) {
  return (
    <section className={card}>
      <div className="flex items-center justify-between">
        <h2 className={tituloSecao}>4 · Preço</h2>
        {calculando && <span className="text-xs text-muted">Calculando...</span>}
      </div>
      {erro && <p className="text-sm text-down" role="alert">{erro}</p>}
      {itens.length === 0 && <p className="text-sm text-muted">Marque ao menos um anúncio.</p>}
      <ul className="flex flex-col divide-y divide-line">
        {itens.map((i) => (
          <li key={i.chave} className="py-3 first:pt-0 last:pb-0 grid grid-cols-1 md:grid-cols-[1fr_7rem_1fr_1fr] gap-3 items-center">
            <div>
              <p className="text-sm font-medium">{rotulo(i.alvo)}</p>
              <p className="text-xs text-muted">Custo <span className="font-mono">{formatBRL(i.custo ?? 0)}</span></p>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Margem (%)
              <input
                key={i.margem}
                type="number" min="0" step="0.01" defaultValue={pct(i.margem)}
                aria-label={`Margem ${rotulo(i.alvo)}`}
                onBlur={(e) => {
                  const v = Number(e.target.value.replace(',', '.'))
                  if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= 0 && v <= 9999.99) onMargem(i.chave, Math.round(v * 100) / 10000)
                  else e.target.value = pct(i.margem)
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-line bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-gold/60"
              />
            </label>
            {TIPOS_ML.map((t) => {
              const linha = cotacoes[i.chave]
              const c = linha?.sig === sigPreco(i) ? linha[t.id] : undefined // velha: some até chegar a nova
              const ativo = i.listingType === t.id
              return (
                <button
                  key={t.id} type="button" aria-pressed={ativo} onClick={() => onTipo(i.chave, t.id)}
                  className={cn('text-left px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                    ativo ? 'bg-gold-dim border-gold-line' : 'border-line hover:border-line-2')}
                >
                  <span className={cn('block text-[11px] uppercase tracking-[.08em]', ativo ? 'text-gold' : 'text-muted')}>{t.nome}</span>
                  {!c ? <span className="text-sm text-faint">—</span>
                    : 'erro' in c ? <span className="block text-xs text-down">{c.erro}</span>
                      : (
                        <>
                          <span className="block font-mono text-base text-text">{formatBRL(c.preco)}</span>
                          <span className="block text-xs text-muted">lucro <span className="font-mono">{formatBRL(c.lucro)}</span></span>
                        </>
                      )}
                </button>
              )
            })}
          </li>
        ))}
      </ul>
    </section>
  )
}
