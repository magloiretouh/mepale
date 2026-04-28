/**
 * MEPALE ERP — Service Caisses
 * Interfaces TypeScript + fonctions API pour le module Caisses.
 */

import api from './api'

// ─── Types union ────────────────────────────────────────────────────────────

export type TypeMouvement    = 'entree' | 'sortie'
export type StatutSession    = 'ouverte' | 'fermee'
export type StatutMouvement  = 'en_attente' | 'approuve' | 'rejete'
export type StatutTransfert  = 'en_attente' | 'approuve' | 'rejete'

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count:    number
  next:     string | null
  previous: string | null
  results:  T[]
}

// ─── CategorieMouvement ──────────────────────────────────────────────────────

export interface CategorieMouvement {
  id:        string
  nom:       string
  code:      string
  type:      TypeMouvement
  is_system: boolean
  actif:     boolean
  ordre:     number
}

export interface CategorieMouvementPayload {
  nom:   string
  code:  string
  type:  TypeMouvement
  actif: boolean
  ordre: number
}

// ─── Caisse ──────────────────────────────────────────────────────────────────

export interface SessionOuverteMini {
  id:             string
  date_ouverture: string
}

export interface CaisseList {
  id:               string
  nom:              string
  responsable:      string | null
  responsable_nom:  string | null
  solde_actuel:     number
  plafond_alerte:   number | null
  alerte_plafond:   boolean
  actif:            boolean
  session_ouverte:  SessionOuverteMini | null
}

export interface Caisse extends CaisseList {
  created_at: string
}

export interface CaissePayload {
  nom:            string
  responsable:    string | null
  plafond_alerte: number | null
  actif:          boolean
}

// ─── SessionCaisse ───────────────────────────────────────────────────────────

export interface SessionCaisseList {
  id:                        string
  caisse:                    string
  caisse_nom:                string
  date_ouverture:            string
  date_fermeture:            string | null
  solde_ouverture:           number
  solde_fermeture_theorique: number
  solde_fermeture_reel:      number | null
  ecart:                     number | null
  statut:                    StatutSession
  ouvert_par:                string
  ouvert_par_nom:            string
  nb_mouvements_en_attente:  number
}

export interface SessionCaisse extends SessionCaisseList {
  ferme_par:     string | null
  ferme_par_nom: string | null
  notes_cloture: string
}

// ─── MouvementCaisse ─────────────────────────────────────────────────────────

export interface CategorieMini {
  id:   string
  nom:  string
  code: string
  type: TypeMouvement
}

export interface MouvementCaisseList {
  id:               string
  session:          string
  type:             TypeMouvement
  categorie:        string
  categorie_detail: CategorieMini
  montant:          number
  libelle:          string
  statut:           StatutMouvement
  approuve_par:     string | null
  approuve_par_nom: string | null
  date_approbation: string | null
  created_by:       string
  created_by_nom:   string
  created_at:       string
  facture_vente:    string | null
  bon_commande:     string | null
  ordre_fabrication: string | null
  transfert:        string | null
}

export interface MouvementCaisse extends MouvementCaisseList {
  motif_rejet:  string
  justificatif: string | null
}

export interface MouvementCaisseCreatePayload {
  session:           string
  categorie:         string
  montant:           number
  libelle:           string
  justificatif?:     File
  facture_vente?:    string
  bon_commande?:     string
  ordre_fabrication?: string
}

// ─── TransfertCaisse ─────────────────────────────────────────────────────────

export interface TransfertCaisseList {
  id:                    string
  caisse_source:         string
  caisse_source_nom:     string
  caisse_destination:    string
  caisse_destination_nom: string
  montant:               number
  libelle:               string
  statut:                StatutTransfert
  created_by:            string
  created_by_nom:        string
  created_at:            string
}

export interface TransfertCaisse extends TransfertCaisseList {
  mouvements: MouvementCaisseList[]
}

export interface TransfertCaisseCreatePayload {
  caisse_source:      string
  caisse_destination: string
  montant:            number
  libelle:            string
}

// ─── ParametresCaisse ────────────────────────────────────────────────────────

export interface ParametresCaisse {
  seuil_approbation:        number
  seuil_alerte_solde_max:   number
  report_automatique_solde: boolean
}

