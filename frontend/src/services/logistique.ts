/**
 * MEPALE ERP — Service API Logistique
 * Couvre : Fournisseurs, Stock, Demandes d'achat, Bons de commande, Réceptions,
 *           Factures fournisseurs, Inventaires physiques, Évaluations fournisseurs
 */

import api from '@/services/api'

// ─── Types communs ────────────────────────────────────────────────────────────

export type CategorieFournisseur  = 'mp' | 'serv' | 'immo' | 'gen'
export type QualificationFournisseur = 'en_evaluation' | 'approuve' | 'suspendu' | 'blackliste'
export type TypeContrat = 'cadre' | 'exclusivite' | 'annuel' | 'ponctuel'
export type StatutDA  = 'brouillon' | 'soumise' | 'approuvee' | 'refusee' | 'traitee' | 'attente_direction'
export type StatutBC  = 'brouillon' | 'envoye' | 'confirme' | 'partiel' | 'recu' | 'annule'
export type StatutReception  = 'en_cours' | 'validee' | 'rejetee'  // GAP R13
export type TypeMouvementManuel = 'ajust_pos' | 'ajust_neg'
export type StatutFacture    =
  | 'brouillon' | 'soumise' | 'attente_direction' | 'rejetee'
  | 'en_attente' | 'partiellement_payee' | 'payee' | 'annulee'
export type TypeDocumentFacture = 'facture' | 'avoir' | 'frais'
export type StatutInventaire  = 'en_cours' | 'valide' | 'annule'
export type TypePerimetre     = 'complet' | 'categorie' | 'articles'
export type StatutSaisie      = 'non_saisie' | 'saisie' | 'validee'
export type ModePaiement     = 'virement' | 'cheque' | 'especes' | 'mobile_money' | 'avoir'

export interface PaginatedResponse<T> {
  count: number; next: string | null; previous: string | null; results: T[]
}

// ─── Fournisseurs ─────────────────────────────────────────────────────────────

export interface Fournisseur {
  id: string; code: string; raison_sociale: string
  nif: string; categorie: CategorieFournisseur; categorie_label: string
  qualification: QualificationFournisseur; qualification_label: string
  telephone: string; email: string; adresse: string; ville: string; pays: string
  delai_livraison: number; conditions_paiement: string
  banque: string; rib: string
  actif: boolean; blackliste: boolean; motif_blacklist: string
  notes: string; date_creation: string; date_modif: string
  // KPIs agrégés (12 mois)
  note_qualite_moy: number | null
  note_delai_moy:   number | null
  taux_conformite:  number | null
  taux_otd:         number | null
  nb_evaluations:   number
  solde_ouvert:     number
}

export interface ContactFournisseur {
  id: string; fournisseur: string
  nom: string; role: string; telephone: string; email: string
  principal: boolean; notes: string; date_creation: string
}

export interface FournisseurArticle {
  id: string; fournisseur: string; article: string
  article_detail: { id: string; code: string; designation: string; unite_code: string }
  reference_fournisseur: string
  prix_unitaire: number; delai_livraison: number; quantite_min_commande: number
  actif: boolean; date_derniere_commande: string | null; notes: string
  date_creation: string; date_modif: string
}

export interface ContratFournisseur {
  id: string; fournisseur: string
  reference: string; type_contrat: TypeContrat; type_contrat_label: string
  date_debut: string; date_fin: string | null
  montant_max: number | null; actif: boolean
  description: string; est_expire: boolean
  date_creation: string; date_modif: string
}

export interface EvaluationFournisseur {
  id: string; fournisseur: string
  note_qualite: number; note_delai: number; note_prix: number; note_moyenne: number
  commentaire: string; evaluateur_nom: string; date_evaluation: string
  bon_commande?: string; bon_commande_ref?: string
}

// ─── Stock ────────────────────────────────────────────────────────────────────

export interface ArticleDetail {
  id: string; code: string; designation: string
  unite_code: string; type: string; type_label: string
}

/** S6 — Niveau d'alerte multi-paliers du stock */
export type NiveauAlerteStock = 'ok' | 'warning' | 'critique'

export interface StockArticle {
  id: string; article: string; article_detail: ArticleDetail
  quantite_disponible: number; quantite_reservee: number; quantite_physique: number
  /** M4 — Stock physique bloqué (lots non conformes qualité, jamais entrés en disponible) */
  quantite_quarantaine: number
  /** M5 — Quantité commandée en BC ouverts (on-order), non encore réceptionnée */
  quantite_en_commande: number
  seuil_alerte: number; stock_min: number; stock_securite: number; qte_reappro: number
  en_alerte: boolean
  est_sous_seuil: boolean
  /** S6 — True si dispo < stock_min (commande urgente requise) */
  est_critique: boolean
  /** S6 — 'critique' | 'warning' | 'ok' */
  niveau_alerte: NiveauAlerteStock
  /** M6 — Valeur financière = quantite_disponible × prix_standard (FCFA) */
  valeur_stock: number
  derniere_maj: string
}

