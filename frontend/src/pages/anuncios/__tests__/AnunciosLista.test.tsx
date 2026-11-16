import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnunciosLista } from '../AnunciosLista'

const { api, updates, linhas } = vi.hoisted(() => ({
  api: { calcularPrecos: vi.fn(), aplicarPreco: vi.fn(), alterarStatus: vi.fn(), atualizarQuantidade: vi.fn(), qualidade: vi.fn(), publicar: vi.fn() },
  updates: [] as unknown[],
  linhas: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/apiAnuncios', () => api)
vi.mock('../novo/carregar', () => ({
  carregarBase: () => Promise.resolve({
    config: { margem_padrao: 0.6 },
    produtos: [{ id: 'p1', nome: 'Asad', marca: 'Lattafa', volume_ml: 100, custo_medio: 27 }],
    listas: [], custoPorInsumo: {}, pacotes: { frasco: {}, decant: {} },
  }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {
        select: () => q, order: () => q, eq: () => q,
        update: (v: unknown) => { updates.push(v); return q },
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: linhas, error: null }).then(ok),
      }
      return q
    },
  },
}))

const abrir = () => render(<MemoryRouter><AnunciosLista /></MemoryRouter>)
const base = { id: 'a1', produto_id: 'p1', tipo: 'frasco', ml: null, listing_type: 'gold_special', margem: 0.6, custo_base: 25,
  preco: 100, status: 'publicado', permalink: 'https://ml/1', erro: null, qualidade_score: 70, qualidade_nivel: 'Profissional' }

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
  linhas.length = 0
  linhas.push({ ...base })
})

describe('AnunciosLista', () => {
  it('avisa que o custo mudou e só troca o preço ao clicar em Aplicar', async () => {
    api.calcularPrecos.mockResolvedValue({ itens: [{ chave: 'frasco', gold_special: { preco: 110 }, gold_pro: { preco: 120 } }] })
    api.aplicarPreco.mockResolvedValue({})
    abrir()
    expect(await screen.findByText(/Custo mudou: R\$\s25,00 → R\$\s27,00/)).toBeInTheDocument()
    expect(screen.getByText('R$ 100,00')).toBeInTheDocument()

    fireEvent.click(screen.getByText('recalcular'))
    const aplicar = await screen.findByRole('button', { name: /Aplicar R\$\s110,00/ })
    expect(api.aplicarPreco).not.toHaveBeenCalled()
    expect(screen.getByText('R$ 100,00')).toBeInTheDocument()

    fireEvent.click(aplicar)
    await waitFor(() => expect(api.aplicarPreco).toHaveBeenCalledWith('a1', 110))
    expect(updates).toEqual([{ custo_base: 27 }])
    expect(await screen.findByText('R$ 110,00')).toBeInTheDocument()
    expect(screen.queryByText(/Custo mudou/)).not.toBeInTheDocument()
  })

  it('pausa o anúncio e mostra o erro da API', async () => {
    api.alterarStatus.mockRejectedValue(new Error('Conecte a conta do Mercado Livre'))
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: 'Pausar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Conecte a conta do Mercado Livre')
    expect(api.alterarStatus).toHaveBeenCalledWith('a1', 'paused')
  })

  it('rascunho tem link de edição pelo id do perfume', async () => {
    linhas[0] = { ...base, status: 'rascunho', permalink: null }
    abrir()
    expect((await screen.findByRole('link', { name: /Editar rascunho/ })).getAttribute('href')).toBe('/anuncios/p1')
  })
})
