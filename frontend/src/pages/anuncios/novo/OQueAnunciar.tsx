import { cn } from '@/lib/utils'
import { card, editavel, rotulo, tituloSecao, type ItemAnuncio } from './item'

export function OQueAnunciar({ itens, onMarcar }: { itens: ItemAnuncio[]; onMarcar: (chave: string, marcado: boolean) => void }) {
  return (
    <section className={card}>
      <h2 className={tituloSecao}>2 · O que anunciar</h2>
      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {itens.map((i) => {
          const travado = !!i.bloqueio || !editavel(i)
          return (
            <li key={i.chave} className={cn('border rounded-lg px-3 py-2.5 flex flex-col gap-1',
              i.marcado && !travado ? 'border-gold-line bg-gold-dim' : 'border-line')}>
              <label className={cn('flex items-center gap-2 text-sm', travado ? 'text-muted' : 'cursor-pointer')}>
                <input type="checkbox" disabled={travado} checked={i.marcado && !i.bloqueio && editavel(i)}
                  onChange={(e) => onMarcar(i.chave, e.target.checked)} />
                {rotulo(i.alvo)}
              </label>
              {i.bloqueio && <span className="text-xs text-down">{i.bloqueio}</span>}
              {!editavel(i) && <span className="text-xs text-up">Já {i.status} no ML</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