// ─── Stock : types annexes ────────────────────────────────────────────────────

/** S3 — Proposition de réapprovisionnement (MD07-like) */
export interface PropositionReappro {
  stock_id: string
  article_id: string; article_code: string; article_designation: string; unite: string
  quantite_disponible: number
  seuil_alerte: number; stock_min: number; stock_securite: number
  niveau_alerte: NiveauAlerteStock
  qte_suggeree: number
  fournisseur_id: string | null; fournisseur_nom: string | null
  fournisseur_ref: string | null; prix_unitaire: number | null
  delai_livraison: number | null
}

/** S3 — Paramètres pour créer une DA groupée depuis les propositions */
export interface CreerDAGroupeePayload {
  urgence?: boolean
  notes?: string
  lignes: { article: string; quantite: number }[]
}

/** S4 — Écart de cohérence réservations */
export interface EcartReservation {
  stock_id: string; article: string
  reservee_compteur: number; reservee_lots: number; delta: number
}

/** S5 — Résultat d'audit stock */
export interface AuditStockArticle {
  article: string; existe: boolean
  physique_compteur?: number; physique_mouvements?: number
  delta?: number; coherent?: boolean
}

/** S7 — Alerte stock enrichie */
export interface AlerteStock {
  stock_id: string; article_id: string
  article_code: string; article_designation: string; unite: string
  niveau_alerte: NiveauAlerteStock
  quantite_disponible: number; quantite_physique: number
  seuil_alerte: number; stock_min: number; stock_securite: number
  valeur_stock: number; action_recommandee: string
}

/** S8 — Lot proche de la péremption */
export interface LotPeremption {
  lot_id: string; numero_lot: string
  article_id: string; article_code: string; article_designation: string; unite: string
  quantite_restante: number; date_peremption: string
  jours_restants: number; urgence: boolean
}

/** S10 — Ligne de rapport stock périodique */
export interface RapportStockPeriodique {
  article_id: string; article_code: string; article_designation: string; unite: string
  prix_standard: number
  stock_ouverture: number; total_entrees: number; total_sorties: number
  stock_cloture: number; valeur_cloture: number
}

export interface MouvementStock {
  id: string; article: string; article_designation: string
  lot: string | null; lot_numero: string | null
  type: string; type_label: string
  quantite: number; sens: 1 | -1; cout_unitaire: number
  reference_doc: string; notes: string
  piece_jointe: string | null
  effectue_par_nom: string; date_mouvement: string
  /** M9 — Date économique réelle (optionnelle). Si null, date_mouvement fait foi. */
  date_comptable: string | null
}

// ─── Demandes d'Achat ─────────────────────────────────────────────────────────

export interface LigneDemandeAchat {
  id: string; article: string
  article_detail: { code: string; designation: string; unite_code: string }
  quantite: number
  /** Quantité déjà commandée en BC (géré par le système) */
  quantite_commandee: number
  /** Quantité restante à commander (= quantite - quantite_commandee, min 0) */
  quantite_restante: number
  /** Prix unitaire estimé (FCFA) — optionnel, sert à calculer le montant_estime de la DA */
  prix_unitaire_estime: number | null
  fournisseur_suggere: string | null
  notes: string
  /** Référence de la DA parente */
  demande_reference: string
}

export interface DemandeAchat {
  id: string; reference: string
  statut: StatutDA; statut_label: string
  urgence: boolean
  montant_estime: number | null
  notes: string
  version: number
  da_parente: string | null
  da_parente_reference: string | null
  peut_etre_modifie: boolean
  demandeur: string; demandeur_nom: string
  approuve_par: string | null; approuve_par_nom: string | null
  date_creation: string; date_modif: string
  lignes: LigneDemandeAchat[]
}

export interface LigneDAUpdate {
  id?: string
  article: string
  quantite: number
  prix_unitaire_estime?: number | null
  notes?: string
}

export interface DemandeAchatUpdate {
  urgence?: boolean
  notes?: string
  lignes?: LigneDAUpdate[]
}

// ─── Conditions tarifaires ────────────────────────────────────────────────────

export type ModeCalculCondition = 'pourcentage' | 'montant_fixe'
export type TypeEffetCondition  = 'majoration'  | 'reduction'
export type NiveauCondition     = 'bc' | 'ligne'

export interface ConditionTarifaire {
  id: string; nom: string
  mode_calcul: ModeCalculCondition; mode_calcul_label: string
  type_effet: TypeEffetCondition;   type_effet_label: string
  niveau: NiveauCondition;          niveau_label: string
  valeur_defaut: number
  description: string; actif: boolean
  nb_applications: number
  date_creation: string; date_modif: string
}

export interface ConditionAppliqueeBC {
  id: string
  condition: string
  bon_commande: string | null
  ligne_bc: string | null
  ordre: number
  valeur: number
  nom_snapshot: string
  mode_calcul_snapshot: ModeCalculCondition
  type_effet_snapshot: TypeEffetCondition
}

