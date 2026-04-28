/**
 * MEPALE ERP — Service API Production
 * Tous les appels vers /api/v1/production/
 */

import api from './api'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UniteMesure {
  id: string; code: string; libelle: string; type: string
}

/**
 * Type d'article — géré depuis le frontend (plus de Django Admin).
 * Remplace l'ancien enum hardcodé mp/pf/sf/emballage.
 */
export interface TypeArticle {
  id: string
  code: string               // ex : 'mp', 'pf', 'sf', 'emballage'
  libelle: string            // ex : 'Matière première'
  prefixe: string            // ex : 'MP' — pour la génération de code
  prefixe_effectif: string   // prefixe si défini, sinon code.upper()
  peut_composer_bom: boolean
  peut_etre_produit_of: boolean
  peut_etre_achete: boolean
}

export interface Article {
  id: string
  code: string
  designation: string
  // type : UUID du TypeArticle (writable) + champs rapides en lecture
  type: string               // UUID
  type_code: string          // ex : 'mp'
  type_label: string         // ex : 'Matière première'
  type_detail?: TypeArticle
  // unité de stock
  unite: string              // UUID
  unite_code: string         // ex : 'kg'
  description?: string
  actif?: boolean
  gere_par_lot: boolean
  has_lots: boolean
  /** True si l'article est produit fini ou matière dans une nomenclature / OF → verrouille le Type en édition */
  has_ofs_ou_bom: boolean
  /** True si au moins une ligne de BC a été réceptionnée → verrouille l'Unité d'achat en édition */
  has_receptions: boolean
  // P2-A — capacités métier (dérivées du TypeArticle)
  peut_composer_bom: boolean
  peut_etre_produit_of: boolean
  peut_etre_achete: boolean
  // P1-A — valorisation
  methode_valorisation?: string
  prix_standard?: number
  // P2-C
  code_barre?: string | null
  reference_externe?: string
  // P2-D
  duree_vie_jours?: number | null
  conditions_stockage?: string
  // P3-E — multi-UoM
  unite_achat?: string | null
  unite_achat_code?: string
  coefficient_conversion?: number
  date_creation?: string
}

export interface LigneNomenclature {
  id: string; matiere: string; matiere_detail: Article
  quantite: number; taux_perte: number; quantite_avec_perte: number; notes: string
}

export interface Nomenclature {
  id: string; produit_fini: string; produit_detail: Article
  version: number; quantite_base: number; active: boolean
  notes: string; lignes: LigneNomenclature[]
  cree_par_nom: string; date_creation: string; date_modif: string
  ordres_count: number
}

export type StatutOF = 'brouillon' | 'confirme' | 'en_cours' | 'termine' | 'cloture' | 'annule'

export interface OrdreFabrication {
  id: string; reference: string
  produit_designation: string; nomenclature_detail?: Nomenclature
  nomenclature: string
  quantite_prevue: number; quantite_produite: number
  statut: StatutOF; statut_label: string
  date_prevue: string; date_debut: string | null; date_fin: string | null
  ligne_prod: string; seuil_rendement: number; seuil_perte: number; notes: string
  rendement: number; est_en_retard: boolean
  priorite: 'urgente' | 'normale' | 'planifiee'
  priorite_label?: string
  sequence: number
  affectations?: Affectation[]
  cree_par_nom?: string; date_creation?: string
}

// ── Stats Dashboard ────────────────────────────────────────────────────────────

export interface StatsProduction {
  of_en_cours: number
  of_confirmes: number
  of_en_retard: number
  rendement_moyen: number
  rendement_ofs: Array<{ of: string; rendement: number }>
  ofs_recents: Array<{
    reference: string; produit: string
    quantite_prevue: number; quantite_produite: number; unite: string
    statut: StatutOF; statut_label: string; rendement: number
  }>
  production_7j: Array<{ jour: string; produit: number; cible: number }>
  alertes_peremption: number
  alertes_stock: number
  alertes_rendement: Array<{ reference: string; rendement: number; seuil: number; message: string }>
}

export interface Affectation {
  id: string; employe: string; employe_nom: string; role_prod: string
}

export type StatutLot = 'disponible' | 'epuise' | 'bloque' | 'perime'

