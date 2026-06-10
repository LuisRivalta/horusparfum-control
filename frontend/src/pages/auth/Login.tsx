import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Mark } from '@/components/shared/Mark'
import ColorBends from '@/components/shared/ColorBends'
import { ModelViewer } from '@/components/shared/ModelViewer'
import { AnimatedButton } from '@/components/shared/AnimatedButton'

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

      <div className="w-full max-w-[900px] grid grid-cols-1 lg:grid-cols-2 border border-line-2 rounded-2xl overflow-hidden min-h-[560px] relative z-10 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)] animate-[scale-in_0.6s_cubic-bezier(0.22,1,0.36,1)_both]" style={{ backgroundColor: '#0A0A0A' }}>
        {/* Lado esquerdo — Modelo 3D */}
        <div className="relative hidden lg:flex flex-col items-center justify-center bg-bg/80">
          <div className="absolute top-4 left-4 z-10">
            <Mark size={60} />
          </div>
          <div className="w-full h-full">
            <ModelViewer autoRotate autoRotateSpeed={2} />
          </div>
          <p className="absolute bottom-4 text-xs text-muted hidden"></p>
        </div>

        {/* Lado direito — Formulário */}
        <div className="flex flex-col justify-center p-8 lg:p-10 bg-bg">
          {/* Logo mobile */}
          <div className="flex items-center mb-8 lg:hidden">
            <Mark size={32} />
          </div>

          <h1 className="text-3xl font-semibold tracking-wide">Entrar na sua conta</h1>
          <p className="text-sm text-muted mt-1.5 mb-6">
            Insira suas credenciais para acessar o painel
          </p>

          <div className="ornament-divider mb-6">
            <i className="w-1.5 h-1.5 border border-gold rotate-45 shrink-0" />
          </div>

          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-[.08em] text-text-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full px-4 py-3 rounded-lg border border-line text-text text-sm placeholder:text-faint focus:outline-none focus:border-gold/60 focus:shadow-[0_0_0_3px_rgba(201,168,76,0.12)] hover:border-line-2 transition-all duration-200"
                style={{ backgroundColor: '#131312' }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-[.08em] text-text-2">Senha</label>
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
                className="w-full px-4 py-3 rounded-lg border border-line text-text text-sm placeholder:text-faint focus:outline-none focus:border-gold/60 focus:shadow-[0_0_0_3px_rgba(201,168,76,0.12)] hover:border-line-2 transition-all duration-200"
                style={{ backgroundColor: '#131312' }}
              />
            </div>

            <AnimatedButton
              type="submit"
              loading={loading}
              loadingText="Entrando..."
            >
              Entrar
            </AnimatedButton>
          </form>

        </div>
      </div>
    </div>
  )
}
