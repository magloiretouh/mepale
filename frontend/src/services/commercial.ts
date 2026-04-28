/**
 * MEPALE ERP — Service Commercial (Vente)
 * Interfaces TypeScript + fonctions API pour le module Commercial.
 */

import api from './api'

// ─── Types union ────────────────────────────────────────────────────────────

export type StatutClient        = 'actif' | 'inactif' | 'suspendu'
export type TypeClient          = 'entreprise' | 'particulier'
export type ModePaiementClient  = 'comptant' | '30j' | '60j' | 'virement' | 'cheque' | 'mobile_money'
export type StatutDevis         = 'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'expire'
export type StatutCC            = 'brouillon' | 'confirmee' | 'en_cours_livraison' | 'partiellement_livree' | 'livree' | 'annulee'
export type StatutBL            = 'prepare' | 'expedie' | 'livre' | 'retourne'
export type StatutFacture       = 'brouillon' | 'emise' | 'partiellement_payee' | 'payee' | 'annulee'
export type NiveauRetard        = 'ok' | 'soon' | 'danger'
export type ModePaiementReglem  = 'especes' | 'cheque' | 'virement' | 'mobile_money'
export type StatutRetour        = 'demande' | 'approuve' | 'recu' | 'traite'
export type EtatRetour          = 'bon' | 'defectueux' | 'a_reconditionner'
export type ActionRetour        = 'remise_en_stock' | 'mise_en_rebut' | 'renvoi_client'

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count:    number
  next:     string | null
  previous: string | null
  results:  T[]
}

// ─── CategorieClient ─────────────────────────────────────────────────────────

export interface CategorieClient {
  id:          string
  code:        string
  libelle:     string
  description: string
  actif:       boolean
}

// ─── Client ──────────────────────────────────────────────────────────────────

export interface ContactClient {
  id:        string
  client:    string
  nom:       string
  poste:     string
  telephone: string
  email:     string
  principal: boolean
}

export interface ClientList {
  id:                string
  code:              string
  raison_sociale:    string
  type:              TypeClient
  type_label:        string
  categorie:         string | null
  categorie_libelle: string | null
  telephone:         string
  email:             string
  statut:            StatutClient
  statut_label:      string
  commercial:        number | null
  commercial_nom:    string | null
  date_creation:     string
}

export interface Client extends ClientList {
  categorie_detail:         CategorieClient | null
  secteur_activite:         string
  adresse_facturation:      string
  adresse_livraison:        string
  adresse_livraison_effective: string
  nif:                      string
  rccm:                     string
  numero_contribuable:      string
  delai_paiement:           number
  mode_paiement:            ModePaiementClient
  mode_paiement_label:      string
  plafond_credit:           string | null
  notes:                    string
  actif:                    boolean
  contacts:                 ContactClient[]
  solde_factures:           string
  date_modif:               string
}

export interface ClientCreatePayload {
  raison_sociale:      string
  type:                TypeClient
  categorie?:          string | null
  secteur_activite?:   string
  telephone?:          string
  email?:              string
  adresse_facturation?: string
  adresse_livraison?:  string
  nif?:                string
  rccm?:               string
  numero_contribuable?: string
  delai_paiement?:     number
  mode_paiement?:      ModePaiementClient
  plafond_credit?:     number | null
  commercial?:         number | null
  notes?:              string
}

// ─── Devis ───────────────────────────────────────────────────────────────────

export interface LigneDevis {
  id:                  string
  article:             string
  article_code:        string
  article_designation: string
  unite_code:          string
  quantite:            string
  prix_unitaire:       string
  remise_pct:          string
  montant_ht:          string
}

export interface DevisList {
  id:             string
  reference:      string
  client:         string
  client_nom:     string
  commercial:     number | null
  commercial_nom: string | null
  statut:         StatutDevis
  statut_label:   string
  version:        number
  montant_ht:     string
  date_devis:     string
  date_validite:  string
  date_creation:  string
}

export interface Devis extends DevisList {
  client_detail:    ClientList
  notes_internes:   string
  notes_client:     string
  reference_client: string
  lignes:           LigneDevis[]
  date_modif:       string
}

