import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EstEstoque } from '../EstoqueView'

vi.mock('@/components/shared/ProductDetailsModal', () => ({
  ProductDetailsModal: () => <div data-testid="details-modal" />,
}))
vi.mock('@/components/shared/SaidaRapidaModal', () => ({
  SaidaRapidaModal: () => <div data-testid="saida-modal" />,
}))
vi.mock('@/components/shared/EntradaRapidaModal', () => ({
  EntradaRapidaModal: () => <div data-testid="entrada-modal" />,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'produtos') {
        return {
          select: vi.fn(() => ({
            gt: vi.fn(() =>
              Promise.resolve({
                data: [
                  {
                    id: 'p1', nome: 'Asad', volume_ml: 100, categoria_id: 'c1',
                    fornecedor_id: 'f1', estoque_atual: 8, estoque_minimo: 3,
                    marca_id: 'm1', foto_url: null, created_at: '', custo_medio: 100,
                    categorias: { nome: 'Masculino' }, fornecedores: { nome: 'Cairo' },
                    marcas: { nome: 'Lattafa' },
                  },
                  {
                    id: 'p2', nome: 'Lattafa', volume_ml: 50, categoria_id: 'c2',
                    fornecedor_id: 'f1', estoque_atual: 2, estoque_minimo: 5,
                    marca_id: 'm2', foto_url: null, created_at: '', custo_medio: 50,
                    categorias: { nome: 'Unissex' }, fornecedores: { nome: 'Cairo' },
                    marcas: { nome: 'Armaf' },
                  },
                ],
                error: null,
              })
            ),
          })),
        }
      }
      if (table === 'marcas') {
        return {
          select: vi.fn(() => Promise.resolve({
            data: [{ id: 'm1', nome: 'Lattafa' }, { id: 'm2', nome: 'Armaf' }],
            error: null,
          })),
        }
      }
      if (table === 'categorias') {
        return {
          select: vi.fn(() => Promise.resolve({
            data: [{ id: 'c1', nome: 'Masculino' }, { id: 'c2', nome: 'Unissex' }],
            error: null,
          })),
        }
      }
      return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
    }),
  },
}))

describe('EstEstoque', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza cards com nome e badge de quantidade', async () => {
    render(<EstEstoque />)
    await waitFor(() => expect(screen.getByText('Asad')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Lattafa/ })).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('filtra cards por busca de nome', async () => {
    render(<EstEstoque />)
    await waitFor(() => expect(screen.getByText('Asad')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Buscar perfume...'), {
      target: { value: 'Lattafa' },
    })
    expect(screen.queryByText('Asad')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lattafa/ })).toBeInTheDocument()
  })

  it('filtra cards por marca', async () => {
    render(<EstEstoque />)
    await waitFor(() => expect(screen.getByText('Asad')).toBeInTheDocument())

    fireEvent.change(screen.getByDisplayValue('Marca'), {
      target: { value: 'm2' },
    })

    expect(screen.queryByText('Asad')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lattafa/ })).toBeInTheDocument()
  })

  it('mostra total de unidades ao lado da contagem de produtos', async () => {
    render(<EstEstoque />)
    await waitFor(() => expect(screen.getByText('Asad')).toBeInTheDocument())

    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText(/unidades/)).toBeInTheDocument()
  })

  it('aba Dashboard mostra resumo, valor do estoque e agrupamentos', async () => {
    render(<EstEstoque />)
    await waitFor(() => expect(screen.getByText('Asad')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))

    // 8 x 100 + 2 x 50 = 900
    expect(screen.getByText('R$ 900,00')).toBeInTheDocument()
    expect(screen.getByText('Valor em estoque')).toBeInTheDocument()
    expect(screen.getByText('Por categoria')).toBeInTheDocument()
    expect(screen.getByText('Por marca')).toBeInTheDocument()
    expect(screen.getByText('Onde o valor está concentrado')).toBeInTheDocument()
  })

  it('aba Dashboard ignora os filtros aplicados na aba Visão', async () => {
    render(<EstEstoque />)
    await waitFor(() => expect(screen.getByText('Asad')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('Buscar perfume...'), {
      target: { value: 'Lattafa' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))

    // Valor total continua somando os dois produtos, não só o filtrado
    expect(screen.getByText('R$ 900,00')).toBeInTheDocument()
  })

  it('volta para a lista ao clicar na aba Visão', async () => {
    render(<EstEstoque />)
    await waitFor(() => expect(screen.getByText('Asad')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(screen.queryByPlaceholderText('Buscar perfume...')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Visão' }))
    expect(screen.getByPlaceholderText('Buscar perfume...')).toBeInTheDocument()
    expect(screen.getByText('Asad')).toBeInTheDocument()
  })

  it('mostra estado vazio quando nenhum produto em estoque', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn(() => ({
        gt: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    } as never)
    render(<EstEstoque />)
    await waitFor(() =>
      expect(screen.getByText('Nenhum produto em estoque')).toBeInTheDocument()
    )
  })
})