export interface Lot {
  id: string; numero_lot: string
  article: string; article_detail: Article
  date_fabrication: string; date_peremption: string | null
  quantite_initiale: number; quantite_restante: number
  valeur_residuelle?: number
  cout_unitaire: number; statut: StatutLot; statut_label: string
  jours_avant_peremption: number | null; est_proche_peremption: boolean
  ordre_fabrication: string | null; notes: string; date_creation: string
}

export interface Perte {
  id: string; of: string; article: string; article_designation: string
  type: 'rebut' | 'dechet' | 'perte' | 'casse'; type_label: string
  quantite: number; motif: string; date_saisie: string
}

export interface CoutRevient {
  id: string; of: string
  cout_matieres: number; cout_main_oeuvre: number; cout_charges: number
  cout_total: number; cout_unitaire: number; cout_standard: number
  ecart_rendement: number; ecart_cout: number
  date_calcul: string
}

export interface TracabiliteOF {
  of: { reference: string; statut: string }
  lots_pf: Lot[]
  consommations: Array<{
    lot_mp_numero: string; lot_pf_numero: string; quantite: number; date_consommation: string
  }>
}

export interface DisponibiliteMatieres {
  tout_disponible: boolean
  composants: Array<{
    matiere_id: string; matiere: string; unite: string
    quantite_necessaire: number; quantite_disponible: number
    suffisant: boolean; manque: number
  }>
}

export interface PagedResponse<T> {
  count: number; next: string | null; previous: string | null; results: T[]
}

export interface ProchainCodeResponse {
  code: string
  prefix: string
  sequence: number
  type_id: string
  type_code: string
}

// ── API ───────────────────────────────────────────────────────────────────────

