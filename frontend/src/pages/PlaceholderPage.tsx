import { Construction } from 'lucide-react'

interface PlaceholderPageProps {
  title: string
  description?: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 animate-fade-in">
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--accent-dim)' }}
      >
        <Construction size={24} style={{ color: 'var(--accent)' }} />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[--text-primary]">{title}</h2>
        <p className="text-sm text-[--text-muted] mt-1 max-w-sm">
          {description ?? 'Ce module est en cours de développement.'}
        </p>
      </div>
      <div
        className="px-4 py-1.5 rounded text-xs font-medium font-data"
        style={{
          backgroundColor: 'var(--accent-dim)',
          color: 'var(--accent)',
          border: '1px solid var(--accent)',
        }}
      >
        En développement
      </div>
    </div>
  )
}
