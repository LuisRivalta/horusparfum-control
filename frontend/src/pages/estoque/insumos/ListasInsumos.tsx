import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatBRL } from '@/lib/utils'
import { Icon } from '@/components/shared/Icon'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { custoInsumos, type TipoLista } from '@/lib/insumos'
import type { Insumo } from './CompraInsumoModal'

interface Lista {
  id: string
  tipo: TipoLista
  tamanho_ml: number | null
  peso_g: number | null
  altura_cm: number | null
  largura_cm: number | null
  comprimento_cm: number | null
  insumo_lista_itens: { insumo_id: string; quantidade: number }[]
}

type Resultado = PromiseLike<{ error: { message: string } | null }>

const TITULO: Record<TipoLista, string> = {
  decant: 'Decant', frasco: 'Kit do frasco cheio', envio_decant: 'Kit de envio (decant)', envio_frasco: 'Kit de envio (frasco)',
}
const DESCRICAO: Record<TipoLista, string> = {
  decant: '',
  frasco: 'Sai do estoque a cada frasco lacrado vendido.',
  envio_decant: 'Sai uma vez por pedido enviado só com decants.',
  envio_frasco: 'Sai uma vez por pedido enviado que tem frasco.',
}
const ORDEM: TipoLista[] = ['decant', 'frasco', 'envio_decant', 'envio_frasco']
const ml = (l: Lista) => String(l.tamanho_ml).replace('.', ',')
const titulo = (l: Lista) => l.tipo === 'decant' ? `Kit do decant ${ml(l)} ml` : TITULO[l.tipo]
const descricao = (l: Lista) => l.tipo === 'decant' ? `Sai do estoque a cada decant de ${ml(l)} ml vendido.` : DESCRICAO[l.tipo]

interface Props { insumos: Insumo[]; onChange: () => void; irParaEstoque: () => void }

