// frontend/src/pages/estoque/__tests__/DecantModal.test.tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DecantModal } from '../decants/DecantModal'

// jsdom não implementa <dialog>
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

vi.mock('@/pages/estoque/decants/FrascoViewer', () => ({
  FrascoViewer: ({ percentual }: { percentual: number }) => (
    <div data-testid="frasco-viewer" data-pct={percentual} />
  ),
}))

const updateMock = vi.fn()
const insertMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'frascos_abertos') {
        return {
          update: () => ({ eq: updateMock }),
        }
      }
      // decants
      return { insert: insertMock }
    }),
  },
}))

const mockFrasco = {
  id: 'f1',
  produto_id: 'p1',
  ml_total: 100,
  ml_restante: 70,
  status: 'ativo' as const,
  aberto_em: '2026-06-15T10:00:00Z',
  produtos: { nome: 'Asad', foto_url: null, volume_ml: 100 },
}

describe('DecantModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSaved = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    updateMock.mockResolvedValue({ error: null })
    insertMock.mockResolvedValue({ error: null })
  })

  it('mostra nome do perfume e ml disponível', () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    expect(screen.getByText('Asad')).toBeInTheDocument()
    expect(screen.getByText(/70/)).toBeInTheDocument()
  })

  it('botão rápido de 10ml seleciona o valor e mostra previsão', () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    fireEvent.click(screen.getByText('10ml'))
    expect(screen.getByText(/60ml/)).toBeInTheDocument()
  })

  it('mostra erro quando ml informado excede disponível', () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    fireEvent.change(screen.getByPlaceholderText('ex: 7'), { target: { value: '80' } })
    fireEvent.click(screen.getByText('Registrar decant'))
    expect(screen.getByText(/maior que o disponível/)).toBeInTheDocument()
  })

  it('chama onSaved após registrar decant com sucesso', async () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    fireEvent.click(screen.getByText('10ml'))
    fireEvent.click(screen.getByText('Registrar decant'))
    await waitFor(() => expect(updateMock).toHaveBeenCalled())
    await waitFor(() => expect(insertMock).toHaveBeenCalled())
    await waitFor(() => expect(mockOnSaved).toHaveBeenCalled(), { timeout: 2000 })
  })
})
