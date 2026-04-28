/**
 * MEPALE ERP — Store Authentification (Zustand)
 * Gère : login, logout, profil utilisateur, état d'auth
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/services/api'

export interface Utilisateur {
  id: string
  username: string
  email: string
  nom: string
  prenom: string
  nom_complet: string
  initiales: string
  role: string
  role_label: string
  telephone: string
  avatar: string | null
  is_active: boolean
  date_creation: string
}

interface AuthState {
  utilisateur: Utilisateur | null
  isAuthenticated: boolean
  isLoading: boolean

  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchProfil: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      utilisateur:     null,
      isAuthenticated: false,
      isLoading:       false,

      login: async (username, password) => {
        set({ isLoading: true })
        try {
          const { data } = await api.post('/auth/login/', { username, password })

          // Stocker l'access token en localStorage
          localStorage.setItem('access_token', data.access)

          set({
            utilisateur:     data.utilisateur,
            isAuthenticated: true,
            isLoading:       false,
          })
        } catch {
          set({ isLoading: false })
          throw new Error('Identifiants incorrects.')
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout/')
        } catch {
          // Ignorer les erreurs de déconnexion côté serveur
        } finally {
          localStorage.removeItem('access_token')
          set({ utilisateur: null, isAuthenticated: false })
          window.location.href = '/connexion'
        }
      },

      fetchProfil: async () => {
        try {
          const { data } = await api.get('/auth/me/')
          set({ utilisateur: data, isAuthenticated: true })
        } catch {
          set({ utilisateur: null, isAuthenticated: false })
        }
      },
    }),
    {
      name:    'mepale-auth',
      partialize: (state) => ({
        utilisateur:     state.utilisateur,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