// ─── Bons de Commande ─────────────────────────────────────────────────────────

export interface LigneBonCommande {
  id: string; article: string
  article_detail: { code: string; designation: string; unite_code: string }
  quantite_commandee: number; quantite_recue: number; quantite_restante: number
  prix_unitaire: number; montant_ht: number
  conditions: ConditionAppliqueeBC[]
  /** ID de la ligne DA d'origine (si BC créé depuis une DA) */
  ligne_da: string | null
}

export interface BonCommande {
  id: string; reference: string
  fournisseur: string; fournisseur_detail: { code: string; raison_sociale: string }
  statut: StatutBC; statut_label: string
  /** Numéro de version — incrémenté à chaque amendement */
  version: number
  date_commande: string; date_livraison_prev: string | null
  adresse_livraison: string
  montant_ht: number; montant_ttc: number
  /** Somme des montant_ht des factures non-annulées liées à ce BC */
  montant_ht_facture: number
  /** Somme des montant_ttc des factures non-annulées liées à ce BC */
  montant_ttc_facture: number
  /** True si la date de livraison prévue est dépassée et le BC n'est pas encore reçu */
  est_en_retard: boolean
  notes: string; cree_par: string; cree_par_nom: string
  lignes: LigneBonCommande[]
  conditions: ConditionAppliqueeBC[]
  date_creation: string; date_modif: string
}

// ─── Réceptions ──────────────────────────────────────────────────────────────

export interface LigneReception {
  id: string; ligne_bc: string
  article_detail: { code: string; designation: string; unite_code: string }
  quantite_commandee: number
  quantite_restante: number
  quantite_recue: number
  numero_lot_fournisseur: string; date_peremption: string | null
  conforme: boolean                    // GAP R1
  motif_non_conformite: string         // GAP R1
  lot_cree: string | null
}

export interface Reception {
  id: string; reference: string
  bon_commande: string
  bon_commande_detail: {
    reference: string
    fournisseur_detail: { raison_sociale: string }
  }
  statut: StatutReception; statut_label: string
  date_reception: string
  numero_bl_fournisseur: string        // GAP R16
  piece_jointe_bl: string | null       // GAP R8
  notes: string
  lignes: LigneReception[]
  est_livraison_a_temps: boolean | null
  jours_retard: number | null
  nb_lignes_nc: number                 // GAP R14
  date_creation: string
  recue_par: string | null
}

// ─── Retours Fournisseurs (GAP R4) ────────────────────────────────────────────

export type StatutRetour = 'en_cours' | 'valide'

export interface LigneRetour {
  id: string
  ligne_reception: string
  article_designation: string
  lot_numero: string | null
  lot_statut: string | null
  quantite_recue_origine: number
  quantite_retournee: number
}

export interface RetourFournisseur {
  id: string; reference: string
  reception: string; reception_ref: string
  fournisseur: string; fournisseur_nom: string
  statut: StatutRetour; statut_label: string
  date_retour: string; motif: string; notes: string
  lignes: LigneRetour[]
  cree_par: string | null; cree_par_nom: string | null
  date_creation: string; date_modif: string
}

// ─── Factures Fournisseurs ────────────────────────────────────────────────────

export interface LigneFactureFournisseur {
  id: string
  ligne_bc: string | null
  article_designation: string | null
  designation: string
  quantite: number
  prix_unitaire: number
  taux_tva: number
  montant_ht: number
  montant_tva: number
  montant_ttc: number
}

export interface EcheanceFacture {
  id: string
  montant: number
  date_echeance: string
  payee: boolean
  notes: string
  est_en_retard: boolean
}

export interface PaiementFacture {
  id: string; montant: number
  date_paiement: string; mode_paiement: ModePaiement; mode_paiement_label: string
  reference_paiement: string; effectue_par_nom: string
  piece_jointe: string | null          // F13
  annule: boolean                      // F14
  date_saisie: string
  notes: string
}

export interface FactureFournisseur {
  id: string; reference: string
  type_document: TypeDocumentFacture; type_document_label: string   // F7
  facture_origine: string | null; facture_origine_ref: string | null // F8
  fournisseur: string; fournisseur_detail: { code: string; raison_sociale: string }
  bon_commande: string | null; bon_commande_ref: string | null
  reception: string | null; reception_ref: string | null
  statut: StatutFacture; statut_label: string
  montant_ht: number; tva: number; montant_ttc: number
  montant_paye: number; montant_restant: number
  est_en_retard: boolean
  est_avoir: boolean                   // F8
  date_facture: string; date_echeance: string | null
  ref_fournisseur: string
  piece_jointe: string | null          // F2
  approuve_par: string | null; approuve_par_nom: string | null  // F1
  date_approbation: string | null      // F1
  notes: string
  lignes: LigneFactureFournisseur[]    // F9
  echeances: EcheanceFacture[]         // F10
  paiements: PaiementFacture[]
  nb_paiements_actifs: number
  date_creation: string
  alerte_3way: string[]                // F3 — liste d'alertes (vide = OK)
}

