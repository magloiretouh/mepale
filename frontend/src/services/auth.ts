/**
 * MEPALE ERP — Service API Utilisateurs & Administration
 */

import api from './api'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoleUtilisateur =
  | 'admin' | 'directeur'
  | 'resp_production' | 'operateur'
  | 'resp_logistique' | 'magasinier'
  | 'commercial'
  | 'resp_rh'
  | 'comptable' | 'caissier'

export interface UtilisateurItem {
  id: string
  username: string
  nom_complet: string
  role: RoleUtilisateur
  role_label: string
  email: string
  telephone: string
  is_active: boolean
}

export interface UtilisateurCreatePayload {
  username: string
  email: string
  nom: string
  prenom: string
  role: RoleUtilisateur
  telephone?: string
  password: string
  password2: string
}

export interface UtilisateurUpdatePayload {
  nom?: string
  prenom?: string
  email?: string
  telephone?: string
  role?: RoleUtilisateur
  is_active?: boolean
}

// ─── API ──────────────────────────────────────────────────────────────────────

export interface MeUpdatePayload {
  nom?:       string
  prenom?:    string
  telephone?: string
  avatar?:    File | null
}

export interface ChangePasswordPayload {
  ancien_mdp:  string
  nouveau_mdp: string
  confirm_mdp: string
}

export const authApi = {
  getMe: () =>
    api.get('/auth/me/'),

  updateMe: (data: MeUpdatePayload) => {
    const form = new FormData()
    if (data.nom       !== undefined) form.append('nom',       data.nom)
    if (data.prenom    !== undefined) form.append('prenom',    data.prenom)
    if (data.telephone !== undefined) form.append('telephone', data.telephone)
    if (data.avatar    instanceof File) form.append('avatar', data.avatar)
    return api.patch('/auth/me/update/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  changePassword: (data: ChangePasswordPayload) =>
    api.post('/auth/change-password/', data),

  listUtilisateurs: (params?: { active?: '1' | '0' }) =>
    api.get<UtilisateurItem[]>('/auth/utilisateurs/', { params }),

  createUtilisateur: (data: UtilisateurCreatePayload) =>
    api.post<UtilisateurItem>('/auth/utilisateurs/', data),

  updateUtilisateur: (id: string, data: UtilisateurUpdatePayload) =>
    api.patch<UtilisateurItem>(`/auth/utilisateurs/${id}/`, data),

  toggleUtilisateur: (id: string) =>
    api.post<{ detail: string; is_active: boolean }>(`/auth/utilisateurs/${id}/toggle/`),

  resetPassword: (id: string, nouveau_mdp: string) =>
    api.post<{ detail: string }>(`/auth/utilisateurs/${id}/reset-password/`, { nouveau_mdp }),
}

// ─── Config rôles (couleurs + labels) ────────────────────────────────────────

export const ROLES: { value: RoleUtilisateur; label: string }[] = [
  { value: 'admin',           label: 'Administrateur'         },
  { value: 'directeur',       label: 'Directeur'              },
  { value: 'resp_production', label: 'Resp. Production'       },
  { value: 'operateur',       label: 'Opérateur Production'   },
  { value: 'resp_logistique', label: 'Resp. Logistique'       },
  { value: 'magasinier',      label: 'Magasinier'             },
  { value: 'commercial',      label: 'Commercial'             },
  { value: 'resp_rh',         label: 'Responsable RH'         },
  { value: 'comptable',       label: 'Comptable'              },
  { value: 'caissier',        label: 'Caissier'               },
]

export const ROLE_VARIANT: Record<RoleUtilisateur, 'danger' | 'info' | 'accent' | 'neutral' | 'success' | 'warning'> = {
  admin:           'danger',
  directeur:       'info',
  resp_production: 'accent',
  operateur:       'neutral',
  resp_logistique: 'accent',
  magasinier:      'neutral',
  commercial:      'success',
  resp_rh:         'warning',
  comptable:       'neutral',
  caissier:        'neutral',
}
