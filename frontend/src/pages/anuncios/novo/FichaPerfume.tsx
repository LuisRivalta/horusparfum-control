import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sugerirFicha, type AtributoML } from '@/lib/apiAnuncios'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { card, tituloSecao } from './item'

export interface ValorFicha { value_id: string | null; value_name: string }
export type Ficha = Record<string, ValorFicha>

interface Props {
  produtoId: string
  atributos: AtributoML[]
  erroAtributos: string | null
  ficha: Ficha
  origemIA: Set<string>
  horus: Record<string, string> // BRAND, PERFUME_NAME, UNIT_VOLUME vindos do cadastro
  gtin: string
  iaAtiva: boolean
  onFicha: (ficha: Ficha, origemIA: Set<string>) => void
  onGtin: (gtin: string) => void
}

// Fora da lista: os do Horus aparecem à parte, GTIN tem campo próprio, o resto o backend preenche.
const FORA = ['BRAND', 'PERFUME_NAME', 'UNIT_VOLUME', 'GTIN', 'EMPTY_GTIN_REASON']
const SIM_NAO = [{ value: 'Sim', label: 'Sim' }, { value: 'Não', label: 'Não' }]

const Selo = ({ ia }: { ia?: boolean }) => (
  <span className={ia
    ? 'px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-warn/40 text-warn bg-warn/10'
    : 'px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-gold-line text-gold bg-gold/10'}>
    {ia ? 'IA · confira' : 'Horus'}
  </span>
)

export function FichaPerfume({ produtoId, atributos, erroAtributos, ficha, origemIA, horus, gtin, iaAtiva, onFicha, onGtin }: Props) {
  const [rascunho, setRascunho] = useState<Record<string, string>>({})
  const [gtinTexto, setGtinTexto] = useState(gtin)
  const [erro, setErro] = useState<string | null>(null)
  const [sugerindo, setSugerindo] = useState(false)

  async function gravar(nova: Ficha, ia: Set<string>) {
    const { error } = await supabase.from('produtos').update({ ficha: nova }).eq('id', produtoId)
    if (error) { setErro('Não foi possível salvar a ficha.'); return }
    setErro(null)
    onFicha(nova, ia)
  }

  function mudar(id: string, v: ValorFicha | null) {
    const nova = { ...ficha }
    if (v && v.value_name.trim()) nova[id] = v
    else delete nova[id]
    const ia = new Set(origemIA)
    ia.delete(id) // editado: deixa de ser da IA
    gravar(nova, ia)
  }

  function sairDoCampo(id: string) {
    const v = rascunho[id]
    setRascunho((r) => { const resto = { ...r }; delete resto[id]; return resto })
    if (v !== undefined && v !== (ficha[id]?.value_name ?? '')) mudar(id, { value_id: null, value_name: v.trim() })
  }

  async function salvarGtin() {
    const v = gtinTexto.trim()
    if (v === gtin) return
    const { error } = await supabase.from('produtos').update({ gtin: v || null }).eq('id', produtoId)
    if (error) { setErro('Não foi possível salvar o código de barras.'); return }
    setErro(null)
    onGtin(v)
  }

  // A IA só preenche campo vazio: o que o Luis já pôs fica.
  async function sugerir() {
    setSugerindo(true)
    try {
      const r = (await sugerirFicha(produtoId)).ficha as Ficha
      const novos = Object.entries(r ?? {}).filter(([k, v]) => !ficha[k] && !FORA.includes(k) && v?.value_name)
      if (!novos.length) { setErro('A IA não sugeriu nada novo.'); return }
      await gravar({ ...ficha, ...Object.fromEntries(novos) }, new Set([...origemIA, ...novos.map(([k]) => k)]))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSugerindo(false)
    }
  }

  function campo(a: AtributoML) {
    const atual = ficha[a.id]
    if (a.values?.length) {
      return (
        <Select label={a.name} value={atual?.value_id ?? ''}
          options={a.values.map((v) => ({ value: v.id, label: v.name }))}
          onChange={(e) => {
            const v = a.values!.find((x) => x.id === e.target.value)
            mudar(a.id, v ? { value_id: v.id, value_name: v.name } : null)
          }} />
      )
    }
    if (a.value_type === 'boolean') {
      return (
        <Select label={a.name} value={atual?.value_name ?? ''} options={SIM_NAO}
          onChange={(e) => mudar(a.id, e.target.value ? { value_id: null, value_name: e.target.value } : null)} />
      )
    }
    return (
      <Input label={a.name} type={a.value_type === 'number' ? 'number' : 'text'}
        value={rascunho[a.id] ?? atual?.value_name ?? ''}
        onChange={(e) => setRascunho((r) => ({ ...r, [a.id]: e.target.value }))}
        onBlur={() => sairDoCampo(a.id)} />
    )
  }

  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 className={tituloSecao}>3 · Ficha do perfume</h2>
        {iaAtiva && (
          <Button size="sm" variant="secondary" type="button" disabled={sugerindo} onClick={sugerir}>
            {sugerindo ? 'Sugerindo...' : 'Sugerir com IA'}
          </Button>
        )}
      </div>
      {erro && <p className="text-sm text-down" role="alert">{erro}</p>}

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[['BRAND', 'Marca'], ['PERFUME_NAME', 'Nome'], ['UNIT_VOLUME', 'Volume']].map(([id, nome]) => (
          <div key={id} className="bg-surface-2 border border-line rounded-lg px-3 py-2">
            <dt className="flex items-center justify-between text-xs uppercase tracking-[.08em] text-muted">{nome} <Selo /></dt>
            <dd className="text-sm mt-0.5">{horus[id] || '—'}</dd>
          </div>
        ))}
      </dl>

      <Input label="Código de barras (frasco)" inputMode="numeric" value={gtinTexto}
        onChange={(e) => setGtinTexto(e.target.value)} onBlur={salvarGtin} />

      {erroAtributos && <p className="text-sm text-down">{erroAtributos}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {atributos.filter((a) => !FORA.includes(a.id)).map((a) => (
          <div key={a.id} className="relative">
            {origemIA.has(a.id) && <span className="absolute right-0 top-0"><Selo ia /></span>}
            {campo(a)}
          </div>
        ))}
      </div>
    </section>
  )
}