export const productionApi = {

  // ── Types d'articles (P2-A) ─────────────────────────────────────────────────
  listTypesArticles: () =>
    api.get<TypeArticle[]>('/production/types-articles/'),

  getTypeArticle: (id: string) =>
    api.get<TypeArticle>(`/production/types-articles/${id}/`),

  createTypeArticle: (data: Partial<TypeArticle>) =>
    api.post<TypeArticle>('/production/types-articles/', data),

  updateTypeArticle: (id: string, data: Partial<TypeArticle>) =>
    api.patch<TypeArticle>(`/production/types-articles/${id}/`, data),

  deleteTypeArticle: (id: string) =>
    api.delete(`/production/types-articles/${id}/`),

  // ── Articles ────────────────────────────────────────────────────────────────
  listArticles: (params?: Record<string, unknown>) =>
    api.get<PagedResponse<Article>>('/production/articles/', { params }),

  getArticle: (id: string) =>
    api.get<Article>(`/production/articles/${id}/`),

  createArticle: (data: Partial<Article> & { unite: string }) =>
    api.post<Article>('/production/articles/', data),

  updateArticle: (id: string, data: Partial<Article>) =>
    api.patch<Article>(`/production/articles/${id}/`, data),

  deleteArticle: (id: string) =>
    api.delete(`/production/articles/${id}/`),

  /**
   * P2-E — Génère le prochain code article côté serveur.
   * Accepte le UUID ou le code texte du TypeArticle (?type=<uuid|code>).
   */
  prochainCodeArticle: (typeParam: string) =>
    api.get<ProchainCodeResponse>(`/production/articles/prochain-code/?type=${typeParam}`),

  // ── Unités de mesure ────────────────────────────────────────────────────────
  listUnites: () =>
    api.get<UniteMesure[]>('/production/unites-mesure/'),

  createUnite: (data: Partial<UniteMesure>) =>
    api.post<UniteMesure>('/production/unites-mesure/', data),

  updateUnite: (id: string, data: Partial<UniteMesure>) =>
    api.patch<UniteMesure>(`/production/unites-mesure/${id}/`, data),

  deleteUnite: (id: string) =>
    api.delete(`/production/unites-mesure/${id}/`),

  // ── OFs ─────────────────────────────────────────────────────────────────────
  listOFs: (params?: Record<string, unknown>) =>
    api.get<PagedResponse<OrdreFabrication>>('/production/ordres-fabrication/', { params }),

  getOF: (id: string) =>
    api.get<OrdreFabrication>(`/production/ordres-fabrication/${id}/`),

  createOF: (data: Partial<OrdreFabrication>) =>
    api.post<OrdreFabrication>('/production/ordres-fabrication/', data),

  updateOF: (id: string, data: Partial<OrdreFabrication>) =>
    api.patch<OrdreFabrication>(`/production/ordres-fabrication/${id}/`, data),

  deleteOF: (id: string) =>
    api.delete(`/production/ordres-fabrication/${id}/`),

  // Actions métier OF
  verifierMatieres: (id: string) =>
    api.post<DisponibiliteMatieres>(`/production/ordres-fabrication/${id}/verifier-matieres/`),

  confirmerOF: (id: string) =>
    api.post(`/production/ordres-fabrication/${id}/confirmer/`),

  demarrerOF: (id: string) =>
    api.post(`/production/ordres-fabrication/${id}/demarrer/`),

  terminerOF: (id: string, quantite_produite: number) =>
    api.post(`/production/ordres-fabrication/${id}/terminer/`, { quantite_produite }),

  cloturerOF: (id: string, cout_main_oeuvre?: number, cout_charges?: number) =>
    api.post(`/production/ordres-fabrication/${id}/cloturer/`, { cout_main_oeuvre, cout_charges }),

  annulerOF: (id: string) =>
    api.post(`/production/ordres-fabrication/${id}/annuler/`),

  tracabiliteOF: (id: string) =>
    api.get<TracabiliteOF>(`/production/ordres-fabrication/${id}/tracabilite/`),

  // Affectations
  addAffectation: (ofId: string, data: { employe: string; role_prod: string }) =>
    api.post<Affectation>(`/production/ordres-fabrication/${ofId}/affecter/`, data),

  removeAffectation: (ofId: string, affectationId: string) =>
    api.delete(`/production/ordres-fabrication/${ofId}/retirer/${affectationId}/`),

  // Pertes
  listPertes: (ofId?: string) =>
    api.get<PagedResponse<Perte>>('/production/pertes/', { params: ofId ? { of: ofId } : undefined }),

  createPerte: (data: Partial<Perte> & { of: string }) =>
    api.post<Perte>('/production/pertes/', data),

  // Coûts de revient
  getCoutRevient: (ofId: string) =>
    api.get<PagedResponse<CoutRevient>>('/production/couts-revient/', { params: { of: ofId } }),

  updateCoutRevient: (id: string, data: Partial<CoutRevient>) =>
    api.patch<CoutRevient>(`/production/couts-revient/${id}/`, data),

  // Nomenclatures
  listNomenclatures: (params?: Record<string, unknown>) =>
    api.get<PagedResponse<Nomenclature>>('/production/nomenclatures/', { params }),

  getNomenclature: (id: string) =>
    api.get<Nomenclature>(`/production/nomenclatures/${id}/`),

  createNomenclature: (data: unknown) =>
    api.post<Nomenclature>('/production/nomenclatures/', data),

  updateNomenclature: (id: string, data: unknown) =>
    api.patch<Nomenclature>(`/production/nomenclatures/${id}/`, data),

  dupliquerNomenclature: (id: string) =>
    api.post<Nomenclature>(`/production/nomenclatures/${id}/dupliquer/`),

  deleteNomenclature: (id: string) =>
    api.delete(`/production/nomenclatures/${id}/`),

  // Lots
  listLots: (params?: Record<string, unknown>) =>
    api.get<PagedResponse<Lot>>('/production/lots/', { params }),

  getLot: (id: string) =>
    api.get<Lot>(`/production/lots/${id}/`),

  createLot: (data: Partial<Lot> & { article: string }) =>
    api.post<Lot>('/production/lots/', data),

  updateLot: (id: string, data: Partial<Lot>) =>
    api.patch<Lot>(`/production/lots/${id}/`, data),

  alertesPeremption: (jours = 7) =>
    api.get<Lot[]>(`/production/lots/alertes-peremption/?jours=${jours}`),

  bloquerLot: (id: string, motif: string) =>
    api.post(`/production/lots/${id}/bloquer/`, { motif }),

  debloquerLot: (id: string) =>
    api.post(`/production/lots/${id}/debloquer/`),

  detruireLot: (id: string, justification: string) =>
    api.post(`/production/lots/${id}/detruire/`, { justification }),

  tracabiliteLot: (id: string) =>
    api.get(`/production/lots/${id}/tracabilite/`),

  rapportPdfLot: (id: string) =>
    api.get(`/production/lots/${id}/rapport-pdf/`, { responseType: 'blob' }),

  // Stats Dashboard
  statsProduction: () =>
    api.get<StatsProduction>('/production/ordres-fabrication/stats/'),
}
