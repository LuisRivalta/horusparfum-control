import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EstProdutos } from '../Produtos'

const { inserts } = vi.hoisted(() => ({
  inserts: [] as unknown[],
}))

vi.mock('react-router-dom', () => ({
  useOutletContext: () => ({ actionSlot: document.body }),
}))

vi.mock('@/components/shared/ProductDetailsModal', () => ({
  ProductDetailsModal: () => null,
}))

vi.mock('@/components/shared/SaidaRapidaModal', () => ({
  SaidaRapidaModal: () => null,
}))

vi.mock('@/components/shared/ImageCropper', () => ({
  ImageCropper: () => null,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn(),
      })),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: table === 'categorias'
            ? [{ id: 'c1', nome: 'Arabes' }]
            : table === 'fornecedores'
              ? [{ id: 'f1', nome: 'Onun' }]
              : [],
          error: null,
        })),
      })),
      insert: vi.fn((payload: unknown) => {
        inserts.push(payload)
        return Promise.resolve({ error: null })
      }),
    })),
  },
}))

beforeEach(() => {
  inserts.length = 0
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.open = false
  })
})

describe('EstProdutos', () => {
  it('cadastra produto como catalogo sem permitir informar estoque atual', async () => {
    const user = userEvent.setup()
    render(<EstProdutos />)

    await user.click(await screen.findByRole('button', { name: /novo produto/i }))

    expect(screen.queryByLabelText(/estoque atual/i)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/nome/i), 'Lattafa Asad')
    await user.clear(screen.getByLabelText(/estoque mínimo/i))
    await user.type(screen.getByLabelText(/estoque mínimo/i), '2')
    await user.click(screen.getByRole('button', { name: /^salvar$/i }))

    await waitFor(() => expect(inserts).toHaveLength(1))
    expect(inserts[0]).toMatchObject({
      nome: 'Lattafa Asad',
      estoque_atual: 0,
      estoque_minimo: 2,
    })
  })
})