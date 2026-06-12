import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  periodoMes,
  periodoTrimestre,
  periodoAno,
  periodoPersonalizado,
  type Periodo,
} from '@/lib/financeiro'

type Granularidade = 'mes' | 'trimestre' | 'ano' | 'personalizado'

interface Props {
  value: Periodo
  onChange: (p: Periodo) => void
}

const MES_OPCOES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const GRANS: { id: Granularidade; label: string }[] = [
  { id: 'mes', label: 'Mês' },
  { id: 'trimestre', label: 'Trimestre' },
  { id: 'ano', label: 'Ano' },
  { id: 'personalizado', label: 'Personalizado' },
]

function isoDia(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export function PeriodSelector({ value, onChange }: Props) {
  const hoje = value.inicio
  const [gran, setGran] = useState<Granularidade>('mes')
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())
  const [trimestre, setTrimestre] = useState(Math.floor(hoje.getMonth() / 3) + 1)
  const [inicioCustom, setInicioCustom] = useState(isoDia(value.inicio))
  const [fimCustom, setFimCustom] = useState(isoDia(value.fim))

  const selectCls =
    'px-3 py-2 rounded-lg border border-line bg-surface-2 text-text text-sm cursor-pointer ' +
    'focus:outline-none focus:border-gold/60 focus:shadow-[0_0_0_3px_rgba(201,168,76,0.12)]'

  function aplicarMes(a: number, m: number) {
    setAno(a); setMes(m); onChange(periodoMes(a, m))
  }
  function aplicarTrimestre(a: number, t: number) {
    setAno(a); setTrimestre(t); onChange(periodoTrimestre(a, t))
  }
  function aplicarAno(a: number) {
    setAno(a); onChange(periodoAno(a))
  }
  function aplicarCustom(iniISO: string, fimISO: string) {
    if (!iniISO || !fimISO) return
    onChange(periodoPersonalizado(new Date(iniISO + 'T00:00:00'), new Date(fimISO + 'T00:00:00')))
  }

  function trocarGran(g: Granularidade) {
    setGran(g)
    if (g === 'mes') onChange(periodoMes(ano, mes))
    else if (g === 'trimestre') onChange(periodoTrimestre(ano, trimestre))
    else if (g === 'ano') onChange(periodoAno(ano))
    else aplicarCustom(inicioCustom, fimCustom)
  }

  const anos = [ano - 2, ano - 1, ano, ano + 1]

  return (
    <div className="flex flex-col gap-3 border border-line rounded-xl p-4 bg-surface">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex p-0.5 border border-line-2 rounded-2xl bg-surface-2 gap-0.5">
          {GRANS.map((g) => (
            <button
              key={g.id}
              onClick={() => trocarGran(g.id)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer',
                gran === g.id ? 'bg-gold text-[#1A1407]' : 'text-muted hover:text-text'
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs uppercase tracking-[.14em] text-gold">{value.label}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {gran === 'mes' && (
          <>
            <select className={selectCls} value={mes} onChange={(e) => aplicarMes(ano, Number(e.target.value))}>
              {MES_OPCOES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className={selectCls} value={ano} onChange={(e) => aplicarMes(Number(e.target.value), mes)}>
              {anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </>
        )}
        {gran === 'trimestre' && (
          <>
            <select className={selectCls} value={trimestre} onChange={(e) => aplicarTrimestre(ano, Number(e.target.value))}>
              {[1, 2, 3, 4].map((t) => <option key={t} value={t}>{t}º trimestre</option>)}
            </select>
            <select className={selectCls} value={ano} onChange={(e) => aplicarTrimestre(Number(e.target.value), trimestre)}>
              {anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </>
        )}
        {gran === 'ano' && (
          <select className={selectCls} value={ano} onChange={(e) => aplicarAno(Number(e.target.value))}>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {gran === 'personalizado' && (
          <>
            <input
              type="date" className={selectCls} value={inicioCustom}
              onChange={(e) => { setInicioCustom(e.target.value); aplicarCustom(e.target.value, fimCustom) }}
            />
            <span className="text-muted text-sm">até</span>
            <input
              type="date" className={selectCls} value={fimCustom}
              onChange={(e) => { setFimCustom(e.target.value); aplicarCustom(inicioCustom, e.target.value) }}
            />
          </>
        )}
      </div>
    </div>
  )
}
