import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Login } from '../Login'

// Mock the AuthContext
const mockSignIn = vi.fn()
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    user: null,
    session: null,
    loading: false,
    signOut: vi.fn(),
  }),
}))

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock Three.js-based components
vi.mock('@/components/shared/ColorBends', () => ({
  default: () => <div data-testid="color-bends" />,
}))

vi.mock('@/components/shared/ModelViewer', () => ({
  ModelViewer: () => <div data-testid="model-viewer" />,
}))

vi.mock('@/components/shared/Mark', () => ({
  Mark: () => <div data-testid="mark" />,
}))

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  )
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the login form with email and password fields', () => {
    renderLogin()

    const emailInput = screen.getByPlaceholderText('seu@email.com')
    const passwordInput = screen.getByPlaceholderText('••••••••')

    expect(emailInput).toBeInTheDocument()
    expect(emailInput).toHaveAttribute('type', 'email')
    expect(passwordInput).toBeInTheDocument()
    expect(passwordInput).toHaveAttribute('type', 'password')
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Senha')).toBeInTheDocument()
  })

  it('renders the "Entrar" button', () => {
    renderLogin()

    const button = screen.getByRole('button', { name: /entrar/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('type', 'submit')
  })

  it('shows error message on failed login', async () => {
    const user = userEvent.setup()
    mockSignIn.mockResolvedValueOnce({ error: 'Credenciais inválidas' })

    renderLogin()

    await user.type(screen.getByPlaceholderText('seu@email.com'), 'test@email.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(screen.getByText('Credenciais inválidas')).toBeInTheDocument()
    })
  })

  it('calls signIn when form is submitted', async () => {
    const user = userEvent.setup()
    mockSignIn.mockResolvedValueOnce({ error: null })

    renderLogin()

    await user.type(screen.getByPlaceholderText('seu@email.com'), 'user@example.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
    await user.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('user@example.com', 'password123')
    })
  })

  it('navigates to home on successful login', async () => {
    const user = userEvent.setup()
    mockSignIn.mockResolvedValueOnce({ error: null })

    renderLogin()

    await user.type(screen.getByPlaceholderText('seu@email.com'), 'user@example.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
    await user.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('disables the button and shows loading state during submission', async () => {
    const user = userEvent.setup()
    // Never resolves during the test to keep loading state
    mockSignIn.mockImplementationOnce(() => new Promise(() => {}))

    renderLogin()

    await user.type(screen.getByPlaceholderText('seu@email.com'), 'user@example.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
    await user.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /entrando/i })
      expect(button).toBeDisabled()
    })
  })
})