export interface LigneDevisCreatePayload {
  article:       string
  quantite:      number
  prix_unitaire: number
  remise_pct?:   number
}

export interface DevisCreatePayload {
  client:           string
  commercial?:      number | null
  date_validite:    string
  reference_client?: string
  notes_internes?:  string
  notes_client?:    string
  lignes:           LigneDevisCreatePayload[]
}

// ─── Commande Client ─────────────────────────────────────────────────────────

export interface LigneCommandeClient {
  id:                           string
  article:                      string
  article_code:                 string
  article_designation:          string
  unite_code:                   string
  quantite_commandee:           string
  quantite_livree:              string
  quantite_restante:            string
  prix_unitaire:                string
  remise_pct:                   string
  montant_ht:                   string
  stock_disponible_confirmation: string | null
}

export interface CommandeClientList {
  id:             string
  reference:      string
  client:         string
  client_nom:     string
  commercial:     number | null
  commercial_nom: string | null
  statut:         StatutCC
  statut_label:   string
  montant_ht:     string
  stock_warning:  boolean
  date_commande:  string
  date_livraison_souhaitee: string | null
  date_creation:  string
}

export interface CommandeClient extends CommandeClientList {
  client_detail:           ClientList
  devis:                   string | null
  devis_reference:         string | null
  date_livraison_confirmee: string | null
  reference_client:        string
  conditions_paiement:     string
  notes_internes:          string
  notes_client:            string
  lignes:                  LigneCommandeClient[]
  date_modif:              string
}

export interface LigneCCCreatePayload {
  article:           string
  quantite_commandee: number
  prix_unitaire:     number
  remise_pct?:       number
}

export interface CommandeClientCreatePayload {
  client:                   string
  commercial?:              number | null
  devis?:                   string | null
  date_commande?:           string
  date_livraison_souhaitee?: string
  reference_client?:        string
  conditions_paiement?:     string
  notes_internes?:          string
  notes_client?:            string
  lignes:                   LigneCCCreatePayload[]
}

export interface StockWarningLine {
  ligne_id:             string
  article:              string
  code:                 string
  unite:                string
  quantite_commandee:   number
  quantite_disponible:  number
  suffisant:            boolean
  ecart:                number
}

export interface ConfirmationCCResult {
  detail:          string
  tout_disponible: boolean
  warnings:        StockWarningLine[]
}

// ─── Bon de Livraison ────────────────────────────────────────────────────────

export interface LigneBL {
  id:                  string
  article:             string
  article_code:        string
  article_designation: string
  unite_code:          string
  lot:                 string | null
  lot_numero:          string | null
  quantite:            string
  ligne_commande:      string
  mouvement:           string | null
}

export interface BonLivraisonList {
  id:                string
  reference:         string
  commande:          string
  commande_reference: string
  client_nom:        string
  statut:            StatutBL
  statut_label:      string
  date_preparation:  string
  date_expedition:   string | null
  date_creation:     string
}

export interface BonLivraison extends BonLivraisonList {
  date_livraison_confirmee: string | null
  notes:     string
  lignes:    LigneBL[]
  date_modif: string
}

export interface LigneBLCreatePayload {
  ligne_commande: string
  article:        string
  lot?:           string | null
  quantite:       number
}

export interface BonLivraisonCreatePayload {
  commande:          string
  date_preparation?: string
  notes?:            string
  lignes:            LigneBLCreatePayload[]
}

// ─── Facture Vente ───────────────────────────────────────────────────────────

export interface LigneFactureVente {
  id:           string
  article:      string | null
  article_code: string | null
  designation:  string
  quantite:     string
  prix_unitaire: string
  remise_pct:   string
  montant_ht:   string
}

export interface ReglementClient {
  id:                 string
  facture:            string
  date_reglement:     string
  montant:            string
  mode_paiement:      ModePaiementReglem
  mode_paiement_label: string
  reference_paiement: string
  notes:              string
  saisi_par:          number | null
  saisi_par_nom:      string | null
  date_creation:      string
}

