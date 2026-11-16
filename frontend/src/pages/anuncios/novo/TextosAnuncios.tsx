import { Button } from '@/components/shared/FormControls'
import { cn } from '@/lib/utils'
import { card, rotulo, tituloSecao, type ItemAnuncio } from './item'

interface Props {
  itens: ItemAnuncio[]
  iaAtiva: boolean
  gerando: boolean
  erro: string | null
  onChange: (chave: string, campo: 'titulo' | 'descricao', valor: string) => void
  onGerarIA: () => void
  onModelo: () => void
}

const MAX_TITULO = 150
const campo = 'w-full px-3.5 py-2.5 rounded-lg border border-line bg-surface-2 text-text text-sm focus:outline-none focus:border-gold/60'

export function TextosAnuncios({ itens, iaAtiva, gerando, erro, onChange, onGerarIA, onModelo }: Props) {
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={tituloSecao}>6 · Título e descrição</h2>
        <div className="flex gap-2">
          {iaAtiva && <Button size="sm" type="button" disabled={gerando || !itens.length} onClick={onGerarIA}>{gerando ? 'Gerando...' : 'Gerar com IA'}</Button>}
          <Button size="sm" variant="secondary" type="button" disabled={gerando} onClick={onModelo}>Usar modelo sem IA</Button>
        </div>
      </div>
      {erro && <p className="text-sm text-down" role="alert">{erro}</p>}
      {itens.map((i, n) => (
        <div key={i.chave} className={cn('flex flex-col gap-2', n > 0 && 'border-t border-line pt-4')}>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={`titulo-${i.chave}`} className="text-sm font-medium">{rotulo(i.alvo)}</label>
            <span className={cn('font-mono text-xs', i.titulo.length > MAX_TITULO ? 'text-down' : 'text-faint')}>
              {i.titulo.length}/{MAX_TITULO}
            </span>
          </div>
          <input id={`titulo-${i.chave}`} className={campo} value={i.titulo}
            onChange={(e) => onChange(i.chave, 'titulo', e.target.value)} />
          <textarea aria-label={`Descrição ${rotulo(i.alvo)}`} rows={5} className={campo} value={i.descricao}
            onChange={(e) => onChange(i.chave, 'descricao', e.target.value)} />
        </div>
      ))}
    </section>
  )
}
