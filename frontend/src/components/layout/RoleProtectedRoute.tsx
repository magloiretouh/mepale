/**
 * MEPALE ERP — Route protégée par rôle
 * Redirige vers /dashboard si l'utilisateur n'a pas le rôle requis.
 */

import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

interface Props {
  allowedRoles: string[]
}

export function RoleProtectedRoute({ allowedRoles }: Props) {
  const { utilisateur } = useAuthStore()

  if (!utilisateur || !allowedRoles.includes(utilisateur.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
