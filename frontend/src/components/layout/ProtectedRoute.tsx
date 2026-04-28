/**
 * MEPALE ERP — Route protégée
 * Redirige vers /connexion si l'utilisateur n'est pas authentifié.
 */

import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function ProtectedRoute() {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/connexion" replace />
  }

  return <Outlet />
}
