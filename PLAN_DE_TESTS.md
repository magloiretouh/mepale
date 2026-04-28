# Plan de Tests — MEPALE ERP
**Version :** 1.0 | **Date :** Avril 2026  
**Application :** ERP MANZAY — Backend Django + Frontend React

---

## Comment utiliser ce document

- **Statut** : ✅ OK | ❌ BUG | ⚠️ Partiel | ⏭ Non testé  
- Remplir la colonne **Résultat observé** pour chaque test  
- Noter le **numéro de bug** si anomalie constatée  
- Les tests marqués 🔴 sont **critiques** — bloquer la livraison si KO

---

## Table des matières

1. [Authentification & Gestion des utilisateurs](#1-authentification)
2. [Production — Articles & Nomenclatures](#2-production--articles--nomenclatures)
3. [Production — Ordres de Fabrication (OF)](#3-production--ordres-de-fabrication)
4. [Production — Lots & Traçabilité](#4-production--lots--traçabilité)
5. [Logistique — Fournisseurs](#5-logistique--fournisseurs)
6. [Logistique — Stock](#6-logistique--stock)
7. [Logistique — Demandes d'Achat (DA)](#7-logistique--demandes-dachat)
8. [Logistique — Bons de Commande (BC)](#8-logistique--bons-de-commande)
9. [Logistique — Réceptions & Retours Fournisseur](#9-logistique--réceptions--retours-fournisseur)
10. [Logistique — Factures Fournisseur](#10-logistique--factures-fournisseur)
11. [Logistique — Inventaires](#11-logistique--inventaires)
12. [Commercial — Clients](#12-commercial--clients)
13. [Commercial — Devis](#13-commercial--devis)
14. [Commercial — Commandes Client (CC)](#14-commercial--commandes-client)
15. [Commercial — Bons de Livraison (BL)](#15-commercial--bons-de-livraison)
16. [Commercial — Factures Vente (FV)](#16-commercial--factures-vente)
17. [Commercial — Retours Client](#17-commercial--retours-client)
18. [RH — Employés, Paie & Congés](#18-rh--employés-paie--congés)
19. [Caisses](#19-caisses)
20. [Comptabilité](#20-comptabilité)
21. [Administration](#21-administration)
22. [Tests transversaux](#22-tests-transversaux)

---

## 1. Authentification

### 1.1 Connexion / Déconnexion

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| A-01 | 🔴 Connexion avec identifiants valides | Login + mot de passe corrects | Accès au dashboard, token JWT reçu | ⏭ | |
| A-02 | 🔴 Connexion avec mauvais mot de passe | Mot de passe incorrect | Message d'erreur, accès refusé | ⏭ | |
| A-03 | Connexion avec un compte désactivé | Compte `is_active=False` | Accès refusé, message explicite | ⏭ | |
| A-04 | 🔴 Déconnexion | Cliquer sur "Déconnexion" | Retour à la page de login, token invalidé | ⏭ | |
| A-05 | Session expirée | Attendre l'expiration du token | Redirection automatique vers login | ⏭ | |
| A-06 | Rafraîchissement automatique du token | Rester connecté > 5 min | Token rafraîchi sans interruption | ⏭ | |

### 1.2 Profil utilisateur

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| A-07 | Voir son profil (`/me/`) | Utilisateur connecté | Affichage nom, prénom, rôle, email | ⏭ | |
| A-08 | Modifier nom / prénom / téléphone | Nouvelles valeurs | Modifications enregistrées et affichées | ⏭ | |
| A-09 | Changer de mot de passe — succès | Ancien mdp correct + nouveau mdp confirmé | Mot de passe modifié, confirmation affichée | ⏭ | |
| A-10 | Changer de mot de passe — ancien mdp faux | Mauvais ancien mdp | Erreur explicite | ⏭ | |
| A-11 | Changer de mot de passe — moins de 8 caractères | Nouveau mdp = `1234` | Erreur de validation | ⏭ | |
| A-12 | Changer de mot de passe — confirmation différente | Mdp ≠ confirmation | Erreur de validation | ⏭ | |

### 1.3 Gestion des utilisateurs (Admin)

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| A-13 | Lister les utilisateurs | Connexion Admin | Liste de tous les utilisateurs | ⏭ | |
| A-14 | Créer un utilisateur | Tous champs requis | Utilisateur créé avec rôle assigné | ⏭ | |
| A-15 | Créer utilisateur — mdp < 8 chars | Mot de passe court | Erreur de validation | ⏭ | |
| A-16 | Créer utilisateur — email dupliqué | Email déjà existant | Erreur de validation | ⏭ | |
| A-17 | Désactiver un utilisateur | Toggle `is_active` | Utilisateur ne peut plus se connecter | ⏭ | |
| A-18 | Se désactiver soi-même | Admin tente de se désactiver | Erreur — auto-désactivation interdite | ⏭ | |
| A-19 | Réinitialiser le mot de passe (admin) | Nouvel mdp pour un user | Utilisateur peut se connecter avec le nouveau mdp | ⏭ | |
| A-20 | Accès gestion users sans droits Admin | Connexion avec rôle COMMERCIAL | Accès refusé (403) | ⏭ | |

---

## 2. Production — Articles & Nomenclatures

### 2.1 Types d'articles & Unités de mesure

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| P-01 | Lister les types d'articles | — | Affichage de tous les types avec capacités métier | ⏭ | |
| P-02 | Créer un type d'article | Code unique, libellé, capacités | Type créé | ⏭ | |
| P-03 | Créer type — code dupliqué | Code déjà existant | Erreur de validation | ⏭ | |
| P-04 | Lister les unités de mesure | — | Affichage avec types (masse, volume, etc.) | ⏭ | |
| P-05 | Créer une unité de mesure | Code, libellé, type | Unité créée | ⏭ | |

### 2.2 Articles

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| P-06 | 🔴 Lister les articles | — | Tableau avec code, désignation, type, prix standard | ⏭ | |
| P-07 | 🔴 Créer un article | Tous champs requis | Article créé avec code auto-généré | ⏭ | |
| P-08 | Générer prochain code | Type d'article sélectionné | Code unique généré (ex: MP-0001) | ⏭ | |
| P-09 | Modifier un article | Champs modifiables | Modifications enregistrées | ⏭ | |
| P-10 | Désactiver un article | Article sans OF ni stock | Article désactivé (`actif=False`) | ⏭ | |
| P-11 | Supprimer article lié à un lot | Article avec lots existants | Erreur — suppression impossible | ⏭ | |
| P-12 | Article géré par lot | `gere_par_lot=True` | Champ visible et fonctionnel | ⏭ | |
| P-13 | Désactiver gestion par lot si lots existent | `gere_par_lot=False` sur article avec lots | Erreur de validation | ⏭ | |
| P-14 | Article avec unité d'achat différente | `unite_achat` + `coefficient_conversion` | Coefficient > 0 obligatoire | ⏭ | |
| P-15 | Coefficient de conversion ≤ 0 | `coefficient_conversion = 0` | Erreur de validation | ⏭ | |

### 2.3 Nomenclatures (BOM)

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| P-16 | 🔴 Créer une nomenclature | Produit fini + lignes matières | Nomenclature créée (version 1) | ⏭ | |
| P-17 | Ajouter ligne avec taux de perte | Ligne + `taux_perte = 10%` | `quantite_avec_perte` calculée correctement | ⏭ | |
| P-18 | Dupliquer une nomenclature | Action "Dupliquer" | Nouvelle version créée (v+1) | ⏭ | |
| P-19 | Version dupliquée — numéro unique | Nomenclature v2 existe | La duplication crée v3 | ⏭ | |
| P-20 | Supprimer nomenclature liée à un OF | Nomenclature utilisée par un OF | Erreur — suppression impossible | ⏭ | |
| P-21 | Modifier nomenclature active | Mise à jour lignes | Modifications enregistrées | ⏭ | |

---

## 3. Production — Ordres de Fabrication

### 3.1 Création et confirmation

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| P-22 | 🔴 Créer un OF | Nomenclature + quantité prévue | OF créé en statut BROUILLON, référence auto | ⏭ | |
| P-23 | 🔴 Confirmer un OF | OF en BROUILLON | Statut → CONFIRME, BOM snapshot figé | ⏭ | |
| P-24 | Vérifier disponibilité matières | Action "Vérifier matières" | Rapport dispo/manquant par article | ⏭ | |
| P-25 | Confirmer OF — vérification stock | OF avec matières insuffisantes | Avertissement affiché (non bloquant) | ⏭ | |
| P-26 | Modifier nomenclature après confirmation | Tenter de changer la nomenclature | Erreur — champ non modifiable | ⏭ | |
| P-27 | Modifier date prévue après confirmation | Champ `date_prevue` | Modification autorisée | ⏭ | |
| P-28 | Priorité et séquence | Changer priorité (URGENTE/NORMALE) | Modification enregistrée | ⏭ | |

### 3.2 Démarrage et production

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| P-29 | 🔴 Démarrer un OF | OF CONFIRME | Statut → EN_COURS, `date_debut` renseignée | ⏭ | |
| P-30 | OF en retard | `date_prevue` dépassée + statut EN_COURS | Indicateur "en retard" visible | ⏭ | |
| P-31 | Affecter un employé | OF + employé | Affectation enregistrée | ⏭ | |
| P-32 | Affecter même employé deux fois | Double affectation | Erreur — doublon interdit | ⏭ | |
| P-33 | Retirer un employé | Action retirer | Affectation supprimée | ⏭ | |

### 3.3 Saisie de pertes

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| P-34 | Enregistrer une perte | Type (rebut/déchet), quantité, motif | Perte enregistrée | ⏭ | |
| P-35 | Perte dépassant seuil | % pertes > `seuil_perte` OF | Alerte générée | ⏭ | |

### 3.4 Terminaison et clôture

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| P-36 | 🔴 Terminer un OF | Saisir `quantite_produite` | Statut → TERMINE | ⏭ | |
| P-37 | 🔴 Clôturer un OF | OF TERMINE | Statut → CLOTURE, mouvements stock créés, coût de revient calculé | ⏭ | |
| P-38 | Vérifier rendement après clôture | `qte_produite / qte_prevue × 100` | Rendement affiché correctement | ⏭ | |
| P-39 | Vérifier coût de revient | `cout_total` + `cout_unitaire` | Coûts calculés et affichés | ⏭ | |
| P-40 | Vérifier écarts (variance) | `ecart_rendement` + `ecart_cout` | Écarts positifs/négatifs affichés | ⏭ | |
| P-41 | Annuler un OF BROUILLON | Action "Annuler" | Statut → ANNULE | ⏭ | |
| P-42 | Annuler un OF CLOTURE | Tentative annulation | Erreur — transition impossible | ⏭ | |
| P-43 | Supprimer un OF BROUILLON | Action "Supprimer" | OF supprimé | ⏭ | |
| P-44 | Supprimer un OF CONFIRME | Tentative suppression | Erreur — seul BROUILLON supprimable | ⏭ | |

### 3.5 Dashboard production

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| P-45 | Stats dashboard | — | Compteurs : en_cours, confirmes, en_retard, rendement_moyen | ⏭ | |
| P-46 | Production des 7 derniers jours | — | Graphique/liste des OF clôturés | ⏭ | |
| P-47 | Traçabilité OF | Action "Traçabilité" | Carte MP consommées → OF → PF produits | ⏭ | |
| P-48 | Historique OF | Action "Historique" | 50 dernières modifications avec date et auteur | ⏭ | |

---

## 4. Production — Lots & Traçabilité

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| L-01 | 🔴 Lister les lots | — | Tableau avec N° lot, article, qté restante, statut, péremption | ⏭ | |
| L-02 | Alertes de péremption | Lots à < 7 jours | Liste des lots proches de péremption | ⏭ | |
| L-03 | Alertes péremption — seuil custom | Paramètre `N jours` | Filtrage correct | ⏭ | |
| L-04 | Bloquer un lot (quarantaine) | Lot DISPONIBLE + motif | Statut → BLOQUE | ⏭ | |
| L-05 | Débloquer un lot | Lot BLOQUE | Statut → DISPONIBLE | ⏭ | |
| L-06 | Détruire un lot | Lot + motif | Lot EPUISE, mouvement AJUSTEMENT_NEG créé | ⏭ | |
| L-07 | Traçabilité bidirectionnelle | Lot MP ou PF | Affichage MP→OF→PF dans les deux sens | ⏭ | |
| L-08 | Export PDF lot | Action "Rapport PDF" | PDF généré avec détails du lot | ⏭ | |
| L-09 | FIFO — ordre de consommation | Plusieurs lots même article | Lot avec date péremption la plus proche consommé en premier | ⏭ | |

---

## 5. Logistique — Fournisseurs

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| F-01 | 🔴 Lister les fournisseurs | — | Tableau avec code, raison sociale, qualification | ⏭ | |
| F-02 | 🔴 Créer un fournisseur | Champs requis | Fournisseur créé avec code auto (FOUR-XXXX) | ⏭ | |
| F-03 | Modifier un fournisseur | Informations modifiées | Modifications enregistrées | ⏭ | |
| F-04 | Blacklister un fournisseur | Action "Blacklister" + motif | Qualification → BLACKLISTE, `actif=False` | ⏭ | |
| F-05 | Blacklister sans motif | Champ motif vide | Erreur de validation | ⏭ | |
| F-06 | Réactiver un fournisseur blacklisté | Action "Réactiver" | Qualification → EN_EVALUATION | ⏭ | |
| F-07 | Ajouter un contact principal | Contact + `principal=True` | Contact enregistré comme principal | ⏭ | |
| F-08 | Deux contacts principaux | Second contact `principal=True` | Seul le dernier est principal (ou erreur) | ⏭ | |
| F-09 | Ajouter article au catalogue fournisseur | Fournisseur + article + prix | Lien fournisseur-article créé | ⏭ | |
| F-10 | Dupliquer lien fournisseur-article | Même fournisseur + même article | Erreur — combinaison unique | ⏭ | |
| F-11 | Évaluation fournisseur | Notes qualité/délai/prix (1-5) | Note moyenne calculée | ⏭ | |
| F-12 | Contrat fournisseur | Dates + montant max + type | Contrat créé, `est_expire` si date_fin passée | ⏭ | |
| F-13 | Solde ouvert fournisseur | Factures dues - avoirs | Solde affiché sur la fiche | ⏭ | |
| F-14 | Filtrer par qualification | Filtre "Approuvé" | Seuls les fournisseurs approuvés visibles | ⏭ | |

---

## 6. Logistique — Stock

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| S-01 | 🔴 Voir le stock | — | Tableau : article, qté dispo, seuil alerte, statut alerte | ⏭ | |
| S-02 | Articles sous seuil d'alerte | `qte_dispo < seuil_alerte` | Affichage dans vue "Sous seuil" | ⏭ | |
| S-03 | Articles critiques | `qte_dispo < stock_min` | Indicateur "CRITIQUE" visible | ⏭ | |
| S-04 | Modifier les seuils | `seuil_alerte`, `stock_min`, `qte_reappro` | Valeurs mises à jour | ⏭ | |
| S-05 | Valeur totale du stock | Action "Valeur totale" | Somme `qte_dispo × prix_standard` | ⏭ | |
| S-06 | Générer une DA depuis le stock | Article sous seuil → "Générer DA" | DA créée automatiquement | ⏭ | |
| S-07 | Propositions de réapprovisionnement | Articles sous seuil | Liste avec qté suggérée | ⏭ | |
| S-08 | Créer DA groupée depuis propositions | Sélectionner plusieurs articles | DA unique créée avec toutes les lignes | ⏭ | |
| S-09 | Audit des réservations | Action "Audit réservations" | Vérification `qte_reservee` ↔ somme(ReservationLot) | ⏭ | |
| S-10 | Recalculer réservations | Article avec dérive | Réservations recalculées et corrigées | ⏭ | |
| S-11 | Audit du stock | Action "Audit stock" | Comparaison `qte_disponible` vs somme(mouvements) | ⏭ | |
| S-12 | Recalculer stock depuis mouvements | Article avec écart | Stock recalculé correctement | ⏭ | |
| S-13 | Quantité en quarantaine | Lots BLOQUE | `quantite_quarantaine` affichée séparément | ⏭ | |
| S-14 | Quantité en commande | BC ouverts (ENVOYE/CONFIRME) | `quantite_en_commande` mise à jour | ⏭ | |

---

## 7. Logistique — Demandes d'Achat

### 7.1 Cycle de vie DA

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| DA-01 | 🔴 Créer une DA | Article(s) + quantités + prix estimés | DA créée en BROUILLON, référence auto | ⏭ | |
| DA-02 | Prix pré-rempli depuis article | Article avec `prix_standard` | Prix unitaire estimé pré-rempli | ⏭ | |
| DA-03 | 🔴 Soumettre une DA | DA BROUILLON | Statut → SOUMISE | ⏭ | |
| DA-04 | 🔴 Approuver une DA ≤ 5M FCFA | Montant estimé ≤ 5 000 000 | Statut → APPROUVEE directement | ⏭ | |
| DA-05 | 🔴 DA > 5M FCFA — validation direction | Montant > 5 000 000 FCFA | Statut → ATTENTE_DIRECTION | ⏭ | |
| DA-06 | Approbation direction | DA en ATTENTE_DIRECTION | Statut → APPROUVEE | ⏭ | |
| DA-07 | Refuser une DA | DA SOUMISE + motif | Statut → REFUSEE | ⏭ | |
| DA-08 | Modifier DA en BROUILLON | Modifier lignes | Modifications acceptées | ⏭ | |
| DA-09 | Modifier DA APPROUVEE sans commandes | DA sans lignes commandées | Modification autorisée | ⏭ | |
| DA-10 | Modifier DA APPROUVEE avec commandes | DA avec `qte_commandee > 0` | Modification refusée | ⏭ | |

### 7.2 Conversion DA → BC

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| DA-11 | 🔴 Convertir DA en BC | DA APPROUVEE + fournisseurs approuvés | BC créé par fournisseur, lignes liées à la DA | ⏭ | |
| DA-12 | Convertir DA — fournisseur non approuvé | Fournisseur en `EN_EVALUATION` | Fournisseur absent de la liste de sélection | ⏭ | |
| DA-13 | DA → TRAITEE après conversion | BC créé depuis DA | Statut DA → TRAITEE | ⏭ | |
| DA-14 | Quantité restante DA | `qte_commandee` partielle | `qte_restante` = `qte - qte_commandee` affichée | ⏭ | |

---

## 8. Logistique — Bons de Commande

### 8.1 Cycle de vie BC

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| BC-01 | 🔴 Créer un BC | Fournisseur + articles + prix | BC créé en BROUILLON | ⏭ | |
| BC-02 | Calcul montant HT/TTC | Lignes + conditions | Totaux calculés automatiquement | ⏭ | |
| BC-03 | Ajouter condition tarifaire — niveau BC | Condition de type réduction/majoration | Montant BC recalculé | ⏭ | |
| BC-04 | Ajouter condition tarifaire — niveau ligne | Condition sur une ligne | Montant ligne recalculé | ⏭ | |
| BC-05 | Dupliquer article sur BC | Même article deux fois | Erreur — article unique par BC | ⏭ | |
| BC-06 | 🔴 Envoyer un BC | BC BROUILLON | Statut → ENVOYE | ⏭ | |
| BC-07 | Confirmer un BC | BC ENVOYE | Statut → CONFIRME | ⏭ | |
| BC-08 | BC en retard | `date_livraison_prev` dépassée | Indicateur "en retard" visible | ⏭ | |
| BC-09 | Annuler un BC | BC BROUILLON/ENVOYE | Statut → ANNULE | ⏭ | |

---

## 9. Logistique — Réceptions & Retours Fournisseur

### 9.1 Réceptions

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| RC-01 | 🔴 Créer une réception | BC CONFIRME | Réception EN_COURS liée au BC | ⏭ | |
| RC-02 | Saisir quantités reçues par ligne | Quantités ≤ quantités commandées | Lignes renseignées | ⏭ | |
| RC-03 | Marquer ligne conforme / non conforme | Conformité + motif si KO | Statut de conformité enregistré | ⏭ | |
| RC-04 | Saisir N° lot fournisseur et péremption | N° lot + date péremption | Informations enregistrées | ⏭ | |
| RC-05 | Joindre bon de livraison fournisseur | Fichier PDF/image | Pièce jointe enregistrée | ⏭ | |
| RC-06 | 🔴 Valider une réception | Réception EN_COURS | Statut → VALIDEE, lots créés en stock, mouvements ENTREE_RECEPTION créés | ⏭ | |
| RC-07 | Lot créé après validation | — | Nouveau lot visible dans le stock | ⏭ | |
| RC-08 | Réception partielle | `qte_recue < qte_commandee` | BC → PARTIELLEMENT_RECU | ⏭ | |
| RC-09 | Réception complète | Toutes lignes reçues | BC → RECU | ⏭ | |
| RC-10 | Livraison à l'heure | Date réception ≤ date prévue | `est_livraison_a_temps = True` | ⏭ | |
| RC-11 | Livraison en retard | Date réception > date prévue | Jours de retard affichés | ⏭ | |

### 9.2 Retours Fournisseur

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| RC-12 | Créer un retour fournisseur | Réception validée + ligne + motif | Retour EN_COURS créé | ⏭ | |
| RC-13 | Retourner plus que reçu | Quantité > qte_recue | Erreur de validation | ⏭ | |
| RC-14 | Valider un retour | Retour EN_COURS | Statut → VALIDE, stock mis à jour | ⏭ | |

---

## 10. Logistique — Factures Fournisseur

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| FF-01 | 🔴 Créer une facture | Fournisseur + BC + montant | Facture en BROUILLON | ⏭ | |
| FF-02 | Joindre scan facture | Fichier joint | Pièce jointe enregistrée | ⏭ | |
| FF-03 | Soumettre une facture | Facture BROUILLON | Statut → SOUMISE | ⏭ | |
| FF-04 | Facture ≤ 2M FCFA — workflow standard | Montant ≤ 2 000 000 | SOUMISE → EN_ATTENTE | ⏭ | |
| FF-05 | Facture > 2M FCFA — validation direction | Montant > 2 000 000 | SOUMISE → ATTENTE_DIRECTION | ⏭ | |
| FF-06 | Approbation direction | Facture ATTENTE_DIRECTION | Statut → EN_ATTENTE | ⏭ | |
| FF-07 | 🔴 Enregistrer un paiement | Montant payé | `montant_paye` mis à jour, statut → PARTIELLEMENT_PAYEE | ⏭ | |
| FF-08 | Paiement total | Montant payé = montant_ttc | Statut → PAYEE | ⏭ | |
| FF-09 | Créer un avoir | Type AVOIR + facture d'origine | Avoir lié à la facture | ⏭ | |
| FF-10 | Solde ouvert fournisseur | Factures dues - avoirs | Solde cohérent sur la fiche fournisseur | ⏭ | |
| FF-11 | Historique modifications | Action "Historique" | Audit trail complet | ⏭ | |

---

## 11. Logistique — Inventaires

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| INV-01 | Créer une session d'inventaire | Date + articles | Session OUVERTE créée | ⏭ | |
| INV-02 | Saisir quantités comptées | Par article | Quantités enregistrées | ⏭ | |
| INV-03 | Calcul des écarts | `qte_comptee - qte_theorique` | Écart brut et % calculés | ⏭ | |
| INV-04 | Fermer la session | Action "Fermer" | Session FERMEE, ajustements stock si applicable | ⏭ | |

---

## 12. Commercial — Clients

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| CL-01 | 🔴 Lister les clients | — | Tableau clients avec statut | ⏭ | |
| CL-02 | 🔴 Créer un client | Type (entreprise/particulier), catégorie | Client créé avec code auto | ⏭ | |
| CL-03 | Adresse livraison différente | Adresse livraison renseignée | Adresse livraison utilisée (prioritaire) | ⏭ | |
| CL-04 | Adresse livraison vide | — | Adresse facturation utilisée par défaut | ⏭ | |
| CL-05 | Ajouter contact principal | `principal=True` | Contact enregistré | ⏭ | |
| CL-06 | Voir solde factures client | Factures non réglées | Solde affiché sur la fiche | ⏭ | |
| CL-07 | Désactiver un client | `actif=False` | Client inactif, invisible dans les filtres actifs | ⏭ | |
| CL-08 | Suspendre un client | Statut → SUSPENDU | Indicateur visible | ⏭ | |
| CL-09 | Assigner un commercial | Champ `commercial` (FK employé) | Assignation enregistrée | ⏭ | |

---

## 13. Commercial — Devis

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| DV-01 | 🔴 Créer un devis | Client + lignes articles + prix | Devis en BROUILLON, référence auto | ⏭ | |
| DV-02 | Remise sur ligne | `remise_pct = 10%` | Montant ligne recalculé | ⏭ | |
| DV-03 | Montant total devis | Somme des lignes | Montant HT calculé automatiquement | ⏭ | |
| DV-04 | Envoyer un devis | Devis BROUILLON | Statut → ENVOYE | ⏭ | |
| DV-05 | Devis expiré | `date_validite` dépassée | Statut → EXPIRE | ⏭ | |
| DV-06 | Accepter un devis | Devis ENVOYE | Statut → ACCEPTE | ⏭ | |
| DV-07 | Refuser un devis | Devis ENVOYE | Statut → REFUSE | ⏭ | |
| DV-08 | 🔴 Convertir devis en commande | Devis ACCEPTE | Nouvelle CC créée, navigation vers CC | ⏭ | |
| DV-09 | Réviser un devis | Action "Révision" | Nouveau devis v+1 créé, navigation | ⏭ | |
| DV-10 | Voir numéro de version | Devis issu d'une révision | Numéro version affiché | ⏭ | |

---

## 14. Commercial — Commandes Client

### 14.1 Création et confirmation

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| CC-01 | 🔴 Créer une CC | Client + articles + quantités | CC en BROUILLON | ⏭ | |
| CC-02 | CC créée depuis devis | Action "Convertir" sur devis | Lignes reprises automatiquement | ⏭ | |
| CC-03 | 🔴 Confirmer une CC — stock suffisant | `qte_dispo >= qte_commandee` | Statut → CONFIRMEE, `tout_disponible = True` | ⏭ | |
| CC-04 | 🔴 Confirmer une CC — stock insuffisant | `qte_dispo < qte_commandee` | Statut → CONFIRMEE + avertissements affichés (non bloquant) | ⏭ | |
| CC-05 | Snapshot stock à la confirmation | — | `stock_disponible_confirmation` figé | ⏭ | |
| CC-06 | Annuler une CC | CC BROUILLON | Statut → ANNULEE | ⏭ | |
| CC-07 | Modifier CC confirmée | Tentative de modification | Champs non modifiables | ⏭ | |

---

## 15. Commercial — Bons de Livraison

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| BL-01 | 🔴 Créer un BL | CC CONFIRMEE | BL en PREPARE, lignes reprises | ⏭ | |
| BL-02 | Saisir quantités à livrer | Quantité ≤ qte_restante CC | Saisie acceptée | ⏭ | |
| BL-03 | 🔴 Expédier un BL — stock OK | `qte_dispo >= qte_a_livrer` | Statut → EXPEDIE, mouvement SORTIE_VENTE créé | ⏭ | |
| BL-04 | 🔴 Expédier un BL — stock insuffisant | `qte_dispo < qte_a_livrer` | Erreur 400, message d'erreur affiché (bloquant) | ⏭ | |
| BL-05 | Confirmer réception client | BL EXPEDIE | Statut → LIVRE | ⏭ | |
| BL-06 | BL partiel — statut CC | Livraison partielle | CC → PARTIELLEMENT_LIVREE | ⏭ | |
| BL-07 | BL complet — statut CC | Toutes lignes livrées | CC → LIVREE | ⏭ | |
| BL-08 | Associer lot à ligne BL | Lot pour traçabilité | Lot enregistré sur la ligne | ⏭ | |

---

## 16. Commercial — Factures Vente

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| FV-01 | 🔴 Créer une facture vente | BL LIVRE | Facture EMISE, référence auto | ⏭ | |
| FV-02 | 🔴 Enregistrer un paiement | Montant partiel | Statut → PARTIELLEMENT_PAYEE | ⏭ | |
| FV-03 | 🔴 Paiement total | Montant = montant_ttc | Statut → PAYEE | ⏭ | |
| FV-04 | Facture en retard — indicateur SOON | 1-7 jours après échéance | Indicateur orange "SOON" | ⏭ | |
| FV-05 | Facture en retard — indicateur DANGER | > 7 jours après échéance | Indicateur rouge "DANGER" | ⏭ | |
| FV-06 | Facture dans les délais | Avant date échéance | Indicateur vert "OK" | ⏭ | |
| FV-07 | Annuler une facture | Facture EMISE | Statut → ANNULEE | ⏭ | |
| FV-08 | Solde client mis à jour | Après paiement | Solde sur fiche client recalculé | ⏭ | |

---

## 17. Commercial — Retours Client

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| RC-01 | Créer un retour client | BL LIVRE + motif | Retour EN_COURS | ⏭ | |
| RC-02 | Valider un retour | Retour EN_COURS | Statut → VALIDE, stock reversé (mouvement inverse) | ⏭ | |
| RC-03 | Mouvement stock après retour | — | Mouvement ENTREE créé pour l'article retourné | ⏭ | |

---

## 18. RH — Employés, Paie & Congés

### 18.1 Employés

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| RH-01 | 🔴 Lister les employés | — | Tableau avec nom, poste, type contrat | ⏭ | |
| RH-02 | Créer un employé | Tous champs requis | Employé créé | ⏭ | |
| RH-03 | Désactiver un employé | `is_active=False` | Employé inactif | ⏭ | |

### 18.2 Paiements de salaire

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| RH-04 | 🔴 Créer un paiement de salaire | Employé + période | Salaire enregistré avec calculs CNSS/AMU | ⏭ | |
| RH-05 | Vérifier cotisations sociales | Salaire brut connu | Calcul CNSS employé + employeur correct | ⏭ | |
| RH-06 | Salaire net = brut - cotisations salarié | — | Montant net affiché cohérent | ⏭ | |
| RH-07 | Paiement de prime | Type PRIME | Prime enregistrée, liée au salaire si applicable | ⏭ | |
| RH-08 | Avance sur salaire | Type AVANCE | Avance enregistrée, `advance_deducted` | ⏭ | |
| RH-09 | Paiements en masse | Action "Bulk" | Salaires de plusieurs employés créés en une fois | ⏭ | |
| RH-10 | Export déclaration CNSS | Période sélectionnée | Export généré | ⏭ | |
| RH-11 | Export journal de paie PDF | — | PDF généré | ⏭ | |

### 18.3 Congés

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| RH-12 | Créer une demande de congé | Employé + type + dates | Demande EN_ATTENTE | ⏭ | |
| RH-13 | Approuver une demande | Action "Approuver" | Statut → APPROUVEE, solde congé mis à jour | ⏭ | |
| RH-14 | Refuser une demande | Action "Refuser" | Statut → REFUSEE | ⏭ | |
| RH-15 | Vérifier solde congé | Après approbation | `jours_utilises` incrémenté | ⏭ | |

### 18.4 Pointage

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| RH-16 | Enregistrer un pointage | Employé + date + heure arrivée/départ | Pointage créé | ⏭ | |
| RH-17 | Pointage en masse | Action "Bulk" | Plusieurs pointages créés | ⏭ | |
| RH-18 | Rapport d'assiduité | Période sélectionnée | Résumé présences/absences | ⏭ | |

---

## 19. Caisses

### 19.1 Gestion des sessions

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| CA-01 | Créer une caisse | Nom + responsable + plafond | Caisse créée | ⏭ | |
| CA-02 | 🔴 Ouvrir une session | Caisse + solde ouverture | Session OUVERTE | ⏭ | |
| CA-03 | Fermer une session | Session OUVERTE + solde réel | Session FERMEE, écart calculé | ⏭ | |
| CA-04 | Écart solde | `solde_reel ≠ solde_theorique` | Écart affiché | ⏭ | |
| CA-05 | Alerte plafond | `solde_actuel > plafond_alerte` | Alerte visible | ⏭ | |

### 19.2 Mouvements de caisse

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| CA-06 | 🔴 Créer un mouvement (entrée) | Session ouverte + catégorie + montant | Mouvement EN_ATTENTE | ⏭ | |
| CA-07 | Créer un mouvement (sortie) | — | Mouvement EN_ATTENTE | ⏭ | |
| CA-08 | Joindre justificatif | Fichier joint | Pièce jointe enregistrée | ⏭ | |
| CA-09 | 🔴 Approuver un mouvement | Mouvement EN_ATTENTE | Statut → APPROUVE, solde caisse mis à jour | ⏭ | |
| CA-10 | Rejeter un mouvement | Mouvement EN_ATTENTE + motif | Statut → REJETE | ⏭ | |
| CA-11 | Lier mouvement à facture vente | Champ `facture_vente` | Lien enregistré | ⏭ | |
| CA-12 | Solde théorique | Somme mouvements APPROUVES | Solde cohérent avec total mouvements | ⏭ | |

### 19.3 Transferts entre caisses

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| CA-13 | Créer un transfert | Source + destination + montant | Transfert EN_ATTENTE | ⏭ | |
| CA-14 | Approuver un transfert | Transfert EN_ATTENTE | Soldes des deux caisses mis à jour | ⏭ | |

---

## 20. Comptabilité

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| CP-01 | Lister les écritures | — | Tableau recettes/charges | ⏭ | |
| CP-02 | Créer une écriture manuelle | Type (recette/charge) + catégorie + montant | Écriture créée | ⏭ | |
| CP-03 | Écritures auto-générées | Après validation BC/FV | Source `AUTO`, ref_type et ref_id renseignés | ⏭ | |
| CP-04 | Pas de doublon auto | Même ref_type + ref_id | Deuxième écriture refusée (idempotence) | ⏭ | |
| CP-05 | Rapport comptable | Période sélectionnée | Synthèse recettes vs charges | ⏭ | |
| CP-06 | Export PDF rapport | — | PDF généré correctement | ⏭ | |
| CP-07 | Catégories système | Tentative suppression | Suppression refusée | ⏭ | |

---

## 21. Administration

| # | Test | Données | Résultat attendu | Statut | Résultat observé |
|---|------|---------|-----------------|--------|-----------------|
| ADM-01 | Voir les paramètres entreprise | — | Nom, slogan, contacts, logo affichés | ⏭ | |
| ADM-02 | Modifier les paramètres | Nouveau nom ou logo | Modifications enregistrées et visibles | ⏭ | |
| ADM-03 | Logo affiché dans l'app | Après upload | Logo visible dans le header/PDF | ⏭ | |

---

## 22. Tests transversaux

### 22.1 Droits d'accès par rôle

| # | Rôle | Accès attendu | Accès refusé | Statut |
|---|------|--------------|--------------|--------|
| T-01 | ADMIN | Tout | — | ⏭ |
| T-02 | DIRECTEUR | Tout en lecture, approbations | Gestion utilisateurs | ⏭ |
| T-03 | RESP_PRODUCTION | Production, Lots | Paie, Comptabilité | ⏭ |
| T-04 | OPERATEUR | Saisie OF, pertes | Tout le reste | ⏭ |
| T-05 | RESP_LOGISTIQUE | Logistique complète | Paie, Comptabilité | ⏭ |
| T-06 | MAGASINIER | Stock, Réceptions | Tout le reste | ⏭ |
| T-07 | COMMERCIAL | Commercial complet | Production, Paie | ⏭ |
| T-08 | RESP_RH | RH complet | Comptabilité, Production | ⏭ |
| T-09 | COMPTABLE | Comptabilité, Factures | Production, RH | ⏭ |
| T-10 | CAISSIER | Caisses | Tout le reste | ⏭ |

### 22.2 Flux end-to-end (tests d'intégration)

| # | Flux | Étapes | Résultat attendu | Statut |
|---|------|--------|-----------------|--------|
| E-01 | 🔴 Cycle achat complet | DA → BC → Réception → Stock mis à jour | Stock incrémenté, lots créés, BC → RECU | ⏭ |
| E-02 | 🔴 Cycle production complet | OF Confirmé → EN_COURS → CLOTURE → Stock | MP consommées, PF produit, coût calculé | ⏭ |
| E-03 | 🔴 Cycle vente complet | Devis → CC → BL → FV → Paiement | Stock décrémenté, facture PAYEE | ⏭ |
| E-04 | Réapprovisionnement automatique | Stock sous seuil → DA générée → BC | Chaîne complète fonctionnelle | ⏭ |
| E-05 | Traçabilité lot MP → PF | Lot MP utilisé dans OF | Lot PF lié au lot MP visible en traçabilité | ⏭ |
| E-06 | Retour client → stock | BL LIVRE → Retour validé | Article remis en stock | ⏭ |
| E-07 | Retour fournisseur → stock | Réception validée → Retour fournisseur | Article sorti du stock | ⏭ |

### 22.3 Cohérence des données

| # | Test | Résultat attendu | Statut |
|---|------|-----------------|--------|
| T-11 | Mouvements stock après chaque opération | Chaque entrée/sortie génère un mouvement traçable | ⏭ |
| T-12 | Cohérence quantité réservée | `qte_reservee` = somme(ReservationLot) après OF confirmé | ⏭ |
| T-13 | Cohérence stock disponible | `qte_disponible` = somme algébrique des mouvements | ⏭ |
| T-14 | Historique modifications (audit trail) | Toute modification enregistrée avec auteur et date | ⏭ |

### 22.4 Cas limites & robustesse

| # | Test | Résultat attendu | Statut |
|---|------|-----------------|--------|
| T-15 | Champs obligatoires vides | Message d'erreur explicite par champ | ⏭ |
| T-16 | Montants négatifs | Erreur de validation | ⏭ |
| T-17 | Quantité = 0 | Erreur de validation | ⏭ |
| T-18 | Quantité très grande (overflow) | Comportement stable, pas de plantage | ⏭ |
| T-19 | Caractères spéciaux dans les champs texte | Données sauvegardées et affichées correctement | ⏭ |
| T-20 | Navigation rapide entre pages | Pas de chargement bloqué, pas d'erreur console | ⏭ |
| T-21 | Rechargement page en milieu de formulaire | Formulaire réinitialisé proprement | ⏭ |
| T-22 | Double clic sur bouton "Confirmer" | Une seule action effectuée (pas de doublon) | ⏭ |
| T-23 | Session expirée pendant saisie | Message d'expiration, redirection login, données perdues signalées | ⏭ |

### 22.5 Interface utilisateur

| # | Test | Résultat attendu | Statut |
|---|------|-----------------|--------|
| T-24 | Responsive — écran standard (1920×1080) | Affichage correct | ⏭ |
| T-25 | Responsive — écran portable (1366×768) | Affichage correct, pas de débordement | ⏭ |
| T-26 | Thème sombre / clair | Bascule fonctionnelle, lisibilité OK | ⏭ |
| T-27 | Menus déroulants dans les tableaux | Dropdown visible (non coupé par la table) | ⏭ |
| T-28 | Modals — scroll interne | Contenu scrollable si long, modal stable | ⏭ |
| T-29 | Pagination | Navigation entre pages de liste | ⏭ |
| T-30 | Filtres sur les listes | Résultats filtrés correctement | ⏭ |

---

## Récapitulatif des bugs

| # Bug | Module | Description | Sévérité | Statut |
|-------|--------|-------------|----------|--------|
| — | — | *À compléter* | — | — |

---

*Document généré pour l'équipe MANZAY — MEPALE ERP*
