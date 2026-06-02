import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Mark } from '@/components/shared/Mark'
import ColorBends from '@/components/shared/ColorBends'
import { ModelViewer } from '@/components/shared/ModelViewer'

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await signIn(email, password)
    if (error) {
      setError(error)
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      {/* Fundo animado */}
      <div className="absolute inset-0 z-0">
        <ColorBends
          colors={["#FFD700", "#F7A055", "#C9A84C"]}
          rotation={90}
          speed={0.2}
          scale={1.4}
          frequency={1}
          warpStrength={1}
          mouseInfluence={1}
          noise={0.15}
          parallax={0.5}
          iterations={1}
          intensity={1.5}
          bandWidth={6}
          transparent={false}
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      <div className="w-full max-w-[900px] grid grid-cols-1 lg:grid-cols-2 border border-line-2 rounded-2xl bg-surface overflow-hidden min-h-[560px] relative z-10">
        {/* Lado esquerdo — Modelo 3D */}
        <div className="relative hidden lg:flex flex-col items-center justify-center bg-bg/80">
          <div className="absolute top-4 left-4 z-10">
            <Mark size={28} />
          </div>
          <div className="w-full h-full">
            <ModelViewer autoRotate autoRotateSpeed={2} />
          </div>
          <p className="absolute bottom-4 text-xs text-muted">Arraste para girar</p>
        </div>

        {/* Lado direito — Formulário */}
        <div className="flex flex-col justify-center p-8 lg:p-10 bg-surface-2">
          {/* Logo mobile */}
          <div className="flex items-center mb-8 lg:hidden">
            <Mark size={32} />
          </div>

          <h1 className="text-2xl font-semibold">Entrar na sua conta</h1>
          <p className="text-sm text-muted mt-1 mb-8">
            Insira suas credenciais para acessar o painel
          </p>

          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full px-4 py-3 rounded-lg border border-line bg-raise text-text text-sm placeholder:text-faint focus:outline-none focus:border-gold/60 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-text-2">Senha</label>
                <button type="button" className="text-xs text-gold hover:underline cursor-pointer">
                  Esqueceu a senha?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 rounded-lg border border-line bg-raise text-text text-sm placeholder:text-faint focus:outline-none focus:border-gold/60 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-gold text-[#1A1407] font-semibold text-sm hover:bg-gold/90 transition-colors cursor-pointer disabled:opacity-60 mt-2"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-xs text-muted text-center mt-8">
            Acesso restrito à equipe Horus Parfum
          </p>
        </div>
      </div>
    </div>
  )
}