// ── Stats Dashboard Logistique ─────────────────────────────────────────────────

export interface StatsLogistique {
  // BC
  bc_brouillon: number
  bc_envoye: number
  bc_en_retard: number
  // Factures
  factures_en_retard: number
  // Stock
  articles_sous_seuil: number
  // DA
  da_soumises: number
  da_approuvees: number
  da_attente_direction: number
  // Réceptions (GAP R12)
  receptions_en_cours: number
  taux_otd_mois: number | null         // % OTD mois courant
  lignes_nc_mois: number               // Nb lignes non conformes mois courant
}

// ─── Inventaires Physiques ────────────────────────────────────────────────────

export interface LigneInventaire {
  id: string
  lot: string | null             // null pour les articles sans lot (gere_par_lot=false)
  article: string | null         // article direct (gere_par_lot=false), null sinon
  lot_numero: string | null      // null pour les articles sans lot
  article_designation: string | null
  unite_code: string | null
  /** I12 — null si session aveugle + ligne non encore saisie (rôle opérateur) */
  quantite_theorique: number | null
  /** I1 — quantité système capturée au moment de la validation du posting */
  quantite_systeme_validation: number | null
  quantite_comptee: number | null
  ecart: number | null
  justification: string
  valide: boolean
  /** I3 — prix unitaire FCFA utilisé pour la valorisation des écarts */
  prix_unitaire_valorisation: number
  /** I7 — statut de saisie par ligne */
  statut_saisie: StatutSaisie
  statut_saisie_label: string
}

export interface InventaireRapportLigne {
  article: string; lot: string | null
  quantite_systeme: number; quantite_comptee: number; ecart: number
  prix_unitaire: number; impact_financier: number
}

export interface InventaireRapport {
  session_id: string; reference: string; date_validation: string
  nb_lignes: number; nb_lignes_avec_ecart: number
  impact_financier_total: number
  lignes: InventaireRapportLigne[]
}