export interface FactureVenteList {
  id:              string
  reference:       string
  client:          string
  client_nom:      string
  statut:          StatutFacture
  statut_label:    string
  montant_ht:      string
  montant_regle:   string
  montant_restant: string
  date_facture:    string
  date_echeance:   string
  est_en_retard:   boolean
  jours_retard:    number
  niveau_retard:   NiveauRetard
  date_creation:   string
}

export interface FactureVente extends FactureVenteList {
  client_detail:      ClientList
  commande:           string | null
  commande_reference: string | null
  notes:              string
  lignes:             LigneFactureVente[]
  reglements:         ReglementClient[]
  date_modif:         string
}

export interface LigneFVCreatePayload {
  article?:      string | null
  designation?:  string
  quantite:      number
  prix_unitaire: number
  remise_pct?:   number
}

export interface FactureVenteCreatePayload {
  client:        string
  commande?:     string | null
  date_echeance: string
  notes?:        string
  lignes:        LigneFVCreatePayload[]
}

export interface AjouterReglementPayload {
  date_reglement:      string
  montant:             number
  mode_paiement:       ModePaiementReglem
  reference_paiement?: string
  notes?:              string
}

// ─── Retour Client ───────────────────────────────────────────────────────────

export interface LigneRetourClient {
  id:                  string
  article:             string
  article_code:        string
  article_designation: string
  lot:                 string | null
  quantite:            string
  etat:                EtatRetour
  etat_label:          string
  action:              ActionRetour
  action_label:        string
}

export interface RetourClientList {
  id:           string
  reference:    string
  client:       string
  client_nom:   string
  statut:       StatutRetour
  statut_label: string
  date_demande: string
  motif_court:  string
  date_creation: string
}

export interface RetourClient extends RetourClientList {
  client_detail:      ClientList
  commande:           string | null
  commande_reference: string | null
  facture:            string | null
  facture_reference:  string | null
  motif:              string
  notes:              string
  lignes:             LigneRetourClient[]
  date_modif:         string
}

export interface LigneRetourCreatePayload {
  article:   string
  lot?:      string | null
  quantite:  number
  etat:      EtatRetour
  action:    ActionRetour
}

export interface RetourClientCreatePayload {
  client:       string
  commande?:    string | null
  facture?:     string | null
  date_demande?: string
  motif:        string
  notes?:       string
  lignes:       LigneRetourCreatePayload[]
}

// ─── API functions ───────────────────────────────────────────────────────────

