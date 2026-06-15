import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EstEstoque } from '../EstoqueView'

vi.mock('@/components/shared/ProductDetailsModal', () => ({
  ProductDetailsModal: () => <div data-testid="details-modal" />,
}))
vi.mock('@/components/shared/SaidaRapidaModal', () => ({
  SaidaRapidaModal: () => <div data-testid="saida-modal" />,
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
                    foto_url: null, created_at: '',
                    categorias: { nome: 'Masculino' }, fornecedores: { nome: 'Cairo' },
                  },
                  {
                    id: 'p2', nome: 'Lattafa', volume_ml: 50, categoria_id: 'c2',
                    fornecedor_id: 'f1', estoque_atual: 2, estoque_minimo: 5,
                    foto_url: null, created_at: '',
                    categorias: { nome: 'Unissex' }, fornecedores: { nome: 'Cairo' },
                  },
                ],
                error: null,
              })
            ),
          })),
        }
      }
      // categorias e fornecedores
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
    expect(screen.getByText('Lattafa')).toBeInTheDocument()
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
    expect(screen.getByText('Lattafa')).toBeInTheDocument()
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
