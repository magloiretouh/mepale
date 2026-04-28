import api from './api'

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ParametresEntreprise {
  id:          number
  nom:         string
  slogan:      string
  logo:        null           // write-only (ne pas utiliser)
  logo_url:    string | null
  adresse:     string
  ville:       string
  pays:        string
  ninea:       string
  telephone:   string
  telephone2:  string
  email:       string
  site_web:    string
}

export type ParametresEntrepriseUpdate = Partial<Omit<ParametresEntreprise, 'id' | 'logo' | 'logo_url'>> & {
  logo?: File | null
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const administrationApi = {
  getParametresEntreprise: () =>
    api.get<ParametresEntreprise>('/administration/parametres-entreprise/'),

  updateParametresEntreprise: (data: ParametresEntrepriseUpdate) => {
    const form = new FormData()
    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined) return
      if (value === null) {
        // Envoi vide pour effacer un champ
        form.append(key, '')
      } else if (value instanceof File) {
        form.append(key, value)
      } else {
        form.append(key, String(value))
      }
    })
    return api.patch<ParametresEntreprise>('/administration/parametres-entreprise/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
