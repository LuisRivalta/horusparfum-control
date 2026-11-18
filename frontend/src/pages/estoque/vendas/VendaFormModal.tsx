import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { Icon } from '@/components/shared/Icon'
import { formatBRL } from '@/lib/utils'
import Decimal from 'decimal.js'
import { resumoVenda, type ItemVenda } from '@/lib/vendas'
import { custoInsumos, listaDoItem, listaEnvio, listasAtivas, somarItens, type ItemInsumo, type ListaDb, type ListaInsumos } from '@/lib/insumos'
import { aplicarDevolucoes, custoPrevistoOrigens, origemParaJson, planejarDecants, totalOrigens, type Devolucao, type Origem } from '@/lib/decantOrigens'
import { vendeDecant, type TipoProduto } from '@/lib/tipos'
import { linhasDoPedido, type PedidoCanal } from '@/lib/canais'
import { InsumosVenda, type GrupoInsumos, type InsumoOpt } from './InsumosVenda'

export interface Canal { id: string; nome: string; taxa_padrao: number; usa_envio: boolean }
export interface ProdutoOpt { id: string; nome: string; estoque_atual: number; custo_medio: number | null; preco_referencia: number | null; volume_ml: number | null; tipo_id?: string | null }
export interface FrascoOpt { id: string; produto_id: string; ml_restante: number; ml_total: number; status?: string; produtos: { nome: string; custo_medio: number | null } | null }

export interface LinhaForm {
  tipo: 'produto' | 'decant'
  produto_id: string
  frasco_id: string
  ml: string
  quantidade: string
  preco: string
  custo_unitario: string
  custo_embalagem: string      // só venda antiga sem insumos gravados; '0' nas demais
  decant_id: string            // decant gravado e ainda inalterado (edição)
  origens: Origem[] | null     // null = planejadas a partir do frasco escolhido
  legado?: boolean             // decant antigo sem decant_origens
  insumos: ItemInsumo[] | null // null = lista padrão do item
}

interface OrigemDb { decant_id: string; frasco_id: string | null; produto_id: string; ml: number; abriu_frasco: boolean }
interface ConsumoDb { decant_id: string | null; insumo_id: string; quantidade: number }

type ItemPayload = {
  tipo: 'produto' | 'decant'
  produto_id?: string
  frasco_id: string | null
  ml: number | null
  quantidade: number
  preco_unitario: number
  custo_unitario?: number
  custo_embalagem?: number
  decant_id?: string
  origens?: ReturnType<typeof origemParaJson>[]
  insumos?: { insumo_id: string; quantidade: number }[]
}

const fmtMl = (n: number) => String(n).replace('.', ',')
const RESET_ITEM = { origens: null, decant_id: '', insumos: null, custo_embalagem: '0' } as const

// Reparte o consumo gravado entre os pedidos (na ordem); o que sobra é devolvido em resto.
function repartir(pool: ItemInsumo[], pedidos: ItemInsumo[][]) {
  const saldo = new Map(pool.map((i) => [i.insumoId, new Decimal(i.quantidade)]))
  const partes = pedidos.map((ped) => ped.flatMap((i) => {
    const q = Decimal.min(i.quantidade, saldo.get(i.insumoId) ?? 0)
    if (q.lte(0)) return []
    saldo.set(i.insumoId, saldo.get(i.insumoId)!.sub(q))
    return [{ insumoId: i.insumoId, quantidade: q.toNumber() }]
  }))
  const resto = [...saldo].filter(([, q]) => q.gt(0)).map(([insumoId, q]) => ({ insumoId, quantidade: q.toNumber() }))
  return { partes, resto }
}

export interface VendaFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  vendaId?: string
  onClose: () => void
  onSaved: () => void
  pedido?: PedidoCanal // create: confirma o pedido do canal (confirmar_pedido_canal)
}

const SEM_CANAL_SHOPIFY = 'Cadastre o canal "Shopify" em Canais e embalagens para confirmar pedidos'

// data local (YYYY-MM-DD) do instante do pedido
function dataLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

const LINHA_VAZIA: LinhaForm = {
  tipo: 'produto', produto_id: '', frasco_id: '', ml: '5', quantidade: '1', preco: '', custo_unitario: '', ...RESET_ITEM,
}

