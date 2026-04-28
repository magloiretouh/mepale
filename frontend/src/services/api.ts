/**
 * MEPALE ERP — Instance Axios centrale
 * Gère automatiquement : JWT Bearer, refresh token, erreurs 401
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { toast } from 'sonner'

const BASE_URL = '/api/v1'

/**
 * Extrait le premier message d'erreur lisible d'une réponse DRF.
 * Gère : { detail }, { non_field_errors }, { champ: ["msg"] }, { champ: { sous_champ: ["msg"] } }
 */
export function extractDRFError(data: Record<string, unknown> | undefined, fallback = 'Une erreur est survenue.'): string {
  if (!data) return fallback
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.non_field_errors) && data.non_field_errors.length)
    return (data.non_field_errors as string[]).join(' ')
  // Erreurs de champs : parcourt toutes les valeurs et retourne le premier message trouvé
  for (const value of Object.values(data)) {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      const msg = value.find((v) => typeof v === 'string')
      if (msg) return msg as string
    }
  }
  return fallback
}

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
  // Django-filter MultipleChoiceFilter attend ?statut=a&statut=b (pas statut[]=a&statut[]=b)
  paramsSerializer: {
    serialize: (params: Record<string, unknown>) =>
      new URLSearchParams(
        Object.entries(params).flatMap(([k, v]) =>
          Array.isArray(v)
            ? v.map((item) => [k, String(item)])
            : v !== undefined && v !== null
              ? [[k, String(v)]]
              : []
        )
      ).toString(),
  },
})

// ── Intercepteur requête : injecte le token JWT ──────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Intercepteur réponse : gère le refresh automatique ───────────────────────
let isRefreshing = false
let pendingQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = []

const processQueue = (error: unknown, token: string | null) => {
  pendingQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)))
  pendingQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // 401 → tenter un refresh
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        // Mettre en file d'attente les requêtes pendant le refresh
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject })
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }

      original._retry = true
      isRefreshing = true

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, {}, {
          withCredentials: true, // utilise le cookie HttpOnly refresh_token
        })
        const newToken: string = data.access
        localStorage.setItem('access_token', newToken)
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`
        processQueue(null, newToken)
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch (refreshError) {
        processQueue(refreshError, null)
        // Refresh échoué → déconnexion
        localStorage.removeItem('access_token')
        window.location.href = '/connexion'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    // Erreurs métier → toast automatique (sauf 401 qui est géré ci-dessus)
    if (error.response?.status !== 401) {
      const data = error.response?.data as Record<string, unknown> | undefined
      const message = extractDRFError(data)
      toast.error(message)
    }

    return Promise.reject(error)
  }
)

export default api
