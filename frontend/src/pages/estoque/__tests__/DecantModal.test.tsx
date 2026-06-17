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

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('@/pages/estoque/decants/FrascoViewer', () => ({
  FrascoViewer: ({ percentual }: { percentual: number }) => (
    <div data-testid="frasco-viewer" data-pct={percentual} />
  ),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: [] }),
      })),
    })),
    rpc: rpcMock,
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'test@example.com' } }),
}))

const mockFrasco = {
  id: 'f1',
  produto_id: 'p1',
  ml_total: 100,
  ml_restante: 70,
  status: 'ativo' as const,
  aberto_em: '2026-06-15T10:00:00Z',
  produtos: { nome: 'Asad', foto_url: null, volume_ml: 100, custo_medio: 5.0 },
}

describe('DecantModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSaved = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    rpcMock.mockResolvedValue({ error: null })
  })

  it('mostra nome do perfume e ml disponível', () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    expect(screen.getByText(/Consumo — Asad/)).toBeInTheDocument()
    expect(screen.getByText(/70/)).toBeInTheDocument()
  })

  it('botão rápido de 10ml seleciona o valor e mostra previsão', () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    fireEvent.click(screen.getByText('10ml'))
    expect(screen.getByText(/60ml/)).toBeInTheDocument()
  })

  it('renderiza select de classificação', () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    expect(screen.getByDisplayValue('Selecione...')).toBeInTheDocument()
  })

  it('chama onSaved após registrar consumo com sucesso', async () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    fireEvent.click(screen.getByText('10ml'))
    // Select classification
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'amostra' } })
    fireEvent.click(screen.getByText('Registrar consumo'))
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    await waitFor(() => expect(mockOnSaved).toHaveBeenCalled(), { timeout: 2000 })
  })
})
