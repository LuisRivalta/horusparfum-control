import { AVISO } from '@/lib/anuncios'
import { Button } from '@/components/shared/FormControls'
import { cn } from '@/lib/utils'
import { editavel, rotulo, tituloSecao, type ItemAnuncio } from './item'

interface Props {
  itens: ItemAnuncio[] // marcados + já publicados
  pendencias: Record<string, string[]>
  quantidades: Record<string, number>
  nPublicar: number
  podePublicar: boolean
  podeSalvar: boolean
  motivo: string | null // preço calculando ou com erro: bloqueia salvar e publicar
  erro: string | null
  ocupado: boolean
  mensagem: string | null
  onSalvar: () => void
  onPublicar: () => void
}

const corStatus: Record<string, string> = { publicado: 'text-up', pausado: 'text-warn', erro: 'text-down', rascunho: 'text-muted' }

export function LateralPublicar({ itens, pendencias, quantidades, nPublicar, podePublicar, podeSalvar, motivo, erro, ocupado, mensagem, onSalvar, onPublicar }: Props) {
  return (
    <aside className="gold-hairline bg-surface border border-line rounded-xl p-5 flex flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <h2 className={tituloSecao}>Antes de publicar</h2>
      {itens.length === 0 && <p className="text-sm text-muted">Escolha um perfume.</p>}
      <ul className="flex flex-col gap-3">
        {itens.map((i) => (
          <li key={i.chave} className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{rotulo(i.alvo)}</span>
              {i.status && <span className={cn('text-xs font-medium', corStatus[i.status] ?? 'text-muted')}>{i.status}</span>}
            </div>
            <span className="text-xs text-muted">Estoque no anúncio: <span className="font-mono">{quantidades[i.chave] ?? 0}</span></span>
            {i.erro && <p className="text-xs text-down">{i.erro}</p>}
            {editavel(i) && (
              <ul className="flex flex-col gap-0.5">
                {(pendencias[i.chave] ?? []).map((p) => (
                  <li key={p} className={cn('text-xs', p.startsWith(AVISO) ? 'text-warn' : 'text-down')}>
                    {p.startsWith(AVISO) ? p.slice(AVISO.length) : p}
                  </li>
                ))}
              </ul>
            )}
            {i.permalink && <a href={i.permalink} target="_blank" rel="noreferrer" className="text-xs text-gold hover:underline">abrir no ML</a>}
            {i.qualidade && (
              <div className="text-xs flex flex-col gap-0.5">
                <span>Nota <span className="font-mono">{i.qualidade.score}</span> · {i.qualidade.nivel}</span>
                {i.qualidade.pendencias.map((p) => (
                  <a key={p.titulo} href={p.link} target="_blank" rel="noreferrer" className="text-warn hover:underline" title={p.texto}>{p.titulo}</a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {motivo && <p className="text-sm text-warn" role="status">{motivo}</p>}
      {erro && <p className="text-sm text-down" role="alert">{erro}</p>}
      {mensagem && <p className="text-sm text-muted" role="status">{mensagem}</p>}
      <div className="flex flex-col gap-2">
        <Button type="button" disabled={!podePublicar || ocupado} onClick={onPublicar}>
          Publicar {nPublicar} {nPublicar === 1 ? 'anúncio' : 'anúncios'}
        </Button>
        <Button type="button" variant="secondary" disabled={ocupado || !podeSalvar} onClick={onSalvar}>Salvar rascunho</Button>
      </div>
    </aside>
  )
}