export function VendaFormModal({ open, mode, vendaId, onClose, onSaved, pedido }: VendaFormModalProps) {
  const { user } = useAuth()
  const [canais, setCanais] = useState<Canal[]>([])
  const [produtos, setProdutos] = useState<ProdutoOpt[]>([])
  const [tipos, setTipos] = useState<TipoProduto[]>([])
  const [frascos, setFrascos] = useState<FrascoOpt[]>([])
  const [listas, setListas] = useState<ListaInsumos[]>([])
  const [insumos, setInsumos] = useState<InsumoOpt[]>([])
  const [insumosEnvio, setInsumosEnvio] = useState<ItemInsumo[] | null>(null) // null = lista de envio do canal
  const [completando, setCompletando] = useState<number | null>(null)
  // edição: ml que o cancelamento da venda devolve aos frascos (decantId null = item antigo sem decant)
  const [devolucoes, setDevolucoes] = useState<(Devolucao & { decantId: string | null })[]>([])
  // edição: lacrados que o cancelamento devolve (itens de produto gravados), por produto
  const [lacradosDevolvidos, setLacradosDevolvidos] = useState<Record<string, number>>({})

  const [titulo, setTitulo] = useState('')
  const [canalId, setCanalId] = useState('')
  const [dataVenda, setDataVenda] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [cliente, setCliente] = useState('')
  const [taxa, setTaxa] = useState('')
  const [frete, setFrete] = useState('')
  const [vendaNumero, setVendaNumero] = useState<number | null>(null)
  const [linhas, setLinhas] = useState<LinhaForm[]>([{ ...LINHA_VAZIA }])
  const [submitting, setSubmitting] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setErro(null)
    setSubmitting(false)
    setCompletando(null)
    setInsumosEnvio(null)
    setDevolucoes([])
    setLacradosDevolvidos({})

    const base = Promise.all([
      supabase.from('canais').select('id, nome, taxa_padrao, usa_envio').eq('ativo', true).order('nome'),
      supabase.from('produtos').select('id, nome, estoque_atual, custo_medio, preco_referencia, volume_ml, tipo_id').order('nome'),
      supabase.from('frascos_abertos').select('id, produto_id, ml_restante, ml_total, status, produtos(nome, custo_medio)').eq('status', 'ativo'),
      supabase.from('insumo_listas').select('tipo, tamanho_ml, insumo_lista_itens(insumo_id, quantidade)'),
      supabase.from('insumos').select('id, nome, custo_medio, ativo').order('nome'),
      supabase.from('tipos_produto').select('id, vende_decant'),
    ]).then(([c, p, f, l, ins, tp]) => {
      const listasData = listasAtivas((l.data as ListaDb[]) || [], (ins.data as InsumoOpt[]) || [])
      const prodsData = (p.data as ProdutoOpt[]) || []
      setCanais((c.data as Canal[]) || [])
      setProdutos(prodsData)
      setTipos((tp.data as TipoProduto[]) || [])
      setListas(listasData)
      setInsumos((ins.data as InsumoOpt[]) || [])
      return { prodsData, listasData, frascosData: (f.data as unknown as FrascoOpt[]) || [], canaisData: (c.data as Canal[]) || [] }
    })

    if (mode === 'create') {
      setTitulo(''); setCanalId(''); setDataVenda(''); setFormaPagamento(''); setCliente('')
      setTaxa(''); setFrete(''); setVendaNumero(null); setLinhas([{ ...LINHA_VAZIA }])
      base.then(({ frascosData, canaisData }) => {
        setFrascos(frascosData)
        if (!pedido) return
        // decant: frasco aberto ativo do perfume; sem ele a linha fica sem frasco para escolher na tela
        const novas: LinhaForm[] = linhasDoPedido(pedido).map(l => ({
          ...LINHA_VAZIA, ...l,
          frasco_id: l.tipo === 'decant' ? frascosData.find(f => f.produto_id === l.produto_id && (f.status ?? 'ativo') === 'ativo')?.id ?? '' : '',
        }))
        const shopify = canaisData.find(c => c.nome === 'Shopify')
        const bruto = novas.reduce((s, l) => s.add(new Decimal(Number(l.preco) || 0).mul(Number(l.quantidade) || 0)), new Decimal(0))
        setTitulo(`Shopify ${pedido.numero ?? pedido.externo_id}`)
        setDataVenda(dataLocal(pedido.criado_em))
        setCliente(pedido.cliente ?? '')
        setFrete('0')
        setLinhas(novas.length > 0 ? novas : [{ ...LINHA_VAZIA }])
        if (!shopify) { setErro(SEM_CANAL_SHOPIFY); return }
        setCanalId(shopify.id)
        // mesma regra do onCanalChange (taxa vazia + canal escolhido)
        if (bruto.gt(0)) setTaxa(bruto.mul(shopify.taxa_padrao).div(100).toFixed(2))
      })
    } else if (mode === 'edit' && vendaId) {
      setLoadingData(true)
      Promise.all([
        base,
        supabase.from('vendas').select('*').eq('id', vendaId).single(),
        supabase.from('venda_itens').select('*').eq('venda_id', vendaId),
        supabase.from('insumo_movimentacoes').select('decant_id, insumo_id, quantidade').eq('venda_id', vendaId).eq('tipo', 'consumo'),
      ]).then(async ([{ prodsData, listasData, frascosData: ativos }, vRes, viRes, movRes]) => {
        let frascosData = ativos

        if (vRes.error || !vRes.data) {
          setErro(vRes.error?.message || 'Venda não encontrada')
          setLoadingData(false)
          return
        }

        const v = vRes.data
        setVendaNumero(v.numero)
        setTitulo(v.titulo || '')
        setCanalId(v.canal_id || '')
        setDataVenda(v.data_venda || '')
        setFormaPagamento(v.forma_pagamento || '')
        setCliente(v.cliente || '')
        setTaxa(v.taxa_total != null ? String(v.taxa_total) : '')
        setFrete(v.frete != null ? String(v.frete) : '')

        const viItems = viRes.data || []
        const decantIds = viItems.map(i => i.decant_id).filter(Boolean) as string[]
        const origensDb: OrigemDb[] = decantIds.length > 0
          ? ((await supabase.from('decant_origens').select('decant_id, frasco_id, produto_id, ml, abriu_frasco').in('decant_id', decantIds)).data as OrigemDb[]) || []
          : []

        // frascos da venda que não estão ativos (esgotados ou já abertos por ela): precisa do estado deles
        const decantFrascoIds = [
          ...viItems.filter(i => i.tipo === 'decant' && i.frasco_id).map(i => i.frasco_id as string),
          ...origensDb.map(o => o.frasco_id).filter(Boolean) as string[],
        ]
        const missingFrascoIds = [...new Set(decantFrascoIds)].filter(id => !frascosData.some(fr => fr.id === id))
        if (missingFrascoIds.length > 0) {
          const { data: extraFrascos } = await supabase
            .from('frascos_abertos')
            .select('id, produto_id, ml_restante, ml_total, status, produtos(nome, custo_medio)')
            .in('id', missingFrascoIds)
          if (extraFrascos && extraFrascos.length > 0) {
            frascosData = [...frascosData, ...(extraFrascos as unknown as FrascoOpt[])]
          }
        }
        setFrascos(frascosData)

        // mesma regra e ordem do cancelar_venda/_devolver_origens
        const mlTotalItem = (i: { ml: number | null; quantidade: number | null }) => new Decimal(Number(i.ml) || 0).mul(Number(i.quantidade) || 1).toNumber()
        setDevolucoes(viItems.filter(i => i.tipo === 'decant').flatMap((i): (Devolucao & { decantId: string | null })[] => {
          if (!i.decant_id) return i.frasco_id ? [{ decantId: null, frascoId: i.frasco_id, ml: mlTotalItem(i), semTeto: true }] : []
          const doDecant = origensDb.filter(o => o.decant_id === i.decant_id && o.frasco_id)
          if (doDecant.length > 0) return doDecant.map(o => ({ decantId: i.decant_id as string, frascoId: o.frasco_id as string, ml: Number(o.ml) }))
          return i.frasco_id ? [{ decantId: i.decant_id as string, frascoId: i.frasco_id, ml: mlTotalItem(i) }] : []
        }))

        // consumo gravado: o do decant é do item; o resto vai primeiro aos itens de produto e o que sobra é envio
        const consumo = ((movRes.data as ConsumoDb[]) || []).map(m => ({ decantId: m.decant_id, insumoId: m.insumo_id, quantidade: -Number(m.quantidade) }))
        const semDecant = somarItens(consumo.filter(m => !m.decantId))
        const produtosItens = viItems.filter(i => i.tipo !== 'decant')
        const devolvidos: Record<string, number> = {}
        for (const i of produtosItens) devolvidos[i.produto_id] = (devolvidos[i.produto_id] ?? 0) + (Number(i.quantidade) || 0)
        setLacradosDevolvidos(devolvidos)
        const { partes, resto } = repartir(semDecant, produtosItens.map(i => listaDoItem(listasData, 'produto', null, Number(i.quantidade) || 1)))
        setInsumosEnvio(resto)

        if (viItems.length > 0) {
          const novassLinhas: LinhaForm[] = viItems.map(item => {
            const qtd = Number(item.quantidade) || 1
            if (item.tipo === 'decant') {
              const doDecant = origensDb.filter(o => o.decant_id === item.decant_id)
              const origens: Origem[] = doDecant.length > 0
                ? doDecant.map((o): Origem => o.abriu_frasco
                  ? { tipo: 'abrir', produtoId: o.produto_id, ml: Number(o.ml) }
                  // frasco apagado: frascoId '' vai como frasco_id null e o decant segue inalterado
                  : { tipo: 'frasco', frascoId: o.frasco_id ?? '', produtoId: o.produto_id, ml: Number(o.ml) })
                : [{ tipo: 'frasco', frascoId: item.frasco_id || '', produtoId: item.produto_id, ml: new Decimal(Number(item.ml) || 0).mul(qtd).toNumber() }]
              return {
                tipo: 'decant',
                produto_id: '',
                frasco_id: item.frasco_id || '',
                ml: item.ml != null ? String(Number(item.ml)) : '5',
                quantidade: String(qtd),
                preco: item.preco_unitario != null ? String(item.preco_unitario) : '',
                custo_unitario: item.custo_unitario != null ? String(item.custo_unitario) : '',
                custo_embalagem: item.custo_embalagem != null ? String(item.custo_embalagem) : '0',
                decant_id: item.decant_id || '',
                origens,
                legado: doDecant.length === 0,
                insumos: item.decant_id ? somarItens(consumo.filter(m => m.decantId === item.decant_id)) : [],
              }
            } else {
              const pObj = prodsData.find(pr => pr.id === item.produto_id)
              return {
                tipo: 'produto',
                produto_id: item.produto_id || '',
                frasco_id: '',
                ml: '5',
                quantidade: String(qtd),
                preco: item.preco_unitario != null ? String(item.preco_unitario) : '',
                custo_unitario: item.custo_unitario != null ? String(item.custo_unitario) : (pObj?.custo_medio != null ? String(pObj.custo_medio) : '0'),
                custo_embalagem: item.custo_embalagem != null ? String(item.custo_embalagem) : '0',
                decant_id: '',
                origens: null,
                insumos: partes[produtosItens.indexOf(item)],
              }
            }
          })
          setLinhas(novassLinhas)
        } else {
          setLinhas([{ ...LINHA_VAZIA }])
        }

        setLoadingData(false)
      })
    }
  }, [open, mode, vendaId, pedido])

  function setLinha(index: number, patch: Partial<LinhaForm>) {
    setLinhas(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function brutoTotal(): number {
    return linhas.reduce((acc, l) => acc + (Number(l.preco) || 0) * (Number(l.quantidade) || 0), 0)
  }

  function onCanalChange(id: string) {
    setCanalId(id)
    setInsumosEnvio(null)
    const canal = canais.find(c => c.id === id)
    if (canal && taxa === '') {
      const bruto = brutoTotal()
      if (bruto > 0) setTaxa(((bruto * canal.taxa_padrao) / 100).toFixed(2))
    }
  }

  const custoPorInsumo = Object.fromEntries(insumos.map(i => [i.id, Number(i.custo_medio)]))
  const custoMedioPorProduto = Object.fromEntries(produtos.map(p => [p.id, p.custo_medio ?? 0]))
  const volumePorProduto = Object.fromEntries(produtos.map(p => [p.id, Number(p.volume_ml) || 0]))
  const nomeProduto = (id: string) => produtos.find(p => p.id === id)?.nome ?? 'outro perfume'
  const selecionada = (l: LinhaForm) => Boolean(l.tipo === 'produto' ? l.produto_id : l.frasco_id)

  function mlNecessario(l: LinhaForm): number {
    return new Decimal(Number(l.ml) || 0).mul(Number(l.quantidade) || 0).toNumber()
  }

  // Origens gravadas/completadas, ou o caminho padrão: frasco aberto e depois um lacrado.
  // Sem caminho padrão, fica o que o frasco aberto cobre (falta o resto).
  // Frascos como a RPC os verá: na edição, com os ml devolvidos pelos decants da venda que não ficam como estão;
  // as linhas são planejadas na ordem, cada uma vendo o que as anteriores (e os itens de produto) já usaram.
  const frascosRpc = aplicarDevolucoes(
    frascos.map(f => ({ id: f.id, produtoId: f.produto_id, mlRestante: Number(f.ml_restante), mlTotal: Number(f.ml_total), ativo: (f.status ?? 'ativo') === 'ativo' })),
    devolucoes.filter(d => !d.decantId || !linhas.some(l => l.decant_id === d.decantId)),
  )
  const lacrados: Record<string, number> = {}
  for (const p of produtos) lacrados[p.id] = (Number(p.estoque_atual) || 0) + (lacradosDevolvidos[p.id] ?? 0)
  for (const l of linhas) if (l.tipo === 'produto' && l.produto_id) lacrados[l.produto_id] = (lacrados[l.produto_id] ?? 0) - (Number(l.quantidade) || 0)
  // só tipos que vendem em decant têm lacrado para abrir; produtos de outro tipo ficam fora das origens
  const lacradosDecant = { ...lacrados }
  for (const p of produtos) if (!vendeDecant(p, tipos)) lacradosDecant[p.id] = 0
  const planos = planejarDecants(frascosRpc, lacradosDecant, volumePorProduto, linhas.map(l => l.tipo === 'decant'
    ? { frascoId: l.frasco_id, ml: mlNecessario(l), origens: l.origens, jaConsumido: Boolean(l.decant_id) }
    : { frascoId: '', ml: 0, origens: [] }))
  const plano = (l: LinhaForm) => planos[linhas.indexOf(l)]
  const frascoDaLinha = (l: LinhaForm) => plano(l).frasco
  const origensDaLinha = (l: LinhaForm): Origem[] => plano(l).origens

  function faltaMl(l: LinhaForm): number {
    return new Decimal(mlNecessario(l)).sub(totalOrigens(origensDaLinha(l))).toNumber()
  }

  function descreverOrigens(l: LinhaForm): string {
    const origens = origensDaLinha(l)
    const produtoLinha = frascos.find(x => x.id === l.frasco_id)?.produto_id ?? origens[0]?.produtoId
    if (origens.length === 1 && origens[0].tipo === 'frasco' && origens[0].produtoId === produtoLinha) return 'do frasco aberto'
    return origens.map(o => o.tipo === 'abrir'
      ? `abrir 1 lacrado (${fmtMl(o.ml)} ml)`
      : o.produtoId === produtoLinha ? `${fmtMl(o.ml)} ml do aberto` : `${fmtMl(o.ml)} ml de ${nomeProduto(o.produtoId)}`,
    ).join(' + ')
  }

  function completarCom(i: number, frascoId: string) {
    const l = linhas[i]
    const f = plano(l).frascos.find(x => x.id === frascoId)
    if (!f) return
    const ml = Decimal.min(faltaMl(l), f.mlRestante).toNumber()
    setLinha(i, { origens: [...origensDaLinha(l), { tipo: 'frasco', frascoId: f.id, produtoId: f.produtoId, ml }] })
    setCompletando(null)
  }

  function insumosDaLinha(l: LinhaForm): ItemInsumo[] {
    return l.insumos ?? listaDoItem(listas, l.tipo, l.tipo === 'decant' ? Number(l.ml) : null, Number(l.quantidade) || 0)
  }

  // venda antiga, sem insumos gravados: mantém o custo de embalagem que já tinha
  const embalagemLegada = (l: LinhaForm) => l.insumos !== null && l.insumos.length === 0 && Number(l.custo_embalagem) > 0

  const canalAtual = canais.find(c => c.id === canalId)
  const itensEnvio = insumosEnvio
    ?? listaEnvio(listas, linhas.filter(selecionada).map(l => l.tipo), canalAtual?.usa_envio ?? false)
  const custoEnvio = custoInsumos(itensEnvio, custoPorInsumo)

  function custoUnitarioDaLinha(l: LinhaForm): number {
    if (l.tipo === 'decant') {
      if (l.decant_id && l.custo_unitario !== '') return Number(l.custo_unitario) || 0
      const qtd = Number(l.quantidade) || 0
      return qtd > 0 ? new Decimal(custoPrevistoOrigens(origensDaLinha(l), custoMedioPorProduto, volumePorProduto)).div(qtd).toNumber() : 0
    }
    if (l.custo_unitario !== '' && !isNaN(Number(l.custo_unitario)) && Number(l.custo_unitario) >= 0) {
      return Number(l.custo_unitario)
    }
    return produtos.find(x => x.id === l.produto_id)?.custo_medio ?? 0
  }

  function linhaParaItem(l: LinhaForm): ItemVenda {
    const qtd = Number(l.quantidade) || 0
    return {
      tipo: l.tipo,
      quantidade: qtd,
      precoUnitario: Number(l.preco) || 0,
      custoUnitario: custoUnitarioDaLinha(l),
      custoEmbalagem: embalagemLegada(l)
        ? Number(l.custo_embalagem)
        : qtd > 0 ? new Decimal(custoInsumos(insumosDaLinha(l), custoPorInsumo)).div(qtd).toNumber() : 0,
    }
  }

  const itensPreview = linhas
    .filter(l => selecionada(l) && l.preco !== '' && Number(l.preco) >= 0)
    .map(linhaParaItem)
  // envio entra como custo da venda (igual ao lucro_bruto da RPC)
  const resumo = resumoVenda(
    custoEnvio > 0 ? [...itensPreview, { tipo: 'produto', quantidade: 1, precoUnitario: 0, custoUnitario: custoEnvio, custoEmbalagem: 0 }] : itensPreview,
    Number(taxa) || 0, Number(frete) || 0,
  )
  const taxaPct = resumo.totalBruto > 0 ? ((Number(taxa) || 0) / resumo.totalBruto) * 100 : 0

  function estoqueDisponivel(l: LinhaForm): string {
    if (l.tipo === 'produto') {
      const p = produtos.find(x => x.id === l.produto_id)
      return p ? `${p.estoque_atual} un.` : ''
    }
    const f = frascos.find(x => x.id === l.frasco_id)
    return f ? `${fmtMl(Number(f.ml_restante))} ml` : ''
  }

  const insumosJson = (itens: ItemInsumo[]) =>
    itens.filter(i => i.quantidade > 0).map(i => ({ insumo_id: i.insumoId, quantidade: i.quantidade }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setErro(null)
    if (pedido && !canais.some(c => c.nome === 'Shopify')) { setErro(SEM_CANAL_SHOPIFY); return }
    if (!canalId) { setErro('Selecione o canal'); return }
    const validas = linhas.filter(l =>
      selecionada(l) && Number(l.quantidade) >= 1 && Number(l.preco) >= 0 && l.preco !== ''
    )
    if (validas.length === 0) { setErro('Adicione ao menos um item válido (produto/frasco e preço)'); return }
    if (validas.length !== linhas.filter(l => l.produto_id || l.frasco_id || l.preco).length) {
      setErro('Há linhas incompletas — preencha produto/frasco e preço, ou remova a linha'); return
    }
    if (validas.some(l => l.tipo === 'decant' && faltaMl(l) !== 0)) {
      setErro('As origens do decant não somam o ml do item: complete com outro perfume ou ajuste o ml'); return
    }

    // decant: sem custo_unitario (a RPC calcula pelas origens); insumos viram custo_embalagem na RPC
    const itensPayload: ItemPayload[] = validas.map(l => {
      const insumosOuEmb = embalagemLegada(l)
        ? { custo_embalagem: Number(l.custo_embalagem) }
        : { insumos: insumosJson(insumosDaLinha(l)) }
      const comum = { quantidade: Number(l.quantidade), preco_unitario: Number(l.preco) || 0, ...insumosOuEmb }
      if (l.tipo === 'produto') {
        return { tipo: 'produto', produto_id: l.produto_id, frasco_id: null, ml: null, custo_unitario: Number(l.custo_unitario) || 0, ...comum }
      }
      const origens = origensDaLinha(l)
      return {
        tipo: 'decant',
        produto_id: frascos.find(f => f.id === l.frasco_id)?.produto_id ?? origens[0]?.produtoId,
        frasco_id: l.frasco_id,
        ml: Number(l.ml),
        ...comum,
        ...(l.decant_id ? { decant_id: l.decant_id } : {}),
        // decant antigo inalterado vai sem origens: a RPC compara pelo frasco_id e o mantém
        ...(l.decant_id && l.legado ? {} : { origens: origens.map(origemParaJson) }),
      }
    })
    const insumosEnvioPayload = insumosJson(itensEnvio)

    setSubmitting(true)
    let res: { error: { message: string; code?: string } | null }

    if (mode === 'edit' && vendaId) {
      res = await supabase.rpc('editar_venda', {
        p_venda_id: vendaId,
        p_canal_id: canalId,
        p_data_venda: dataVenda || null,
        p_forma_pagamento: formaPagamento || null,
        p_cliente: cliente || null,
        p_taxa_total: Number(taxa) || 0,
        p_frete: Number(frete) || 0,
        p_responsavel: user?.email || null,
        p_observacao: null,
        p_itens: itensPayload,
        p_insumos_envio: insumosEnvioPayload,
        p_titulo: titulo || null,
      })

      // só a RPC ausente no schema (PostgREST PGRST202); erro de verdade do Postgres não cai no fallback
      const isRpcMissing = res.error?.code === 'PGRST202'

      if (isRpcMissing) {
        try {
          await supabase.rpc('cancelar_venda', { p_venda_id: vendaId })
          await supabase.from('transacoes').delete().eq('venda_id', vendaId)

          const { data: oldItens } = await supabase.from('venda_itens').select('decant_id').eq('venda_id', vendaId)
          if (oldItens && oldItens.length > 0) {
            const decantIds = oldItens.map((i) => i.decant_id).filter(Boolean) as string[]
            if (decantIds.length > 0) {
              await supabase.from('venda_itens').update({ decant_id: null }).eq('venda_id', vendaId)
              await supabase.from('decants').delete().in('id', decantIds)
            }
          }
          await supabase.from('venda_itens').delete().eq('venda_id', vendaId)

          let totalBrutoAcc = 0
          let totalCustoAcc = 0
          const itemIds: string[] = []
          const brutos: number[] = []

          for (const item of itensPayload) {
            let decantId: string | null = null
            let custoUnit = item.custo_unitario || 0

            if (item.tipo === 'produto' && item.produto_id) {
              const { data: prod } = await supabase.from('produtos').select('estoque_atual, custo_medio').eq('id', item.produto_id).single()
              if (prod) {
                const novoEstoque = Math.max(0, (prod.estoque_atual || 0) - item.quantidade)
                if (!item.custo_unitario) custoUnit = prod.custo_medio || 0
                await supabase.from('produtos').update({ estoque_atual: novoEstoque }).eq('id', item.produto_id)
                await supabase.from('movimentacoes').insert({
                  produto_id: item.produto_id,
                  tipo: 'saida',
                  quantidade: item.quantidade,
                  motivo: titulo || `Edição Venda #${vendaNumero || ''}`,
                  responsavel: user?.email || null,
                  saldo_resultante: novoEstoque,
                })
              }
            } else if (item.tipo === 'decant' && item.frasco_id) {
              const { data: frasco } = await supabase.from('frascos_abertos').select('id, produto_id, ml_restante, ml_total, produtos(custo_medio)').eq('id', item.frasco_id).single()
              if (frasco) {
                const totalMlNeeded = (item.ml || 0) * item.quantidade
                const novoMl = Math.max(0, (frasco.ml_restante || 0) - totalMlNeeded)
                await supabase.from('frascos_abertos').update({
                  ml_restante: novoMl,
                  status: novoMl <= 0 ? 'esgotado' : 'ativo',
                }).eq('id', item.frasco_id)

                const { data: newDecant } = await supabase.from('decants').insert({
                  frasco_id: item.frasco_id,
                  produto_id: frasco.produto_id,
                  ml: totalMlNeeded,
                }).select('id').single()
                if (newDecant) decantId = newDecant.id
              }
            }

            const itemBruto = Number((item.preco_unitario * item.quantidade).toFixed(2))
            const itemCusto = Number(((custoUnit + (item.custo_embalagem ?? 0)) * item.quantidade).toFixed(2))
            totalBrutoAcc += itemBruto
            totalCustoAcc += itemCusto

            const { data: insertedItem } = await supabase.from('venda_itens').insert({
              venda_id: vendaId,
              tipo: item.tipo,
              produto_id: item.produto_id,
              frasco_id: item.frasco_id,
              decant_id: decantId,
              ml: item.ml,
              quantidade: item.quantidade,
              preco_unitario: item.preco_unitario,
              custo_unitario: custoUnit,
              custo_embalagem: item.custo_embalagem ?? 0,
            }).select('id').single()

            if (insertedItem) {
              itemIds.push(insertedItem.id)
              brutos.push(itemBruto)
            }
          }

          const taxaVal = Number(taxa) || 0
          const freteVal = Number(frete) || 0
          let taxaAcc = 0
          let freteAcc = 0

          for (let idx = 0; idx < itemIds.length; idx++) {
            let tRateada = 0
            let fRateado = 0
            if (idx < itemIds.length - 1) {
              tRateada = totalBrutoAcc > 0 ? Number(((taxaVal * brutos[idx]) / totalBrutoAcc).toFixed(2)) : 0
              fRateado = totalBrutoAcc > 0 ? Number(((freteVal * brutos[idx]) / totalBrutoAcc).toFixed(2)) : 0
              taxaAcc += tRateada
              freteAcc += fRateado
            } else {
              tRateada = Number((taxaVal - taxaAcc).toFixed(2))
              fRateado = Number((freteVal - freteAcc).toFixed(2))
            }

            const { data: ci } = await supabase.from('venda_itens').select('custo_unitario, custo_embalagem, quantidade').eq('id', itemIds[idx]).single()
            const cUnit = ci?.custo_unitario || 0
            const cEmb = ci?.custo_embalagem || 0
            const q = ci?.quantidade || 1
            const itemLucro = Number((brutos[idx] - tRateada - fRateado - (cUnit + cEmb) * q).toFixed(2))

            await supabase.from('venda_itens').update({
              taxa_rateada: tRateada,
              frete_rateado: fRateado,
              lucro: itemLucro,
            }).eq('id', itemIds[idx])
          }

          const lucroBrutoTotal = Number((totalBrutoAcc - taxaVal - freteVal - totalCustoAcc).toFixed(2))
          await supabase.from('vendas').update({
            canal_id: canalId,
            data_venda: dataVenda || null,
            forma_pagamento: formaPagamento || null,
            cliente: cliente || null,
            taxa_total: taxaVal,
            frete: freteVal,
            responsavel: user?.email || null,
            observacao: null,
            titulo: titulo || null,
            total_bruto: totalBrutoAcc,
            total_custo: totalCustoAcc,
            lucro_bruto: lucroBrutoTotal,
            status: 'concluida',
          }).eq('id', vendaId)

          const nomeVenda = titulo || `Venda #${vendaNumero || ''}`
          await supabase.from('transacoes').insert({
            descricao: nomeVenda,
            tipo: 'entrada',
            valor: totalBrutoAcc,
            categoria: 'Vendas',
            forma_pagamento: formaPagamento || null,
            responsavel: user?.email || null,
            origem: 'venda',
            venda_id: vendaId,
          })
          if (taxaVal > 0) {
            await supabase.from('transacoes').insert({
              descricao: `Taxa — ${nomeVenda}`,
              tipo: 'saida',
              valor: taxaVal,
              categoria: 'Taxas marketplace',
              forma_pagamento: formaPagamento || null,
              responsavel: user?.email || null,
              origem: 'venda',
              venda_id: vendaId,
            })
          }
          if (freteVal > 0) {
            await supabase.from('transacoes').insert({
              descricao: `Frete — ${nomeVenda}`,
              tipo: 'saida',
              valor: freteVal,
              categoria: 'Frete',
              forma_pagamento: formaPagamento || null,
              responsavel: user?.email || null,
              origem: 'venda',
              venda_id: vendaId,
            })
          }

          res = { error: null }
        } catch (fallbackErr: unknown) {
          const msg = fallbackErr instanceof Error ? fallbackErr.message : 'Erro ao salvar venda'
          res = { error: { message: msg } }
        }
      }
    } else {
      res = await supabase.rpc(pedido ? 'confirmar_pedido_canal' : 'registrar_venda', {
        ...(pedido ? { p_pedido_id: pedido.id } : {}),
        p_canal_id: canalId,
        p_data_venda: dataVenda || null,
        p_forma_pagamento: formaPagamento || null,
        p_cliente: cliente || null,
        p_taxa_total: Number(taxa) || 0,
        p_frete: Number(frete) || 0,
        p_responsavel: user?.email || null,
        p_observacao: null,
        p_itens: itensPayload,
        p_insumos_envio: insumosEnvioPayload,
        p_titulo: titulo || null,
      })
    }

    setSubmitting(false)
    if (res.error) {
      setErro(res.error.message)
      return
    }
    onSaved()
    onClose()
  }

  const tamanhosDecant = [...new Set(listas.filter(x => x.tipo === 'decant' && x.tamanhoMl != null).map(x => x.tamanhoMl as number))]
    .sort((a, b) => a - b)
  const gruposInsumos: GrupoInsumos[] = [
    ...linhas.flatMap((l, i) => selecionada(l) ? [{
      chave: String(i),
      rotulo: `Item ${i + 1}`,
      titulo: `Item ${i + 1} · ${l.tipo === 'decant' ? `Decant ${fmtMl(Number(l.ml))} ml` : nomeProduto(l.produto_id)}`,
      itens: insumosDaLinha(l),
    }] : []),
    ...(canalAtual?.usa_envio || itensEnvio.length > 0 ? [{ chave: 'envio', rotulo: 'Envio', titulo: 'Envio', itens: itensEnvio }] : []),
  ]

  const modalTitle = mode === 'edit'
    ? (vendaNumero != null ? `Editar venda #${vendaNumero}` : 'Editar venda')
    : pedido ? `Confirmar pedido Shopify ${pedido.numero ?? ''}`.trim() : 'Nova venda'

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} size="lg">
      {loadingData ? (
        <div className="p-8 text-center text-muted">Carregando dados da venda...</div>
      ) : (
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nome da venda (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Venda para Gustavo" />
            <Input label="Data da venda" type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Canal"
              options={canais.map(c => ({ value: c.id, label: `${c.nome} (${c.taxa_padrao}%)` }))}
              value={canalId}
              onChange={(e) => onCanalChange(e.target.value)}
              required
            />
            <Input label="Cliente (opcional)" value={cliente} onChange={(e) => setCliente(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Forma de pagamento" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} placeholder="Pix, Cartão…" />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-[.08em] text-muted">Itens</span>

            {linhas.map((l, i) => (
              <div key={i} className="flex flex-col gap-2 p-3 border border-line rounded-lg">
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                  <Select
                    label="Tipo"
                    options={[{ value: 'produto', label: 'Produto (frasco cheio)' }, { value: 'decant', label: 'Decant' }]}
                    value={l.tipo}
                    onChange={(e) => setLinha(i, { tipo: e.target.value as 'produto' | 'decant', produto_id: '', frasco_id: '', custo_unitario: '', ...RESET_ITEM })}
                  />
                  <span className="text-xs text-muted pb-2.5 ml-auto">{estoqueDisponivel(l)}</span>
                  <button
                    type="button"
                    onClick={() => { setCompletando(null); setLinhas(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev) }}
                    className="pb-2.5 text-muted hover:text-down cursor-pointer"
                    title="Remover item"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>

                {l.tipo === 'produto' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_65px_95px_95px] gap-2 items-end">
                    <Select
                      label="Produto"
                      options={produtos.map(p => ({ value: p.id, label: p.nome }))}
                      value={l.produto_id}
                      onChange={(e) => {
                        const p = produtos.find(x => x.id === e.target.value)
                        setLinha(i, {
                          produto_id: e.target.value,
                          preco: l.preco || (p?.preco_referencia != null ? String(p.preco_referencia) : ''),
                          custo_unitario: p?.custo_medio != null ? String(p.custo_medio) : (l.custo_unitario || '0'),
                        })
                      }}
                    />
                    <Input label="Qtd" type="number" min="1" value={l.quantidade} onChange={(e) => setLinha(i, { quantidade: e.target.value, ...RESET_ITEM })} />
                    <Input label="Custo un." type="number" step="0.01" min="0" value={l.custo_unitario} onChange={(e) => setLinha(i, { custo_unitario: e.target.value })} placeholder="0.00" />
                    <Input label="Preço un." type="number" step="0.01" min="0" value={l.preco} onChange={(e) => setLinha(i, { preco: e.target.value })} placeholder="0.00" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px_60px_95px] gap-2 items-end">
                    <Select
                      label="Frasco aberto"
                      options={frascos.map(f => ({ value: f.id, label: `${f.produtos?.nome} (${fmtMl(Number(f.ml_restante))}ml)` }))}
                      value={l.frasco_id}
                      onChange={(e) => setLinha(i, { frasco_id: e.target.value, origens: null, decant_id: '' })}
                    />
                    <Select
                      label="ml"
                      options={(!l.ml || tamanhosDecant.includes(Number(l.ml)) ? tamanhosDecant : [...tamanhosDecant, Number(l.ml)])
                        .map(t => ({ value: String(t), label: `${fmtMl(t)} ml` }))}
                      value={l.ml}
                      onChange={(e) => setLinha(i, { ml: e.target.value, ...RESET_ITEM })}
                    />
                    <Input label="Qtd" type="number" min="1" value={l.quantidade} onChange={(e) => setLinha(i, { quantidade: e.target.value, ...RESET_ITEM })} />
                    <Input label="Preço un." type="number" step="0.01" min="0" value={l.preco} onChange={(e) => setLinha(i, { preco: e.target.value })} placeholder="0.00" />
                  </div>
                )}

                {pedido && !selecionada(l) && (
                  <span className="text-xs text-down">
                    {l.tipo === 'produto' || !l.produto_id
                      ? 'Escolha o produto (não ligado na Shopify)'
                      : `Sem frasco aberto de ${nomeProduto(l.produto_id)}: escolha um frasco aberto`}
                  </span>
                )}

                {l.tipo === 'decant' && l.frasco_id && (
                  <div className="flex flex-col gap-1.5 text-xs">
                    {origensDaLinha(l).length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted">Origem:</span>
                        <span>{descreverOrigens(l)}</span>
                        <span className="text-muted ml-auto font-mono">Perfume {formatBRL(custoUnitarioDaLinha(l))}/un.</span>
                      </div>
                    )}
                    {faltaMl(l) > 0 && (
                      <div className="flex flex-wrap items-center gap-2 text-down">
                        <span>Sem ml suficiente e sem lacrado: faltam {fmtMl(faltaMl(l))} ml</span>
                        {completando === i ? (
                          <Select
                            label="Outro perfume"
                            options={plano(l).frascos
                              .filter(f => f.id !== '' && f.ativo && f.produtoId !== frascoDaLinha(l)?.produtoId && f.mlRestante > 0
                                && !origensDaLinha(l).some(o => o.tipo === 'frasco' && o.frascoId === f.id))
                              .map(f => ({ value: f.id, label: `${nomeProduto(f.produtoId)} (${fmtMl(f.mlRestante)} ml)` }))}
                            value=""
                            onChange={(e) => e.target.value && completarCom(i, e.target.value)}
                          />
                        ) : (
                          <Button type="button" variant="secondary" size="sm" onClick={() => setCompletando(i)}>
                            Completar com outro perfume
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <Button type="button" variant="secondary" size="sm" className="self-start"
              onClick={() => setLinhas(prev => [...prev, { ...LINHA_VAZIA }])}>
              <Icon name="plus" size={14} />
              Adicionar item
            </Button>
          </div>

          {gruposInsumos.length > 0 && (
            <InsumosVenda
              grupos={gruposInsumos}
              insumos={insumos}
              onChange={(chave, itens) => chave === 'envio'
                ? setInsumosEnvio(itens)
                : setLinha(Number(chave), { insumos: itens, custo_embalagem: '0' })}
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Taxa do pedido (R$)" type="number" step="0.01" min="0" value={taxa} onChange={(e) => setTaxa(e.target.value)} />
            <Input label="Frete absorvido (R$)" type="number" step="0.01" min="0" value={frete} onChange={(e) => setFrete(e.target.value)} />
          </div>
          {pedido && (
            <p className="text-xs text-muted -mt-2">Cliente pagou {formatBRL(Number(pedido.frete) || 0)} de frete</p>
          )}

          {/* Prévia ao vivo */}
          <div className="flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><span className="text-muted">Bruto (Receita total)</span><span className="font-mono">{formatBRL(resumo.totalBruto)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Custo (Produtos + Insumos + Envio)</span><span className="font-mono">{formatBRL(resumo.totalCusto)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Receita líquida (após taxa e frete)</span><span className="font-mono">{formatBRL(resumo.receitaLiquida)}</span></div>
            <div className="flex justify-between text-base">
              <span>Lucro</span>
              <span className={`font-mono ${resumo.lucroBruto < 0 ? 'text-down' : 'text-up'}`}>
                {formatBRL(resumo.lucroBruto)} · ROI {resumo.roi === null ? '—' : `${(resumo.roi * 100).toFixed(0)}%`} · Margem {(resumo.margem * 100).toFixed(0)}% · Taxa {taxaPct.toFixed(0)}%
              </span>
            </div>
          </div>

          {erro && (
            <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? (mode === 'edit' ? 'Salvando...' : 'Registrando...')
                : (mode === 'edit' ? 'Salvar alterações' : 'Registrar venda')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