export interface InventaireSession {
  id: string; reference: string
  statut: StatutInventaire; statut_label: string
  /** I4 — périmètre de l'inventaire */
  type_perimetre: TypePerimetre; type_perimetre_label: string
  /** I4 — liste de types d'articles ciblés ex: ['mp','pf'] */
  categories: string[]
  /** I4 — articles spécifiques ciblés (UUIDs) */
  articles_cibles: string[]
  /** I12 — masque la quantité théorique aux opérateurs lors de la saisie */
  aveugle: boolean
  date_debut: string; date_fin: string | null
  notes: string; cree_par_nom: string
  lignes: LigneInventaire[]
  nb_lignes: number; nb_ecarts: number
  /** I9 — lignes sans quantite_comptee */
  nb_lignes_non_comptees: number
  /** I9 — % de lignes saisies (0–100) */
  taux_completion: number | null
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const logistiqueApi = {

  // ── Fournisseurs ──────────────────────────────────────────────────────────

  listFournisseurs: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Fournisseur>>('/logistique/fournisseurs/', { params }),

  getFournisseur: (id: string) =>
    api.get<Fournisseur>(`/logistique/fournisseurs/${id}/`),

  createFournisseur: (data: Partial<Fournisseur>) =>
    api.post<Fournisseur>('/logistique/fournisseurs/', data),

  updateFournisseur: (id: string, data: Partial<Fournisseur>) =>
    api.patch<Fournisseur>(`/logistique/fournisseurs/${id}/`, data),

  blacklisterFournisseur: (id: string, motif: string) =>
    api.post(`/logistique/fournisseurs/${id}/blacklister/`, { motif }),

  reactiverFournisseur: (id: string) =>
    api.post(`/logistique/fournisseurs/${id}/reactiver/`),

  prochainCodeFournisseur: () =>
    api.get<{ code: string }>('/logistique/fournisseurs/prochain-code/'),

  // ── Contacts Fournisseur ──────────────────────────────────────────────────

  listContacts: (fournisseurId: string) =>
    api.get<PaginatedResponse<ContactFournisseur>>('/logistique/contacts-fournisseur/', {
      params: { fournisseur: fournisseurId },
    }),

  createContact: (data: Partial<ContactFournisseur> & { fournisseur: string }) =>
    api.post<ContactFournisseur>('/logistique/contacts-fournisseur/', data),

  updateContact: (id: string, data: Partial<ContactFournisseur>) =>
    api.patch<ContactFournisseur>(`/logistique/contacts-fournisseur/${id}/`, data),

  deleteContact: (id: string) =>
    api.delete(`/logistique/contacts-fournisseur/${id}/`),

  // ── Catalogue Articles Fournisseur ────────────────────────────────────────

  listArticlesFournisseur: (fournisseurId: string) =>
    api.get<PaginatedResponse<FournisseurArticle>>('/logistique/articles-fournisseur/', {
      params: { fournisseur: fournisseurId },
    }),

  createArticleFournisseur: (data: Partial<FournisseurArticle> & { fournisseur: string; article: string }) =>
    api.post<FournisseurArticle>('/logistique/articles-fournisseur/', data),

  updateArticleFournisseur: (id: string, data: Partial<FournisseurArticle>) =>
    api.patch<FournisseurArticle>(`/logistique/articles-fournisseur/${id}/`, data),

  deleteArticleFournisseur: (id: string) =>
    api.delete(`/logistique/articles-fournisseur/${id}/`),

  // ── Contrats Fournisseur ──────────────────────────────────────────────────

  listContrats: (fournisseurId: string) =>
    api.get<PaginatedResponse<ContratFournisseur>>('/logistique/contrats-fournisseur/', {
      params: { fournisseur: fournisseurId },
    }),

  createContrat: (data: Partial<ContratFournisseur> & { fournisseur: string }) =>
    api.post<ContratFournisseur>('/logistique/contrats-fournisseur/', data),

  updateContrat: (id: string, data: Partial<ContratFournisseur>) =>
    api.patch<ContratFournisseur>(`/logistique/contrats-fournisseur/${id}/`, data),

  deleteContrat: (id: string) =>
    api.delete(`/logistique/contrats-fournisseur/${id}/`),

  // Évaluations fournisseurs
  listEvaluations: (fournisseurId: string) =>
    api.get<PaginatedResponse<EvaluationFournisseur>>('/logistique/evaluations/', {
      params: { fournisseur: fournisseurId },
    }),

  createEvaluation: (data: Partial<EvaluationFournisseur> & { fournisseur: string }) =>
    api.post<EvaluationFournisseur>('/logistique/evaluations/', data),

  // ── Stock ─────────────────────────────────────────────────────────────────

  listStock: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<StockArticle>>('/logistique/stock/', { params }),

  updateSeuilsStock: (id: string, data: Partial<StockArticle>) =>
    api.patch<StockArticle>(`/logistique/stock/${id}/`, data),

  genererDA: (stockId: string) =>
    api.post(`/logistique/stock/${stockId}/generer-da/`),

  /** M6 — Valeur financière totale du stock disponible (tous articles) */
  valeurTotaleStock: () =>
    api.get<{ valeur_totale: number; nb_articles: number }>('/logistique/stock/valeur-totale/'),

  /**
   * S3 — Propositions de réapprovisionnement (MD07-like).
   * Liste tous les articles sous seuil avec quantité suggérée et meilleur fournisseur.
   */
  propositionsReappro: () =>
    api.get<{ count: number; results: PropositionReappro[] }>('/logistique/stock/propositions-reappro/'),

  /**
   * S3 — Crée une DA groupée depuis une sélection de propositions.
   * Retourne la DA créée.
   */
  creerDAGroupee: (data: CreerDAGroupeePayload) =>
    api.post<DemandeAchat>('/logistique/stock/creer-da-groupee/', data),

  /**
   * S4 — Audit de cohérence : liste les articles dont quantite_reservee
   * diffère de la somme des ReservationLot actives. Admin uniquement.
   */
  auditReservations: () =>
    api.get<{ nb_ecarts: number; ecarts: EcartReservation[] }>('/logistique/stock/audit-reservations/'),

  /**
   * S4 — Corrige la dérive de quantite_reservee pour un article. Admin uniquement.
   */
  recalculerReservations: (stockId: string) =>
    api.post(`/logistique/stock/${stockId}/recalculer-reservations/`),

  /**
   * S5 — Audit de cohérence stock global : compare quantite_physique compteur
   * vs somme algébrique des mouvements. Admin uniquement.
   */
  auditStock: () =>
    api.get<{ nb_articles_verifies: number; nb_incoherents: number; incoherents: AuditStockArticle[] }>(
      '/logistique/stock/audit-stock/'
    ),

  /**
   * S5 — Recalcule et corrige quantite_disponible depuis les mouvements. Admin uniquement.
   */
  recalculerStock: (stockId: string) =>
    api.post(`/logistique/stock/${stockId}/recalculer/`),

  /**
   * S7 — Liste toutes les alertes actives (warning + critique) classées par urgence.
   * Les critiques (< stock_min) apparaissent en premier.
   */
  alertesStock: () =>
    api.get<{ count: number; results: AlerteStock[] }>('/logistique/stock/alertes/'),

  /**
   * S8 — Lots disponibles qui expirent dans les <jours> prochains jours (défaut : 30).
   * Triés par date_peremption ASC. urgence=true si jours_restants <= 7.
   */
  lotsPeremption: (jours = 30) =>
    api.get<{ count: number; jours: number; results: LotPeremption[] }>(
      '/logistique/stock/lots-peremption/',
      { params: { jours } }
    ),

  /**
   * S10 — Rapport stock périodique par article (kardex agrégé).
   * Retourne stock_ouverture, total_entrees, total_sorties, stock_cloture, valeur_cloture.
   * article (UUID) est optionnel pour filtrer sur un seul article.
   */
  rapportStockPeriodique: (params: { date_debut: string; date_fin: string; article?: string }) =>
    api.get<{ date_debut: string; date_fin: string; nb_articles: number; rapport: RapportStockPeriodique[] }>(
      '/logistique/stock/rapport-periodique/',
      { params }
    ),

  // ── Mouvements ────────────────────────────────────────────────────────────

  /**
   * M1 — Filtres disponibles :
   * article (UUID), lot (UUID), type (multiple), sens (1|-1),
   * effectue_par (UUID), reference_doc (icontains),
   * date_min / date_max (date économique : comptable si renseignée, sinon système),
   * date_mouvement_min/max, date_comptable_min/max (filtres stricts)
   */
  listMouvements: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<MouvementStock>>('/logistique/mouvements/', { params }),

  /**
   * Saisie manuelle — envoie du FormData (supporte piece_jointe).
   * M9 — date_comptable optionnel pour saisie rétroactive.
   * M8 — le backend valide que lot.article == article si lot fourni.
   * M2 — le backend bloque si stock insuffisant pour sens=-1.
   */
  createMouvement: (data: FormData) =>
    api.post<MouvementStock>('/logistique/mouvements/', data),

  /**
   * M10 — Export CSV des mouvements filtrés (streaming blob).
   * Supporte les mêmes paramètres que listMouvements.
   * UTF-8 BOM inclus pour compatibilité Excel.
   */
  exportMouvements: (params?: Record<string, unknown>) =>
    api.get('/logistique/mouvements/export/', { params, responseType: 'blob' }),

  // ── Demandes d'Achat ──────────────────────────────────────────────────────

  listDemandesAchat: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<DemandeAchat>>('/logistique/demandes-achat/', { params }),

  getDemandeAchat: (id: string) =>
    api.get<DemandeAchat>(`/logistique/demandes-achat/${id}/`),

  createDemandeAchat: (data: Partial<DemandeAchat>) =>
    api.post<DemandeAchat>('/logistique/demandes-achat/', data),

  updateDemandeAchat: (id: string, data: DemandeAchatUpdate) =>
    api.patch<DemandeAchat>(`/logistique/demandes-achat/${id}/`, data),

  soumettreDA: (id: string) =>
    api.post(`/logistique/demandes-achat/${id}/soumettre/`),

  approuverDA: (id: string) =>
    api.post(`/logistique/demandes-achat/${id}/approuver/`),

  refuserDA: (id: string, motif: string) =>
    api.post(`/logistique/demandes-achat/${id}/refuser/`, { motif }),

  convertirEnBC: (id: string, fournisseurId?: string) =>
    api.post(`/logistique/demandes-achat/${id}/convertir-bc/`, fournisseurId ? { fournisseur: fournisseurId } : {}),

  /** Lignes de DAs approuvées avec quantite_restante > 0 (pour import dans un BC) */
  listDALignesDisponibles: (fournisseurId?: string) =>
    api.get<LigneDemandeAchat[]>('/logistique/demandes-achat/lignes-disponibles/', {
      params: fournisseurId ? { fournisseur: fournisseurId } : undefined,
    }),

  approuverDirection: (id: string) =>
    api.post(`/logistique/demandes-achat/${id}/approuver-direction/`),

  reviserDA: (id: string) =>
    api.post<DemandeAchat>(`/logistique/demandes-achat/${id}/reviser/`),

  // ── Bons de Commande ──────────────────────────────────────────────────────

  listBonsCommande: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<BonCommande>>('/logistique/bons-commande/', { params }),

  getBonCommande: (id: string) =>
    api.get<BonCommande>(`/logistique/bons-commande/${id}/`),

  createBonCommande: (data: Partial<BonCommande>) =>
    api.post<BonCommande>('/logistique/bons-commande/', data),

  updateBonCommande: (id: string, data: Partial<BonCommande>) =>
    api.patch<BonCommande>(`/logistique/bons-commande/${id}/`, data),

  envoyerBC: (id: string) =>
    api.post(`/logistique/bons-commande/${id}/envoyer/`),

  confirmerBC: (id: string) =>
    api.post(`/logistique/bons-commande/${id}/confirmer/`),

  annulerBC: (id: string) =>
    api.post(`/logistique/bons-commande/${id}/annuler/`),

  /** GAP 4 — Clôture manuelle d'un BC partiellement reçu */
  cloturerBC: (id: string, motif?: string) =>
    api.post<{ detail: string; statut: string }>(`/logistique/bons-commande/${id}/cloturer/`, { motif }),

  /** GAP 6 — Amendement BC après envoi (notes, date_livraison_prev, adresse_livraison) */
  amenderBC: (id: string, data: { date_livraison_prev?: string; adresse_livraison?: string; notes?: string; motif?: string }) =>
    api.post<BonCommande>(`/logistique/bons-commande/${id}/amender/`, data),

  /** GAP 7 — BCs en retard de livraison */
  listBCsEnRetard: () =>
    api.get<{ count: number; results: BonCommande[] }>('/logistique/bons-commande/en-retard/'),

  exportPdfBC: (id: string) =>
    api.get(`/logistique/bons-commande/${id}/pdf/`, { responseType: 'blob' }),

  /** Mise à jour en-tête BC brouillon (fournisseur, dates, adresse, notes) */
  updateBC: (id: string, data: {
    fournisseur?: string; date_commande?: string
    date_livraison_prev?: string; adresse_livraison?: string; notes?: string
  }) => api.patch<BonCommande>(`/logistique/bons-commande/${id}/`, data),

  statsLogistique: () =>
    api.get<StatsLogistique>('/logistique/bons-commande/stats/'),

  // ── Lignes BC (brouillon uniquement) ─────────────────────────────────────

  createLigneBC: (data: { bon_commande: string; article: string; quantite_commandee: number; prix_unitaire: number }) =>
    api.post<LigneBonCommande>('/logistique/lignes-bc/', data),

  updateLigneBC: (id: string, data: { quantite_commandee?: number; prix_unitaire?: number }) =>
    api.patch<LigneBonCommande>(`/logistique/lignes-bc/${id}/`, data),

  deleteLigneBC: (id: string) =>
    api.delete(`/logistique/lignes-bc/${id}/`),

  // ── Conditions tarifaires (admin) ─────────────────────────────────────────

  listConditionsTarifaires: (params?: { actif?: boolean; niveau?: NiveauCondition }) =>
    api.get<ConditionTarifaire[]>('/logistique/conditions-tarifaires/', { params }),

  createConditionTarifaire: (data: Partial<ConditionTarifaire>) =>
    api.post<ConditionTarifaire>('/logistique/conditions-tarifaires/', data),

  updateConditionTarifaire: (id: string, data: Partial<ConditionTarifaire>) =>
    api.patch<ConditionTarifaire>(`/logistique/conditions-tarifaires/${id}/`, data),

  deleteConditionTarifaire: (id: string) =>
    api.delete(`/logistique/conditions-tarifaires/${id}/`),

  // ── Conditions appliquées à un BC ou une ligne ─────────────────────────────

  listConditionsBC: (params: { bon_commande?: string; ligne_bc?: string }) =>
    api.get<ConditionAppliqueeBC[]>('/logistique/conditions-bc/', { params }),

  createConditionBC: (data: {
    condition: string
    bon_commande?: string
    ligne_bc?: string
    ordre: number
    valeur: number
  }) => api.post<ConditionAppliqueeBC>('/logistique/conditions-bc/', data),

  updateConditionBC: (id: string, data: { valeur?: number; ordre?: number }) =>
    api.patch<ConditionAppliqueeBC>(`/logistique/conditions-bc/${id}/`, data),

  deleteConditionBC: (id: string) =>
    api.delete(`/logistique/conditions-bc/${id}/`),

  // ── Réceptions ────────────────────────────────────────────────────────────

  listReceptions: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Reception>>('/logistique/receptions/', { params }),

  getReception: (id: string) =>
    api.get<Reception>(`/logistique/receptions/${id}/`),

  createReception: (data: Partial<Reception>) =>
    api.post<Reception>('/logistique/receptions/', data),

  validerReception: (id: string) =>
    api.post<{ detail: string; reception: Reception }>(`/logistique/receptions/${id}/valider/`),

  /** GAP R7 — Télécharger le bon de réception en PDF */
  exportPdfReception: (id: string) =>
    api.get(`/logistique/receptions/${id}/pdf/`, { responseType: 'blob' }),

  // ── Retours Fournisseurs (GAP R4) ─────────────────────────────────────────

  listRetours: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<RetourFournisseur>>('/logistique/retours-fournisseur/', { params }),

  getRetour: (id: string) =>
    api.get<RetourFournisseur>(`/logistique/retours-fournisseur/${id}/`),

  createRetour: (data: {
    reception: string
    date_retour: string
    motif: string
    notes?: string
    lignes: { ligne_reception: string; quantite_retournee: number }[]
  }) =>
    api.post<RetourFournisseur>('/logistique/retours-fournisseur/', data),

  validerRetour: (id: string) =>
    api.post<{ detail: string; retour: RetourFournisseur }>(`/logistique/retours-fournisseur/${id}/valider/`),

  // ── Factures Fournisseurs ─────────────────────────────────────────────────

  listFactures: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<FactureFournisseur>>('/logistique/factures/', { params }),

  getFacture: (id: string) =>
    api.get<FactureFournisseur>(`/logistique/factures/${id}/`),

  createFacture: (data: {
    fournisseur: string
    type_document?: TypeDocumentFacture
    facture_origine?: string
    bon_commande?: string
    reception?: string
    ref_fournisseur?: string
    date_facture: string
    date_echeance?: string
    montant_ht?: number
    tva?: number
    montant_ttc?: number
    notes?: string
    lignes?: Partial<LigneFactureFournisseur>[]
    echeances?: Partial<EcheanceFacture>[]
  }) =>
    api.post<FactureFournisseur>('/logistique/factures/', data),

  updateFacture: (id: string, data: Partial<FactureFournisseur>) =>
    api.patch<FactureFournisseur>(`/logistique/factures/${id}/`, data),

  // F1 — Workflow approbation
  soumettreFacture: (id: string) =>
    api.post<{ detail: string }>(`/logistique/factures/${id}/soumettre/`),

  approuverFacture: (id: string) =>
    api.post<{ detail: string }>(`/logistique/factures/${id}/approuver/`),

  approuverDirectionFacture: (id: string) =>
    api.post<{ detail: string }>(`/logistique/factures/${id}/approuver-direction/`),

  rejeterFacture: (id: string, motif: string) =>
    api.post<{ detail: string }>(`/logistique/factures/${id}/rejeter/`, { motif }),

  annulerFacture: (id: string) =>
    api.post<{ detail: string }>(`/logistique/factures/${id}/annuler/`),

  // F5 + F6 — Paiement avec contrôle surpaiement
  enregistrerPaiement: (factureId: string, data: {
    montant: number
    date_paiement: string
    mode_paiement: ModePaiement
    reference_paiement?: string
    notes?: string
    piece_jointe?: File
  }) => {
    const form = new FormData()
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined) form.append(k, v as string | Blob) })
    return api.post<PaiementFacture>(`/logistique/factures/${factureId}/payer/`, form)
  },

  // F8 — Imputation avoir
  appliquerAvoir: (factureId: string, avoir_id: string, montant: number) =>
    api.post<{ detail: string; facture: FactureFournisseur }>(
      `/logistique/factures/${factureId}/appliquer-avoir/`,
      { avoir_id, montant },
    ),

  // F14 — Annulation paiement
  annulerPaiement: (factureId: string, paiementId: string, motif?: string) =>
    api.post<{ detail: string }>(
      `/logistique/factures/${factureId}/paiements/${paiementId}/annuler/`,
      { motif },
    ),

  // F12 — Factures en retard
  facturesEnRetard: () =>
    api.get<{ count: number; results: FactureFournisseur[] }>('/logistique/factures/en-retard/'),

  // F15 — PDF facture
  exportPdfFacture: (id: string) =>
    api.get(`/logistique/factures/${id}/pdf/`, { responseType: 'blob' }),

  // ── Inventaires Physiques ─────────────────────────────────────────────────

  listInventaires: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<InventaireSession>>('/logistique/inventaires/', { params }),

  getInventaire: (id: string) =>
    api.get<InventaireSession>(`/logistique/inventaires/${id}/`),

  /**
   * I4 — Création avec périmètre optionnel.
   * - type_perimetre='complet' (défaut) → tous les articles/lots
   * - type_perimetre='categorie'        → filtrer par categories ex: ['mp','pf']
   * - type_perimetre='articles'         → filtrer par articles_cibles (UUIDs)
   * I12 — aveugle=true masque quantite_theorique aux opérateurs pendant la saisie
   */
  createInventaire: (data: {
    notes?: string
    type_perimetre?: TypePerimetre
    categories?: string[]
    articles_cibles?: string[]
    aveugle?: boolean
  }) =>
    api.post<InventaireSession>('/logistique/inventaires/', data),

  /**
   * I7 — La saisie marque automatiquement statut_saisie = 'saisie' côté backend.
   * Renvoie la ligne mise à jour avec statut_saisie_label.
   */
  saisirComptage: (
    inventaireId: string,
    ligneId: string,
    quantite_comptee: number,
    justification?: string,
  ) =>
    api.patch<LigneInventaire>(
      `/logistique/inventaires/${inventaireId}/lignes/${ligneId}/`,
      { quantite_comptee, justification },
    ),

  /**
   * I1/I2/I3/I7 — Validation (posting) de l'inventaire.
   * - Si des lignes sont non comptées, le backend renvoie HTTP 400 avec la liste.
   * - forcer_non_comptees=true → marque toutes les lignes non saisies à quantite_theorique
   *   (écart nul) et poursuit la validation sans blocage (I2 soft mode).
   */
  validerInventaire: (id: string, forcer_non_comptees = false) =>
    api.post<{ detail: string; session: InventaireSession }>(
      `/logistique/inventaires/${id}/valider/`,
      { forcer_non_comptees },
    ),

  annulerInventaire: (id: string) =>
    api.post(`/logistique/inventaires/${id}/annuler/`),

  /** I5 — Rapport d'écarts structuré (JSON) avec impact financier */
  rapportInventaire: (id: string) =>
    api.get<InventaireRapport>(`/logistique/inventaires/${id}/rapport/`),

  /** I5 — Export PDF du rapport d'inventaire (blob) */
  exportPdfInventaire: (id: string) =>
    api.get(`/logistique/inventaires/${id}/pdf/`, { responseType: 'blob' }),
}
