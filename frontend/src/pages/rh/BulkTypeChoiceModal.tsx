/**
 * MEPALE ERP — Modal de choix du type de paiement en masse
 */

import { useNavigate } from 'react-router-dom'
import { Banknote, Gift, TrendingDown, MoreHorizontal } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'

interface Props {
  isOpen:  boolean
  onClose: () => void
}

const TYPES = [
  {
    key:   'salaire',
    label: 'Salaire',
    desc:  'Lancer la paie mensuelle avec calculs CNSS/AMU',
    icon:  Banknote,
    color: 'var(--status-success)',
    route: '/rh/paie',
  },
  {
    key:   'prime',
    label: 'Prime',
    desc:  'Verser une prime à plusieurs employés',
    icon:  Gift,
    color: 'var(--accent)',
    route: '/rh/paie/prime',
  },
  {
    key:   'avance',
    label: 'Avance',
    desc:  'Accorder une avance sur salaire',
    icon:  TrendingDown,
    color: 'var(--status-warning)',
    route: '/rh/paie/avance',
  },
  {
    key:   'autre',
    label: 'Autre',
    desc:  'Tout autre type de paiement exceptionnel',
    icon:  MoreHorizontal,
    color: 'var(--text-secondary)',
    route: '/rh/paie/autre',
  },
]

export function BulkTypeChoiceModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate()

  const handleChoice = (route: string) => {
    onClose()
    navigate(route)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Paiement en masse" size="sm">
      <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
        Choisissez le type de paiement à effectuer pour plusieurs employés.
      </p>
      <div className="flex flex-col gap-3">
        {TYPES.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => handleChoice(t.route)}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-left transition-all hover:scale-[1.01]"
              style={{
                backgroundColor: `color-mix(in srgb, ${t.color} 8%, var(--bg-elevated))`,
                border:          `1px solid color-mix(in srgb, ${t.color} 25%, var(--border))`,
              }}
            >
              <span
                className="flex-shrink-0 rounded-lg p-2"
                style={{
                  backgroundColor: `color-mix(in srgb, ${t.color} 15%, transparent)`,
                  color:           t.color,
                }}
              >
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {t.label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {t.desc}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