// ─── Stats dashboard ─────────────────────────────────────────────────────────

export interface CaissesStats {
  nb_caisses_actives: number
  total_solde:        number
  nb_en_attente:      number
  alertes_plafond:    { id: string; nom: string; solde_actuel: number; plafond_alerte: number }[]
}

// ─── API ─────────────────────────────────────────────────────────────────────

const BASE = '/caisses'

export const caissesApi = {

  // ── Catégories ─────────────────────────────────────────────────────────────
  listCategories:    (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<CategorieMouvement>>(`${BASE}/categories/`, { params }),
  createCategorie:   (data: CategorieMouvementPayload) =>
    api.post<CategorieMouvement>(`${BASE}/categories/`, data),
  updateCategorie:   (id: string, data: Partial<CategorieMouvementPayload>) =>
    api.patch<CategorieMouvement>(`${BASE}/categories/${id}/`, data),
  deleteCategorie:   (id: string) =>
    api.delete(`${BASE}/categories/${id}/`),

  // ── Caisses ────────────────────────────────────────────────────────────────
  listCaisses:       (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<CaisseList>>(`${BASE}/`, { params }),
  getCaisse:         (id: string) =>
    api.get<Caisse>(`${BASE}/${id}/`),
  createCaisse:      (data: CaissePayload) =>
    api.post<Caisse>(`${BASE}/`, data),
  updateCaisse:      (id: string, data: Partial<CaissePayload>) =>
    api.patch<Caisse>(`${BASE}/${id}/`, data),
  deleteCaisse:      (id: string) =>
    api.delete(`${BASE}/${id}/`),

  ouvrirSession:     (id: string, solde_ouverture?: number) =>
    api.post<SessionCaisse>(`${BASE}/${id}/ouvrir-session/`, { solde_ouverture }),
  fermerSession:     (id: string, data: { solde_fermeture_reel: number; notes_cloture?: string }) =>
    api.post<SessionCaisse>(`${BASE}/${id}/fermer-session/`, data),
  sessionCourante:   (id: string) =>
    api.get<SessionCaisse>(`${BASE}/${id}/session-courante/`),
  stats:             () =>
    api.get<CaissesStats>(`${BASE}/stats/`),

  // ── Sessions ───────────────────────────────────────────────────────────────
  listSessions:      (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<SessionCaisseList>>(`${BASE}/sessions/`, { params }),
  getSession:        (id: string) =>
    api.get<SessionCaisse>(`${BASE}/sessions/${id}/`),

  // ── Mouvements ─────────────────────────────────────────────────────────────
  listMouvements:    (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<MouvementCaisseList>>(`${BASE}/mouvements/`, { params }),
  getMouvement:      (id: string) =>
    api.get<MouvementCaisse>(`${BASE}/mouvements/${id}/`),
  createMouvement:   (data: MouvementCaisseCreatePayload) =>
    api.post<MouvementCaisse>(`${BASE}/mouvements/`, data),
  deleteMouvement:   (id: string) =>
    api.delete(`${BASE}/mouvements/${id}/`),
  approuverMouvement: (id: string) =>
    api.post<MouvementCaisse>(`${BASE}/mouvements/${id}/approuver/`),
  rejeterMouvement:  (id: string, motif_rejet: string) =>
    api.post<MouvementCaisse>(`${BASE}/mouvements/${id}/rejeter/`, { motif_rejet }),
  mouvementsEnAttente: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<MouvementCaisseList>>(`${BASE}/mouvements/en-attente/`, { params }),

  // ── Transferts ─────────────────────────────────────────────────────────────
  listTransferts:    (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<TransfertCaisseList>>(`${BASE}/transferts/`, { params }),
  getTransfert:      (id: string) =>
    api.get<TransfertCaisse>(`${BASE}/transferts/${id}/`),
  createTransfert:   (data: TransfertCaisseCreatePayload) =>
    api.post<TransfertCaisse>(`${BASE}/transferts/`, data),

  // ── Paramètres ─────────────────────────────────────────────────────────────
  getParametres:     () =>
    api.get<ParametresCaisse>(`${BASE}/parametres/`),
  updateParametres:  (data: Partial<ParametresCaisse>) =>
    api.patch<ParametresCaisse>(`${BASE}/parametres/`, data),
}