export const commercialApi = {

  // — Catégories client —
  listCategories: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<CategorieClient>>('/commercial/categories-client/', { params }),

  // — Contacts client —
  createContact: (data: { client: string; nom: string; poste?: string; telephone?: string; email?: string; principal?: boolean }) =>
    api.post<ContactClient>('/commercial/contacts-client/', data),
  updateContact: (id: string, data: { nom?: string; poste?: string; telephone?: string; email?: string; principal?: boolean }) =>
    api.patch<ContactClient>(`/commercial/contacts-client/${id}/`, data),
  deleteContact: (id: string) =>
    api.delete(`/commercial/contacts-client/${id}/`),

  // — Clients —
  listClients: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<ClientList>>('/commercial/clients/', { params }),
  getClient: (id: string) =>
    api.get<Client>(`/commercial/clients/${id}/`),
  createClient: (data: ClientCreatePayload) =>
    api.post<Client>('/commercial/clients/', data),
  updateClient: (id: string, data: Partial<ClientCreatePayload>) =>
    api.patch<Client>(`/commercial/clients/${id}/`, data),
  suspendreClient: (id: string) =>
    api.post(`/commercial/clients/${id}/suspendre/`),
  desactiverClient: (id: string) =>
    api.post(`/commercial/clients/${id}/desactiver/`),
  reactiverClient: (id: string) =>
    api.post(`/commercial/clients/${id}/reactiver/`),

  // — Lignes devis —
  createLigneDevis: (data: { devis: string; article: string; quantite: number; prix_unitaire: number; remise_pct?: number }) =>
    api.post<LigneDevis>('/commercial/lignes-devis/', data),
  updateLigneDevis: (id: string, data: { quantite?: number; prix_unitaire?: number; remise_pct?: number }) =>
    api.patch<LigneDevis>(`/commercial/lignes-devis/${id}/`, data),
  deleteLigneDevis: (id: string) =>
    api.delete(`/commercial/lignes-devis/${id}/`),

  // — Devis —
  listDevis: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<DevisList>>('/commercial/devis/', { params }),
  getDevis: (id: string) =>
    api.get<Devis>(`/commercial/devis/${id}/`),
  createDevis: (data: DevisCreatePayload) =>
    api.post<Devis>('/commercial/devis/', data),
  updateDevis: (id: string, data: Partial<DevisCreatePayload>) =>
    api.patch<Devis>(`/commercial/devis/${id}/`, data),
  envoyerDevis: (id: string) =>
    api.post(`/commercial/devis/${id}/envoyer/`),
  accepterDevis: (id: string) =>
    api.post(`/commercial/devis/${id}/accepter/`),
  refuserDevis: (id: string) =>
    api.post(`/commercial/devis/${id}/refuser/`),
  convertirDevisEnCC: (id: string) =>
    api.post<{ detail: string; commande_id: string }>(`/commercial/devis/${id}/convertir-en-commande/`),
  revisionDevis: (id: string) =>
    api.post<{ detail: string; devis_id: string }>(`/commercial/devis/${id}/revision/`),

  // — Commandes client —
  listCommandesClient: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<CommandeClientList>>('/commercial/commandes/', { params }),
  getCommandeClient: (id: string) =>
    api.get<CommandeClient>(`/commercial/commandes/${id}/`),
  createCommandeClient: (data: CommandeClientCreatePayload) =>
    api.post<CommandeClient>('/commercial/commandes/', data),
  updateCommandeClient: (id: string, data: Partial<CommandeClientCreatePayload>) =>
    api.patch<CommandeClient>(`/commercial/commandes/${id}/`, data),
  confirmerCommande: (id: string) =>
    api.post<ConfirmationCCResult>(`/commercial/commandes/${id}/confirmer/`),
  annulerCommande: (id: string) =>
    api.post(`/commercial/commandes/${id}/annuler/`),

  // — Bons de livraison —
  listBonsLivraison: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<BonLivraisonList>>('/commercial/bons-livraison/', { params }),
  getBonLivraison: (id: string) =>
    api.get<BonLivraison>(`/commercial/bons-livraison/${id}/`),
  createBonLivraison: (data: BonLivraisonCreatePayload) =>
    api.post<BonLivraison>('/commercial/bons-livraison/', data),
  expedierBL: (id: string) =>
    api.post(`/commercial/bons-livraison/${id}/expedier/`),
  confirmerLivraison: (id: string) =>
    api.post(`/commercial/bons-livraison/${id}/confirmer-livraison/`),
  facturer: (id: string, data: { date_echeance: string; notes?: string }) =>
    api.post<{ detail: string; facture_id: string }>(`/commercial/bons-livraison/${id}/facturer/`, data),

  // — Factures vente —
  listFacturesVente: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<FactureVenteList>>('/commercial/factures/', { params }),
  getFactureVente: (id: string) =>
    api.get<FactureVente>(`/commercial/factures/${id}/`),
  createFactureVente: (data: FactureVenteCreatePayload) =>
    api.post<FactureVente>('/commercial/factures/', data),
  emettreFacture: (id: string) =>
    api.post(`/commercial/factures/${id}/emettre/`),
  annulerFacture: (id: string) =>
    api.post(`/commercial/factures/${id}/annuler/`),
  ajouterReglement: (id: string, data: AjouterReglementPayload) =>
    api.post(`/commercial/factures/${id}/ajouter-reglement/`, data),

  // — Retours client —
  listRetoursClient: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<RetourClientList>>('/commercial/retours/', { params }),
  getRetourClient: (id: string) =>
    api.get<RetourClient>(`/commercial/retours/${id}/`),
  createRetourClient: (data: RetourClientCreatePayload) =>
    api.post<RetourClient>('/commercial/retours/', data),
  approuverRetour: (id: string) =>
    api.post(`/commercial/retours/${id}/approuver/`),
  recevoirRetour: (id: string) =>
    api.post(`/commercial/retours/${id}/recevoir/`),
  traiterRetour: (id: string) =>
    api.post(`/commercial/retours/${id}/traiter/`),
}
