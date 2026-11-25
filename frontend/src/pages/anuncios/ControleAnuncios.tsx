import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { Icon } from '@/components/shared/Icon'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  filtrarLinhas, montarLinhas, paraMarcarTodas,
  type Canal, type Celula, type EstadoPerfume, type Marca, type ProdutoControle, type Variante,
} from '@/lib/controleAnuncios'
import { fmtMl } from './novo/item'

type Linha = { produto_id: string; canal?: Canal; tipo: 'frasco' | 'decant'; ml: number | string | null }

const PLATAFORMAS = [{ value: 'ml', label: 'Mercado Livre' }, { value: 'shopify', label: 'Shopify' }]
const SITUACOES = [
  { value: 'todos', label: 'Todos' }, { value: 'completo', label: 'Completos' },
  { value: 'aguardando', label: 'Aguardando estoque' }, { value: 'incompleto', label: 'Incompletos' },
  { value: 'sem_anuncio', label: 'Sem anúncio' },
]
const TEXTO = { verde: 'criado', vermelha: 'falta criar', cinza: 'sem estoque' }
const COR = {
  verde: 'bg-up/20 border-up/60 text-up',
  vermelha: 'bg-down/20 border-down/60 text-down hover:bg-down/30',
  cinza: 'bg-surface-2 border-line-2 hover:border-gold-line',
}

const nomeVariante = (v: Variante) => (v.tipo === 'frasco' ? 'Frasco' : `${fmtMl(Number(v.ml))} ml`)
const paraMarca = (l: Linha, canal?: Canal): Marca => ({
  produto_id: l.produto_id, canal: canal ?? l.canal!, tipo: l.tipo, ml: l.ml == null ? null : Number(l.ml),
})
function falhou(r: { error: { message: string } | null }) {
  if (r.error) throw new Error(r.error.message)
}

type Resposta = { data: unknown; error: { message: string } | null }
type Paginavel = { order: (c: string) => { range: (de: number, ate: number) => PromiseLike<Resposta> } }
const PAGINA = 1000 // limite padrão de linhas do Supabase por consulta

/** Lê todas as linhas, de 1000 em 1000 (sem isso o Supabase corta em 1000 sem avisar). */
async function todas<T>(consulta: () => Paginavel): Promise<T[]> {
  const linhas: T[] = []
  for (let de = 0; ; de += PAGINA) {
    const r = await consulta().order('id').range(de, de + PAGINA - 1)
    falhou(r)
    const pagina = (r.data ?? []) as T[]
    linhas.push(...pagina)
    if (pagina.length < PAGINA) return linhas
  }
}

