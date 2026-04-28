import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useThemeStore } from '@/store/themeStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Eye, EyeOff, Lock, User, Zap, Sun, Moon } from 'lucide-react'

export function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const { theme, toggleTheme }  = useThemeStore()
  const { login, isLoading }    = useAuthStore()
  const navigate                = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await login(username, password)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Identifiants incorrects. Vérifiez votre nom d\'utilisateur et mot de passe.')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      {/* Background grid decoration */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(var(--border-subtle) 1px, transparent 1px),
            linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          opacity: 0.5,
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Theme toggle top-right */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 w-8 h-8 rounded flex items-center justify-center hover:bg-[--bg-elevated] text-[--text-secondary] hover:text-[--text-primary] transition-all"
      >
        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-sm animate-scale-in"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Top accent bar */}
        <div
          className="h-0.5 rounded-t-[10px]"
          style={{ background: 'linear-gradient(90deg, var(--accent), var(--accent-bright))' }}
        />

        <div className="p-9">
          {/* Logo */}
          <div className="flex items-center gap-3" style={{ marginBottom: '10px' }}>
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent)', color: '#0A0B10' }}
            >
              <Zap size={18} strokeWidth={2.5} />
            </div>
            <div>
              <p
                className="text-base font-bold tracking-[0.08em] uppercase leading-none"
                style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}
              >
                MEPALE
              </p>
              <p
                className="text-[9px] font-semibold tracking-[0.15em] uppercase mt-0.5"
                style={{ color: 'var(--accent)' }}
              >
                ERP System
              </p>
            </div>
          </div>

          {/* Heading */}
          <div style={{ marginBottom: '10px' }}>
            <h1 className="text-xl font-bold text-[--text-primary]">Connexion</h1>
            <p className="text-sm text-[--text-muted]" style={{ marginTop: '1px' }}>
              Accédez à votre espace de gestion
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Input
              label="Identifiant"
              id="username"
              type="text"
              placeholder="nom.utilisateur"
              icon={<User size={14} />}
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />

            <Input
              label="Mot de passe"
              id="password"
              type={showPass ? 'text' : 'password'}
              placeholder="••••••••"
              icon={<Lock size={14} />}
              iconRight={
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="p-1.5 cursor-pointer hover:text-[--text-primary] transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              }
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {/* Error message */}
            {error && (
              <p
                className="text-xs px-3 py-3 rounded"
                style={{
                  color: 'var(--status-danger)',
                  backgroundColor: 'var(--status-danger-bg)',
                  border: '1px solid var(--status-danger)',
                }}
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isLoading}
              className="w-full"
            >
              {isLoading ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>

          {/* Footer note */}
          <p className="text-center text-[11px] text-[--text-muted] mt-8">
            Contactez votre administrateur pour tout problème d'accès.
          </p>
        </div>
      </div>
    </div>
  )
}