export function ListasInsumos({ insumos, onChange, irParaEstoque }: Props) {
  const [listas, setListas] = useState<Lista[]>([])
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    const { data, error } = await supabase
      .from('insumo_listas').select('*, insumo_lista_itens(insumo_id, quantidade)').order('tamanho_ml')
    if (error) { setErro(error.message); return }
    const l = (data as Lista[]) ?? []
    setListas([...l].sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo) || (a.tamanho_ml ?? 0) - (b.tamanho_ml ?? 0)))
  }
  useEffect(() => { carregar() }, [])

  async function depois(p: Resultado) {
    const { error } = await p
    if (error) { setErro(error.message); return }
    await carregar()
    onChange()
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted max-w-2xl">
        Cada kit diz quais insumos saem do estoque numa venda. Na hora de registrar a venda o kit já vem
        preenchido, e dá para mudar o que precisar antes de confirmar.
      </p>
      {erro && <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}
      {insumos.length === 0 ? (
        <div className="gold-hairline bg-surface border border-line rounded-xl p-8 text-center text-sm text-muted">
          Cadastre os insumos primeiro (frascos, etiquetas, caixas…) para montar os kits.
          <div className="mt-4">
            <Button variant="secondary" onClick={irParaEstoque}>Ir para Estoque</Button>
          </div>
        </div>
      ) : (
        [
          { titulo: 'Por item vendido', tipos: ['decant', 'frasco'] },
          { titulo: 'Por envio', tipos: ['envio_decant', 'envio_frasco'] },
        ].map((g) => (
          <div key={g.titulo} className="flex flex-col gap-3">
            <h2 className="text-xl tracking-tight">{g.titulo}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {listas.filter((l) => g.tipos.includes(l.tipo)).map((l) => (
                <SecaoLista key={l.id} lista={l} insumos={insumos} depois={depois} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function SecaoLista({ lista, insumos, depois }: {
  lista: Lista; insumos: Insumo[]; depois: (p: Resultado) => Promise<void>
}) {
  const [novo, setNovo] = useState('')
  const [qtd, setQtd] = useState('1')
  const [med, setMed] = useState({
    peso_g: String(lista.peso_g ?? ''), altura_cm: String(lista.altura_cm ?? ''),
    largura_cm: String(lista.largura_cm ?? ''), comprimento_cm: String(lista.comprimento_cm ?? ''),
  })
  const envio = lista.tipo.startsWith('envio')
  const itens = lista.insumo_lista_itens
  const porId = Object.fromEntries(insumos.map((i) => [i.id, i]))
  const custos = Object.fromEntries(insumos.map((i) => [i.id, i.custo_medio]))
  // inativo segue na lista (para poder removê-lo), mas não é consumido: fora do custo
  const total = custoInsumos(itens.filter((i) => porId[i.insumo_id]?.ativo)
    .map((i) => ({ insumoId: i.insumo_id, quantidade: i.quantidade })), custos)
  // inativos ficam fora do picker, assim como os que já estão na lista
  const candidatos = insumos.filter((i) => i.ativo && !itens.some((x) => x.insumo_id === i.id))

  const adicionar = () => {
    if (!novo || Number(qtd) <= 0) return
    depois(supabase.from('insumo_lista_itens').insert({ lista_id: lista.id, insumo_id: novo, quantidade: Number(qtd) }))
    setNovo(''); setQtd('1')
  }
  const num = (s: string) => (s === '' ? null : Number(s))
  const salvarMedidas = () => depois(supabase.from('insumo_listas').update({
    peso_g: num(med.peso_g), altura_cm: num(med.altura_cm),
    largura_cm: num(med.largura_cm), comprimento_cm: num(med.comprimento_cm),
  }).eq('id', lista.id))

  return (
    <section data-testid={`lista-${lista.id}`} className="gold-hairline bg-surface border border-line rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{titulo(lista)}</h3>
          <p className="text-xs text-muted mt-0.5">{descricao(lista)}</p>
        </div>
        <span className="text-sm text-muted whitespace-nowrap">Custo <span className="font-mono text-text">{formatBRL(total)}</span></span>
      </div>

      {itens.length === 0 && <p className="text-xs text-muted">Nenhum insumo na lista</p>}
      {itens.map((i) => (
        <div key={i.insumo_id} className="flex items-center justify-between text-sm">
          <span className="flex-1 truncate">
            {porId[i.insumo_id]?.nome ?? '—'}
            {porId[i.insumo_id] && !porId[i.insumo_id].ativo && <span className="text-muted"> (inativo)</span>}
          </span>
          <span className="text-muted mr-1">×</span>
          <input
            key={`${i.insumo_id}-${i.quantidade}`}
            type="number" min="0" step="any" defaultValue={i.quantidade}
            aria-label={`Quantidade de ${porId[i.insumo_id]?.nome ?? 'insumo'}`}
            className="w-16 mr-3 px-2 py-1 rounded-md border border-line bg-surface-2 text-sm font-mono tabular-nums text-right focus:outline-none focus:border-gold/60"
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onBlur={(e) => {
              const q = Number(e.target.value)
              if (!(q > 0)) { e.target.value = String(i.quantidade); return }
              if (q !== i.quantidade) depois(supabase.from('insumo_lista_itens').update({ quantidade: q }).eq('lista_id', lista.id).eq('insumo_id', i.insumo_id))
            }}
          />
          <button
            aria-label={`Remover ${porId[i.insumo_id]?.nome ?? 'insumo'}`}
            className="text-muted hover:text-down cursor-pointer"
            onClick={() => depois(supabase.from('insumo_lista_itens').delete().eq('lista_id', lista.id).eq('insumo_id', i.insumo_id))}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Select
            label="Adicionar insumo"
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            options={[{ value: '', label: 'Selecione…' }, ...candidatos.map((i) => ({ value: i.id, label: i.nome }))]}
          />
        </div>
        <div className="w-24">
          <Input label="Qtd" type="number" min="0" step="any" value={qtd} onChange={(e) => setQtd(e.target.value)} />
        </div>
        <Button variant="secondary" onClick={adicionar} disabled={!novo}>Adicionar</Button>
      </div>

      {envio && (
        <div className="border-t border-line pt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Peso (g)" type="number" min="0" value={med.peso_g} onChange={(e) => setMed({ ...med, peso_g: e.target.value })} />
            <Input label="Altura (cm)" type="number" min="0" step="any" value={med.altura_cm} onChange={(e) => setMed({ ...med, altura_cm: e.target.value })} />
            <Input label="Largura (cm)" type="number" min="0" step="any" value={med.largura_cm} onChange={(e) => setMed({ ...med, largura_cm: e.target.value })} />
            <Input label="Comprimento (cm)" type="number" min="0" step="any" value={med.comprimento_cm} onChange={(e) => setMed({ ...med, comprimento_cm: e.target.value })} />
          </div>
          <Button variant="secondary" onClick={salvarMedidas}>Salvar medidas</Button>
        </div>
      )}
    </section>
  )
}
