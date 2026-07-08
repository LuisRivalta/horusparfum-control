import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Admin } from '../Admin'

let authState = {
  user: { email: 'byhorusco@gmail.com' },
  session: { access_token: 'token-admin' },
  loading: false,
}

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

const fetchMock = vi.fn()

function mockJson(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  } as Response
}

describe('Admin', () => {
  beforeEach(() => {
    authState = {
      user: { email: 'byhorusco@gmail.com' },
      session: { access_token: 'token-admin' },
      loading: false,
    }
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(mockJson({ users: [] }))
      .mockResolvedValueOnce(mockJson({ items: [] }))
    vi.stubGlobal('fetch', fetchMock)
  })

  it('renderiza as abas de logins e exclusoes para o admin', async () => {
    render(<MemoryRouter><Admin /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: /painel admin/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /logins/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /exclus/i })).toBeInTheDocument()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-admin' }),
      }),
    ))
  })

  it('bloqueia acesso direto para usuario comum', () => {
    authState = {
      user: { email: 'operador@example.com' },
      session: { access_token: 'token-user' },
      loading: false,
    }

    render(<MemoryRouter><Admin /></MemoryRouter>)

    expect(screen.getByText('Acesso administrativo restrito')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cria usuario chamando o endpoint admin com Authorization', async () => {
    render(<MemoryRouter><Admin /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'novo@example.com' } })
    fireEvent.change(screen.getByLabelText(/senha temporaria/i), { target: { value: 'senha123' } })

    fetchMock.mockResolvedValueOnce(mockJson({
      user: { id: 'u1', email: 'novo@example.com', created_at: null, last_sign_in_at: null },
    }, true, 201))
    fetchMock.mockResolvedValueOnce(mockJson({ users: [] }))

    fireEvent.click(screen.getByRole('button', { name: /criar login/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-admin' }),
        body: JSON.stringify({ email: 'novo@example.com', password: 'senha123' }),
      }),
    ))
  })

  it('mantem exclusao desabilitada ate confirmar com EXCLUIR', async () => {
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(mockJson({ users: [] }))
      .mockResolvedValueOnce(mockJson({ items: [{ id: 'm1', label: 'Meta mensal' }] }))

    render(<MemoryRouter><Admin /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: /exclus/i }))

    await waitFor(() => expect(screen.getByText('Meta mensal')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /excluir meta mensal/i }))

    const confirmButton = screen.getByRole('button', { name: /^excluir$/i })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/digite excluir/i), { target: { value: 'EXCLUIR' } })

    expect(confirmButton).not.toBeDisabled()
  })
})