export function ControleAnuncios() {
  const [produtos, setProdutos] = useState<ProdutoControle[] | null>(null)
  const [tamanhos, setTamanhos] = useState<number[]>([])
  const [automaticas, setAutomaticas] = useState<Marca[]>([])
  const [manuais, setManuais] = useState<Marca[]>([])
  const [canal, setCanal] = useState<Canal>('ml')
  const [situacao, setSituacao] = useState<EstadoPerfume | 'todos'>('todos')
  const [busca, setBusca] = useState('')
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregarMarcas = useCallback(async () => {
    const ls = await todas<Linha>(() => supabase.from('anuncio_marcas').select('produto_id, canal, tipo, ml'))
    setManuais(ls.map((l) => paraMarca(l)))
  }, [])

  useEffect(() => {
    type P = { id: string; nome: string; estoque_atual: number; tipos_produto: { vende_decant: boolean } | null }
    Promise.all([
      todas<P>(() => supabase.from('produtos').select('id, nome, estoque_atual, tipos_produto(vende_decant)')),
      todas<{ produto_id: string; ml_restante: number }>(
        () => supabase.from('frascos_abertos').select('produto_id, ml_restante').eq('status', 'ativo')),
      supabase.from('anuncios_config').select('tamanhos_decant').eq('id', 1).maybeSingle(),
      todas<Linha>(() => supabase.from('anuncios').select('produto_id, tipo, ml').in('status', ['publicado', 'pausado'])),
      todas<Linha>(() => supabase.from('canal_vinculos').select('produto_id, canal, tipo, ml')),
      carregarMarcas(),
    ]).then(([p, f, c, a, v]) => {
      falhou(c)
      const aberto = new Map<string, number>()
      for (const x of f) {
        aberto.set(x.produto_id, Math.max(aberto.get(x.produto_id) ?? 0, Number(x.ml_restante)))
      }
      setProdutos(p.map((x) => ({
        id: x.id, nome: x.nome, estoque_atual: Number(x.estoque_atual),
        vende_decant: x.tipos_produto?.vende_decant ?? true, // sem tipo = produto antigo, é Perfume
        ml_aberto: aberto.get(x.id) ?? null,
      })))
      const tams = (c.data as { tamanhos_decant: number[] | null } | null)?.tamanhos_decant
      setTamanhos((tams ?? [2.5, 5, 10]).map(Number))
      setAutomaticas([
        ...a.map((l) => paraMarca(l, 'ml')),
        ...v.map((l) => paraMarca(l)),
      ])
    }).catch((e) => { setErro(e instanceof Error ? e.message : 'Erro inesperado'); setProdutos([]) })
  }, [carregarMarcas])

  const linhas = useMemo(
    () => filtrarLinhas(montarLinhas(produtos ?? [], canal, tamanhos, manuais, automaticas), situacao, busca),
    [produtos, canal, tamanhos, manuais, automaticas, situacao, busca],
  )

  async function gravar(fn: () => PromiseLike<{ error: { code?: string; message: string } | null }>) {
    setGravando(true); setErro(null)
    try {
      const r = await fn()
      if (r.error && r.error.code !== '23505') throw new Error(r.error.message) // 23505 = já marcada
      await carregarMarcas()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro inesperado') } finally { setGravando(false) }
  }

  const marcar = (produtoId: string, vs: Variante[]) =>
    gravar(() => {
      const rows = vs.map((v) => ({ produto_id: produtoId, canal, tipo: v.tipo, ml: v.ml }))
      return supabase.from('anuncio_marcas').insert(rows.length === 1 ? rows[0] : rows)
    })

  const desmarcar = (produtoId: string, c: Celula) =>
    gravar(() => {
      const q = supabase.from('anuncio_marcas').delete()
        .eq('produto_id', produtoId).eq('canal', canal).eq('tipo', c.tipo)
      return c.ml == null ? q.is('ml', null) : q.eq('ml', c.ml)
    })

  const colunas = [{ tipo: 'frasco', ml: null } as Variante, ...tamanhos.map((ml): Variante => ({ tipo: 'decant', ml }))]

  return (
    <div className="flex flex-col gap-6 stagger">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
            <span className="w-1 h-1 bg-gold rotate-45" />
            Anúncios / Controle
          </p>
          <h1 className="text-4xl tracking-tight mt-1.5">Controle</h1>
          <p className="text-sm text-muted mt-1">O que já está anunciado em cada plataforma, por perfume e variante.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <Select aria-label="Plataforma" options={PLATAFORMAS} value={canal} placeholder={false}
            onChange={(e) => setCanal(e.target.value as Canal)} />
          <Select aria-label="Situação" options={SITUACOES} value={situacao} placeholder={false}
            onChange={(e) => setSituacao(e.target.value as EstadoPerfume | 'todos')} />
          <Input aria-label="Buscar perfume" placeholder="Buscar perfume" value={busca}
            onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      {erro && <div role="alert" className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}
      {produtos === null && <p className="text-sm text-muted">Carregando...</p>}

      <div className="gold-hairline bg-surface border border-line rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-mono uppercase tracking-[.14em] text-muted">
              <th className="p-3 text-left">Perfume</th>
              {colunas.map((v) => <th key={nomeVariante(v)} className="p-3 text-center">{nomeVariante(v)}</th>)}
              <th className="p-3" /><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {produtos && !erro && linhas.length === 0 && (
              <tr className="border-t border-line">
                <td colSpan={colunas.length + 3} className="p-8 text-center text-sm text-muted">Nenhum perfume.</td>
              </tr>
            )}
            {linhas.map((l) => {
              const nome = l.produto.nome
              const faltam = paraMarcarTodas(l)
              const completo = l.estado === 'completo'
              return (
                <tr key={l.produto.id} className={cn('border-t border-line', completo && 'bg-gold/5')}>
                  <td className="p-3">{nome}</td>
                  {colunas.map((col) => {
                    const c = l.celulas.find((x) => x.tipo === col.tipo && x.ml === col.ml)
                    if (!c) return <td key={nomeVariante(col)} className="p-3 text-center text-faint">—</td>
                    const auto = c.estado === 'verde' && !c.manual
                    return (
                      <td key={nomeVariante(col)} className="p-3 text-center">
                        <button type="button"
                          aria-label={`${nome} ${nomeVariante(c)}: ${TEXTO[c.estado]}`}
                          title={auto ? 'vem do Horus' : undefined}
                          disabled={auto || gravando}
                          onClick={() => (c.estado === 'verde' ? desmarcar(l.produto.id, c) : marcar(l.produto.id, [c]))}
                          className={cn(
                            'inline-flex items-center justify-center w-7 h-7 rounded-full border cursor-pointer transition-colors',
                            'disabled:cursor-default', COR[c.estado], gravando && !auto && 'opacity-60',
                          )}
                        >
                          {c.estado === 'verde' && <Icon name="check" size={14} />}
                          {c.estado === 'vermelha' && <Icon name="x" size={14} />}
                        </button>
                      </td>
                    )
                  })}
                  <td className="p-3 text-right">
                    {faltam.length > 0 && (
                      <Button size="sm" variant="secondary" aria-label={`Marcar todas ${nome}`} disabled={gravando}
                        onClick={() => marcar(l.produto.id, faltam)}>Marcar todas</Button>
                    )}
                  </td>
                  <td className="p-3 text-center w-10">
                    {completo && <span title="Completo" className="text-gold"><Icon name="check" size={16} /></span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
