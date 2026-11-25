import { escolher } from '@/test/escolher'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ControleAnuncios } from '../ControleAnuncios'

type Chamada = { tabela: string; op: string; args: unknown[] }
const chamadas: Chamada[] = []
let marcas: Record<string, unknown>[] = []
let erroInsert: { code: string; message?: string } | null = null

const DADOS: Record<string, unknown> = {
  produtos: [
    { id: 'p1', nome: 'Asad', estoque_atual: 1, tipos_produto: { vende_decant: true } },
    { id: 'p2', nome: 'Khamrah', estoque_atual: 1, tipos_produto: { vende_decant: true } },
    { id: 'p3', nome: 'Club', estoque_atual: 0, tipos_produto: { vende_decant: false } },
  ],
  frascos_abertos: [],
  anuncios_config: { tamanhos_decant: [2.5, 5, 10] },
  anuncios: [{ produto_id: 'p2', tipo: 'frasco', ml: null }],
  canal_vinculos: [],
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabela: string) => {
      const ops: string[] = []
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'is', 'in', 'maybeSingle', 'insert', 'delete']) {
        b[op] = (...args: unknown[]) => { chamadas.push({ tabela, op, args }); ops.push(op); return b }
      }
      b.then = (res: (v: unknown) => unknown) => {
        if (ops.includes('insert')) {
          if (erroInsert) return res({ data: null, error: erroInsert })
          const novos = chamadas.filter((c) => c.op === 'insert').at(-1)!.args[0]
          marcas = [...marcas, ...(Array.isArray(novos) ? novos : [novos])]
          return res({ data: null, error: null })
        }
        if (ops.includes('delete')) return res({ data: null, error: null })
        return res({ data: tabela === 'anuncio_marcas' ? marcas : DADOS[tabela], error: null })
      }
      return b
    },
  },
}))

const m = (produto_id: string, tipo: string, ml: number | null, canal = 'ml') => ({ produto_id, canal, tipo, ml })

beforeEach(() => {
  chamadas.length = 0
  erroInsert = null
  marcas = [m('p2', 'frasco', null), m('p2', 'decant', 2.5), m('p2', 'decant', 5), m('p2', 'decant', 10)]
})

const celula = (nome: string) => screen.getByRole('button', { name: new RegExp(`^${nome}:`) }) as HTMLButtonElement
const inserts = () => chamadas.filter((c) => c.op === 'insert').map((c) => c.args[0])

describe('ControleAnuncios', () => {
  it('renderiza as linhas e os cabeçalhos', async () => {
    render(<ControleAnuncios />)
    expect(await screen.findByText('Asad')).toBeInTheDocument()
    expect(screen.getByText('Khamrah')).toBeInTheDocument()
    expect(screen.getByText('Club')).toBeInTheDocument()
    for (const h of ['Frasco', '2,5 ml', '5 ml', '10 ml']) expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument()
    expect(celula('Club Frasco').getAttribute('aria-label')).toBe('Club Frasco: sem estoque')
    expect(screen.queryByRole('button', { name: /^Club 5 ml/ })).toBeNull()
  })

  it('clicar na vermelha grava a marca', async () => {
    render(<ControleAnuncios />)
    await screen.findByText('Asad')
    expect(celula('Asad Frasco').getAttribute('aria-label')).toBe('Asad Frasco: falta criar')
    fireEvent.click(celula('Asad Frasco'))
    await waitFor(() => expect(celula('Asad Frasco').getAttribute('aria-label')).toBe('Asad Frasco: criado'))
    expect(inserts()).toEqual([{ produto_id: 'p1', canal: 'ml', tipo: 'frasco', ml: null }])
  })

  it('clicar numa verde manual apaga pela chave', async () => {
    render(<ControleAnuncios />)
    await screen.findByText('Asad')
    const antes = chamadas.filter((c) => c.tabela === 'anuncio_marcas' && c.op === 'select').length
    fireEvent.click(celula('Khamrah 5 ml'))
    await waitFor(() => expect(chamadas.filter((c) => c.tabela === 'anuncio_marcas' && c.op === 'select').length).toBe(antes + 1))
    await waitFor(() => expect(celula('Khamrah 5 ml').disabled).toBe(false))
    expect(chamadas.some((c) => c.op === 'delete')).toBe(true)
    const eqs = chamadas.filter((c) => c.op === 'eq' && c.tabela === 'anuncio_marcas').map((c) => c.args)
    expect(eqs).toEqual(expect.arrayContaining([['produto_id', 'p2'], ['canal', 'ml'], ['tipo', 'decant'], ['ml', 5]]))
  })

  it('verde automática fica desabilitada', async () => {
    render(<ControleAnuncios />)
    await screen.findByText('Asad')
    const c = celula('Khamrah Frasco')
    expect(c.disabled).toBe(true)
    expect(c.title).toBe('vem do Horus')
  })

  it('Marcar todas grava as vermelhas num insert só', async () => {
    render(<ControleAnuncios />)
    await screen.findByText('Asad')
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas Asad' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Marcar todas Asad' })).toBeNull())
    expect(inserts()).toEqual([[
      { produto_id: 'p1', canal: 'ml', tipo: 'frasco', ml: null },
      { produto_id: 'p1', canal: 'ml', tipo: 'decant', ml: 2.5 },
      { produto_id: 'p1', canal: 'ml', tipo: 'decant', ml: 5 },
      { produto_id: 'p1', canal: 'ml', tipo: 'decant', ml: 10 },
    ]])
  })

  it('duplicado (23505) conta como sucesso', async () => {
    erroInsert = { code: '23505' }
    render(<ControleAnuncios />)
    await screen.findByText('Asad')
    const antes = chamadas.filter((c) => c.tabela === 'anuncio_marcas' && c.op === 'select').length
    fireEvent.click(celula('Asad Frasco'))
    await waitFor(() => expect(chamadas.filter((c) => c.tabela === 'anuncio_marcas' && c.op === 'select').length).toBe(antes + 1))
    await waitFor(() => expect(celula('Asad Frasco').disabled).toBe(false))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('outro erro aparece na tela', async () => {
    erroInsert = { code: '42501', message: 'sem permissão' }
    render(<ControleAnuncios />)
    await screen.findByText('Asad')
    fireEvent.click(celula('Asad Frasco'))
    expect(await screen.findByRole('alert')).toHaveTextContent('sem permissão')
  })

  it('filtra por situação e troca de plataforma', async () => {
    render(<ControleAnuncios />)
    await screen.findByText('Asad')
    escolher(screen.getByRole('combobox', { name: 'Situação' }), 'completo')
    expect(screen.getByText('Khamrah')).toBeInTheDocument()
    expect(screen.queryByText('Asad')).toBeNull()
    expect(screen.queryByText('Club')).toBeNull()
    escolher(screen.getByRole('combobox', { name: 'Situação' }), 'todos')
    escolher(screen.getByRole('combobox', { name: 'Plataforma' }), 'shopify')
    expect(celula('Khamrah 5 ml').getAttribute('aria-label')).toBe('Khamrah 5 ml: falta criar')
    expect(celula('Khamrah Frasco').getAttribute('aria-label')).toBe('Khamrah Frasco: falta criar')
  })
})
