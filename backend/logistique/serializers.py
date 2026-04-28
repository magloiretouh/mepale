"""
MEPALE ERP — Serializers Logistique
"""

from decimal import Decimal

from rest_framework import serializers
from django.db.models import Avg, Count, Q
from production.models import Article
from .models import (
    Fournisseur, ContactFournisseur, FournisseurArticle, ContratFournisseur,
    StockArticle, MouvementStock,
    DemandeAchat, LigneDemandeAchat,
    BonCommande, LigneBonCommande, ConditionTarifaire, ConditionAppliqueeBC,
    Reception, LigneReception, RetourFournisseur, LigneRetour,
    EvaluationFournisseur,
    FactureFournisseur, PaiementFacture, LigneFactureFournisseur, EcheanceFacture,
    InventaireSession, LigneInventaire,
)
from production.serializers import ArticleListSerializer


# ---------------------------------------------------------------------------
# Fournisseurs
# ---------------------------------------------------------------------------

class ContactFournisseurSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ContactFournisseur
        fields = [
            'id', 'fournisseur', 'nom', 'role', 'telephone', 'email',
            'principal', 'notes', 'date_creation',
        ]
        read_only_fields = ['date_creation']


class FournisseurArticleSerializer(serializers.ModelSerializer):
    article_detail = ArticleListSerializer(source='article', read_only=True)

    class Meta:
        model  = FournisseurArticle
        fields = [
            'id', 'fournisseur', 'article', 'article_detail',
            'reference_fournisseur', 'prix_unitaire', 'delai_livraison',
            'quantite_min_commande', 'actif', 'date_derniere_commande', 'notes',
            'date_creation', 'date_modif',
        ]
        read_only_fields = ['date_creation', 'date_modif']


class ContratFournisseurSerializer(serializers.ModelSerializer):
    type_contrat_label = serializers.CharField(source='get_type_contrat_display', read_only=True)
    est_expire         = serializers.ReadOnlyField()

    class Meta:
        model  = ContratFournisseur
        fields = [
            'id', 'fournisseur', 'reference', 'type_contrat', 'type_contrat_label',
            'date_debut', 'date_fin', 'montant_max', 'actif',
            'description', 'est_expire', 'date_creation', 'date_modif',
        ]
        read_only_fields = ['date_creation', 'date_modif']


class FournisseurSerializer(serializers.ModelSerializer):
    categorie_label     = serializers.CharField(source='get_categorie_display', read_only=True)
    qualification_label = serializers.CharField(source='get_qualification_display', read_only=True)

    # KPIs agrégés (12 derniers mois)
    note_qualite_moy  = serializers.SerializerMethodField()
    note_delai_moy    = serializers.SerializerMethodField()
    taux_conformite   = serializers.SerializerMethodField()
    taux_otd          = serializers.SerializerMethodField()
    nb_evaluations    = serializers.SerializerMethodField()
    solde_ouvert      = serializers.ReadOnlyField()

    class Meta:
        model  = Fournisseur
        fields = [
            'id', 'code', 'raison_sociale', 'nif',
            'categorie', 'categorie_label',
            'qualification', 'qualification_label',
            'telephone', 'email', 'adresse', 'ville', 'pays',
            'delai_livraison', 'conditions_paiement', 'banque', 'rib',
            'actif', 'blackliste', 'motif_blacklist', 'notes',
            # KPIs
            'note_qualite_moy', 'note_delai_moy',
            'taux_conformite', 'taux_otd', 'nb_evaluations',
            'solde_ouvert',
            'date_creation', 'date_modif',
        ]
        read_only_fields = ['date_creation', 'date_modif']

    def _evals_12m(self, obj):
        """Cache les évaluations des 12 derniers mois pour éviter les N+1."""
        from django.utils import timezone
        from datetime import timedelta
        if not hasattr(obj, '_evals_cache'):
            cutoff = timezone.now() - timedelta(days=365)
            obj._evals_cache = list(
                obj.evaluations.filter(date_evaluation__gte=cutoff)
            )
        return obj._evals_cache

    def get_note_qualite_moy(self, obj):
        evals = self._evals_12m(obj)
        if not evals:
            return None
        return round(sum(e.note_qualite for e in evals) / len(evals), 1)

    def get_note_delai_moy(self, obj):
        evals = self._evals_12m(obj)
        if not evals:
            return None
        return round(sum(e.note_delai for e in evals) / len(evals), 1)

    def get_nb_evaluations(self, obj):
        return len(self._evals_12m(obj))

    def get_taux_conformite(self, obj):
        """% de lignes de réception conformes sur les 12 derniers mois."""
        from django.utils import timezone
        from datetime import timedelta
        from django.db.models import Count, Q
        cutoff = timezone.now().date() - __import__('datetime').timedelta(days=365)
        qs = LigneReception.objects.filter(
            reception__bon_commande__fournisseur=obj,
            reception__date_reception__gte=cutoff,
        ).aggregate(
            total=Count('id'),
            conformes=Count('id', filter=Q(conforme=True)),
        )
        if not qs['total']:
            return None
        return round(qs['conformes'] / qs['total'] * 100, 1)

    def get_taux_otd(self, obj):
        """% de réceptions livrées à temps sur les 12 derniers mois (OTD)."""
        from django.utils import timezone
        cutoff = timezone.now().date() - __import__('datetime').timedelta(days=365)
        receptions = Reception.objects.filter(
            bon_commande__fournisseur=obj,
            bon_commande__date_livraison_prev__isnull=False,
            date_reception__gte=cutoff,
        )
        total = receptions.count()
        if not total:
            return None
        a_temps = sum(
            1 for r in receptions
            if r.date_reception <= r.bon_commande.date_livraison_prev
        )
        return round(a_temps / total * 100, 1)


class FournisseurListSerializer(serializers.ModelSerializer):
    categorie_label     = serializers.CharField(source='get_categorie_display', read_only=True)
    qualification_label = serializers.CharField(source='get_qualification_display', read_only=True)
    solde_ouvert        = serializers.ReadOnlyField()

    class Meta:
        model  = Fournisseur
        fields = [
            'id', 'code', 'raison_sociale',
            'categorie_label', 'qualification', 'qualification_label',
            'telephone', 'actif', 'blackliste', 'solde_ouvert',
        ]


# ---------------------------------------------------------------------------
# Évaluations Fournisseurs
# ---------------------------------------------------------------------------

class EvaluationFournisseurSerializer(serializers.ModelSerializer):
    note_moyenne     = serializers.ReadOnlyField()
    evaluateur_nom   = serializers.CharField(source='evaluateur.nom_complet', read_only=True)
    bon_commande_ref = serializers.CharField(source='bon_commande.reference', read_only=True, default=None)

    class Meta:
        model  = EvaluationFournisseur
        fields = [
            'id', 'fournisseur', 'bon_commande', 'bon_commande_ref',
            'note_qualite', 'note_delai', 'note_prix', 'note_moyenne',
            'commentaire', 'evaluateur', 'evaluateur_nom', 'date_evaluation',
        ]
        read_only_fields = ['evaluateur', 'date_evaluation']


# ---------------------------------------------------------------------------
# Stock
# ---------------------------------------------------------------------------

class StockArticleSerializer(serializers.ModelSerializer):
    article_detail       = ArticleListSerializer(source='article', read_only=True)
    est_sous_seuil       = serializers.ReadOnlyField()
    quantite_physique    = serializers.ReadOnlyField()
    # M4 — Stock en quarantaine (lots BLOQUÉS)
    quantite_quarantaine = serializers.ReadOnlyField()
    # M5 — Stock en commande (BC ouverts)
    quantite_en_commande = serializers.ReadOnlyField()
    # M6 — Valeur financière du stock disponible
    valeur_stock         = serializers.ReadOnlyField()
    # S6 — Niveau d'alerte multi-paliers + indicateur critique
    est_critique         = serializers.ReadOnlyField()
    niveau_alerte        = serializers.ReadOnlyField()

    class Meta:
        model  = StockArticle
        fields = [
            'id', 'article', 'article_detail',
            'quantite_disponible', 'quantite_reservee', 'quantite_physique',
            'quantite_quarantaine', 'quantite_en_commande',           # M4, M5
            'seuil_alerte', 'stock_min', 'stock_securite', 'qte_reappro',
            'est_sous_seuil', 'est_critique', 'niveau_alerte',        # S6
            'valeur_stock',                                            # M6
            'derniere_maj',
        ]
        read_only_fields = ['quantite_disponible', 'quantite_reservee', 'derniere_maj']


class MouvementStockSerializer(serializers.ModelSerializer):
    article_designation = serializers.CharField(source='article.designation', read_only=True)
    type_label          = serializers.CharField(source='get_type_display', read_only=True)
    lot_numero          = serializers.CharField(source='lot.numero_lot', read_only=True, default=None)
    effectue_par_nom    = serializers.CharField(source='effectue_par.nom_complet', read_only=True, default=None)

    class Meta:
        model  = MouvementStock
        fields = [
            'id', 'article', 'article_designation', 'lot', 'lot_numero',
            'type', 'type_label', 'quantite', 'sens', 'cout_unitaire',
            'reference_doc', 'notes', 'piece_jointe',
            'effectue_par_nom', 'date_mouvement',
            'date_comptable',    # M9
        ]
        read_only_fields = ['date_mouvement']


class MouvementStockCreateSerializer(serializers.ModelSerializer):
    """Serializer pour la saisie manuelle de mouvements (ajustements uniquement)."""

    class Meta:
        model  = MouvementStock
        fields = [
            'article', 'lot', 'type', 'quantite', 'sens',
            'cout_unitaire', 'reference_doc', 'notes', 'piece_jointe',
            'date_comptable',    # M9 — optionnel, pour saisie rétroactive
        ]

    def validate(self, data):
        allowed = [
            MouvementStock.Type.AJUSTEMENT_POS,
            MouvementStock.Type.AJUSTEMENT_NEG,
        ]
        if data.get('type') not in allowed:
            raise serializers.ValidationError({
                'type': 'Seuls les types ajust_pos et ajust_neg sont autorisés pour la saisie manuelle.',
            })

        # Auto-inférer le sens
        if data.get('type') == MouvementStock.Type.AJUSTEMENT_POS:
            data['sens'] = 1
        elif data.get('type') == MouvementStock.Type.AJUSTEMENT_NEG:
            data['sens'] = -1

        # M8 — Validation croisée lot / article
        lot     = data.get('lot')
        article = data.get('article')
        if lot and article and lot.article_id != article.pk:
            raise serializers.ValidationError({
                'lot': (
                    f"Ce lot ({lot.numero_lot}) appartient à "
                    f"'{lot.article.designation}', pas à '{article.designation}'."
                ),
            })

        return data


# ---------------------------------------------------------------------------
# Demandes d'Achat
# ---------------------------------------------------------------------------

class LigneDASerializer(serializers.ModelSerializer):
    article_detail     = ArticleListSerializer(source='article', read_only=True)
    quantite_commandee = serializers.ReadOnlyField()   # géré par le système
    quantite_restante  = serializers.ReadOnlyField()
    demande_reference  = serializers.CharField(source='demande.reference', read_only=True)

    class Meta:
        model  = LigneDemandeAchat
        fields = [
            'id', 'article', 'article_detail',
            'quantite', 'quantite_commandee', 'quantite_restante',
            'prix_unitaire_estime',
            'fournisseur_suggere', 'notes', 'demande_reference',
        ]


class DemandeAchatSerializer(serializers.ModelSerializer):
    lignes              = LigneDASerializer(many=True, read_only=True)
    statut_label        = serializers.CharField(source='get_statut_display', read_only=True)
    demandeur_nom       = serializers.CharField(source='demandeur.nom_complet', read_only=True)
    approuve_par_nom    = serializers.CharField(source='approuve_par.nom_complet', read_only=True, default=None)
    peut_etre_modifie   = serializers.BooleanField(read_only=True)
    da_parente_reference = serializers.CharField(source='da_parente.reference', read_only=True, default=None)

    class Meta:
        model  = DemandeAchat
        fields = [
            'id', 'reference', 'statut', 'statut_label', 'urgence',
            'montant_estime', 'version', 'da_parente', 'da_parente_reference',
            'peut_etre_modifie',
            'notes', 'lignes', 'demandeur', 'demandeur_nom',
            'approuve_par', 'approuve_par_nom', 'date_creation', 'date_modif',
        ]
        read_only_fields = ['reference', 'demandeur', 'date_creation', 'date_modif']


class DemandeAchatCreateSerializer(serializers.ModelSerializer):
    lignes = LigneDASerializer(many=True)

    class Meta:
        model  = DemandeAchat
        fields = ['urgence', 'notes', 'lignes']

    def create(self, validated_data):
        from logistique.services import generer_reference_da
        from decimal import Decimal
        lignes_data = validated_data.pop('lignes')
        validated_data['demandeur'] = self.context['request'].user
        validated_data['reference'] = generer_reference_da()
        da = DemandeAchat.objects.create(**validated_data)
        montant = Decimal('0')
        for ligne in lignes_data:
            LigneDemandeAchat.objects.create(demande=da, **ligne)
            prix = ligne.get('prix_unitaire_estime')
            if prix:
                montant += prix * ligne['quantite']
        if montant > 0:
            da.montant_estime = montant
            da.save(update_fields=['montant_estime'])
        return da


class LigneDAUpdateSerializer(serializers.Serializer):
    id                   = serializers.UUIDField(required=False, allow_null=True)
    article              = serializers.PrimaryKeyRelatedField(queryset=Article.objects.all())
    quantite             = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal('0.001'))
    prix_unitaire_estime = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True)
    notes                = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')


class DemandeAchatUpdateSerializer(serializers.Serializer):
    urgence = serializers.BooleanField(required=False)
    notes   = serializers.CharField(required=False, allow_blank=True)
    lignes  = LigneDAUpdateSerializer(many=True, required=False)

    def validate_lignes(self, value):
        if value is not None and len(value) == 0:
            raise serializers.ValidationError('La demande doit comporter au moins une ligne.')
        return value


# ---------------------------------------------------------------------------
# Bons de Commande
# ---------------------------------------------------------------------------

class ConditionTarifaireSerializer(serializers.ModelSerializer):
    mode_calcul_label = serializers.CharField(source='get_mode_calcul_display', read_only=True)
    type_effet_label  = serializers.CharField(source='get_type_effet_display',  read_only=True)
    niveau_label      = serializers.CharField(source='get_niveau_display',      read_only=True)
    nb_applications   = serializers.SerializerMethodField()

    class Meta:
        model  = ConditionTarifaire
        fields = [
            'id', 'nom', 'mode_calcul', 'mode_calcul_label',
            'type_effet', 'type_effet_label', 'niveau', 'niveau_label',
            'valeur_defaut', 'description', 'actif',
            'nb_applications', 'date_creation', 'date_modif',
        ]
        read_only_fields = ['date_creation', 'date_modif']

    def get_nb_applications(self, obj):
        return obj.applications.count()


class ConditionAppliqueeBCSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ConditionAppliqueeBC
        fields = [
            'id', 'condition', 'bon_commande', 'ligne_bc', 'ordre', 'valeur',
            'nom_snapshot', 'mode_calcul_snapshot', 'type_effet_snapshot',
        ]
        read_only_fields = ['nom_snapshot', 'mode_calcul_snapshot', 'type_effet_snapshot']


class ConditionAppliqueeBCCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ConditionAppliqueeBC
        fields = ['condition', 'bon_commande', 'ligne_bc', 'ordre', 'valeur']

    def validate(self, data):
        bc   = data.get('bon_commande')
        ligne = data.get('ligne_bc')
        if not bc and not ligne:
            raise serializers.ValidationError('Préciser bon_commande ou ligne_bc.')
        if bc and ligne:
            raise serializers.ValidationError('bon_commande et ligne_bc sont mutuellement exclusifs.')
        return data

    def create(self, validated_data):
        condition = validated_data['condition']
        validated_data['nom_snapshot']         = condition.nom
        validated_data['mode_calcul_snapshot'] = condition.mode_calcul
        validated_data['type_effet_snapshot']  = condition.type_effet
        return super().create(validated_data)


class LigneBCSerializer(serializers.ModelSerializer):
    """Sérialiseur de lecture des lignes BC."""
    article_detail    = ArticleListSerializer(source='article', read_only=True)
    montant_ht        = serializers.ReadOnlyField()
    quantite_restante = serializers.ReadOnlyField()
    conditions        = ConditionAppliqueeBCSerializer(many=True, read_only=True)

    class Meta:
        model  = LigneBonCommande
        fields = [
            'id', 'article', 'article_detail',
            'quantite_commandee', 'quantite_recue', 'quantite_restante',
            'prix_unitaire', 'montant_ht', 'conditions',
            'ligne_da',
        ]


class LigneBCCreateSerializer(serializers.ModelSerializer):
    """Sérialiseur d'écriture pour une ligne BC — supporte l'import depuis une ligne DA."""
    ligne_da_id = serializers.UUIDField(required=False, allow_null=True, write_only=True)

    class Meta:
        model  = LigneBonCommande
        fields = ['article', 'quantite_commandee', 'prix_unitaire', 'ligne_da_id']


class LigneBCUpdateSerializer(serializers.ModelSerializer):
    """PATCH brouillon : quantite_commandee et/ou prix_unitaire uniquement."""
    class Meta:
        model  = LigneBonCommande
        fields = ['quantite_commandee', 'prix_unitaire']


class LigneBCStandaloneCreateSerializer(serializers.ModelSerializer):
    """Création d'une ligne depuis le détail BC (brouillon uniquement)."""
    class Meta:
        model  = LigneBonCommande
        fields = ['bon_commande', 'article', 'quantite_commandee', 'prix_unitaire']


class BonCommandeSerializer(serializers.ModelSerializer):
    lignes              = LigneBCSerializer(many=True, read_only=True)
    conditions          = ConditionAppliqueeBCSerializer(many=True, read_only=True)
    fournisseur_detail  = FournisseurListSerializer(source='fournisseur', read_only=True)
    statut_label        = serializers.CharField(source='get_statut_display', read_only=True)
    cree_par_nom        = serializers.CharField(source='cree_par.nom_complet', read_only=True, default=None)
    montant_ht_facture  = serializers.SerializerMethodField()
    montant_ttc_facture = serializers.SerializerMethodField()
    est_en_retard       = serializers.SerializerMethodField()

    class Meta:
        model  = BonCommande
        fields = [
            'id', 'reference', 'fournisseur', 'fournisseur_detail',
            'statut', 'statut_label', 'version',
            'date_commande', 'date_livraison_prev', 'adresse_livraison',
            'montant_ht', 'montant_ttc',
            'notes', 'lignes', 'conditions',
            'cree_par', 'cree_par_nom', 'date_creation', 'date_modif',
            'montant_ht_facture', 'montant_ttc_facture', 'est_en_retard',
        ]
        read_only_fields = [
            'reference', 'cree_par', 'version',
            'montant_ht', 'montant_ttc',
            'date_creation', 'date_modif',
        ]

    def get_montant_ht_facture(self, obj):
        from django.db.models import Sum
        result = obj.factures.exclude(statut='annulee').aggregate(Sum('montant_ht'))
        return float(result['montant_ht__sum'] or 0)

    def get_montant_ttc_facture(self, obj):
        from django.db.models import Sum
        result = obj.factures.exclude(statut='annulee').aggregate(Sum('montant_ttc'))
        return float(result['montant_ttc__sum'] or 0)

    def get_est_en_retard(self, obj):
        """True si le BC a une date de livraison prévue dépassée et n'est pas encore reçu."""
        from django.utils import timezone
        if obj.statut in (BonCommande.Statut.RECU, BonCommande.Statut.ANNULE):
            return False
        if not obj.date_livraison_prev:
            return False
        return obj.date_livraison_prev < timezone.now().date()


class BonCommandeCreateSerializer(serializers.ModelSerializer):
    lignes = LigneBCCreateSerializer(many=True)

    class Meta:
        model  = BonCommande
        fields = ['fournisseur', 'date_commande', 'date_livraison_prev', 'adresse_livraison', 'notes', 'lignes']


    def validate(self, data):
        """GAP 3 — Bloquer un fournisseur non approuvé ou inactif."""
        fournisseur = data.get('fournisseur')
        if fournisseur:
            if not fournisseur.actif:
                raise serializers.ValidationError({
                    'fournisseur': f"Le fournisseur « {fournisseur.raison_sociale} » est inactif."
                })
            if fournisseur.qualification != Fournisseur.Qualification.APPROUVE:
                raise serializers.ValidationError({
                    'fournisseur': (
                        f"Le fournisseur « {fournisseur.raison_sociale} » n'est pas qualifié "
                        f"(statut : {fournisseur.get_qualification_display()}). "
                        "Seuls les fournisseurs avec le statut « Approuvé » peuvent être commandés."
                    )
                })
        return data

    def create(self, validated_data):
        from logistique.services import generer_reference_bc
        from django.db import transaction as db_transaction

        lignes_data = validated_data.pop('lignes')
        validated_data['cree_par']  = self.context['request'].user
        validated_data['reference'] = generer_reference_bc()

        with db_transaction.atomic():
            bc = BonCommande.objects.create(**validated_data)
            da_ids = set()

            for ligne_data in lignes_data:
                ligne_da_id = ligne_data.pop('ligne_da_id', None)
                ligne_da    = None

                if ligne_da_id:
                    try:
                        ligne_da = LigneDemandeAchat.objects.select_for_update().get(id=ligne_da_id)
                        qte = ligne_data['quantite_commandee']
                        # Incrémenter quantite_commandee (plafonné à quantite)
                        ligne_da.quantite_commandee = min(
                            ligne_da.quantite_commandee + qte,
                            ligne_da.quantite,
                        )
                        ligne_da.save(update_fields=['quantite_commandee'])
                        da_ids.add(str(ligne_da.demande_id))
                    except LigneDemandeAchat.DoesNotExist:
                        pass

                LigneBonCommande.objects.create(bon_commande=bc, ligne_da=ligne_da, **ligne_data)

            # Auto-marquer la DA comme "Traitée" si toutes ses lignes sont entièrement commandées
            for da_id in da_ids:
                da = DemandeAchat.objects.prefetch_related('lignes').get(id=da_id)
                if da.statut == DemandeAchat.Statut.APPROUVEE:
                    if all(l.quantite_restante <= 0 for l in da.lignes.all()):
                        da.statut = DemandeAchat.Statut.TRAITEE
                        da.save(update_fields=['statut'])

            bc.calculer_totaux()

        return bc


# ---------------------------------------------------------------------------
# Réceptions
# ---------------------------------------------------------------------------

class LigneReceptionSerializer(serializers.ModelSerializer):
    article_detail     = ArticleListSerializer(source='ligne_bc.article', read_only=True)
    quantite_commandee = serializers.DecimalField(
        source='ligne_bc.quantite_commandee', read_only=True, max_digits=12, decimal_places=3
    )
    quantite_restante  = serializers.DecimalField(
        source='ligne_bc.quantite_restante', read_only=True, max_digits=12, decimal_places=3
    )

    class Meta:
        model  = LigneReception
        fields = [
            'id', 'ligne_bc', 'article_detail', 'quantite_commandee', 'quantite_restante',
            'quantite_recue', 'numero_lot_fournisseur', 'date_peremption',
            'conforme', 'motif_non_conformite',        # GAP R1
            'lot_cree',
        ]
        read_only_fields = ['lot_cree']


class ReceptionSerializer(serializers.ModelSerializer):
    lignes                = LigneReceptionSerializer(many=True, read_only=True)
    statut_label          = serializers.CharField(source='get_statut_display', read_only=True)
    bon_commande_detail   = serializers.SerializerMethodField()
    est_livraison_a_temps = serializers.ReadOnlyField()
    jours_retard          = serializers.ReadOnlyField()
    nb_lignes_nc          = serializers.SerializerMethodField()   # GAP R14

    class Meta:
        model  = Reception
        fields = [
            'id', 'reference', 'bon_commande', 'bon_commande_detail',
            'statut', 'statut_label',
            'date_reception', 'numero_bl_fournisseur', 'piece_jointe_bl',  # R16 / R8
            'notes', 'lignes',
            'recue_par', 'date_creation',
            'est_livraison_a_temps', 'jours_retard',
            'nb_lignes_nc',
        ]
        read_only_fields = ['reference', 'recue_par', 'date_creation']

    def get_bon_commande_detail(self, obj):
        return {
            'reference':        obj.bon_commande.reference,
            'fournisseur_detail': {'raison_sociale': obj.bon_commande.fournisseur.raison_sociale},
        }

    def get_nb_lignes_nc(self, obj):
        """Nombre de lignes non conformes sur cette réception."""
        return obj.lignes.filter(conforme=False).count()


class ReceptionCreateSerializer(serializers.ModelSerializer):
    lignes = LigneReceptionSerializer(many=True)

    class Meta:
        model  = Reception
        fields = ['bon_commande', 'date_reception', 'numero_bl_fournisseur', 'notes', 'lignes']

    def validate_lignes(self, lignes):
        """GAP R3 — Tolérance surlivraison : quantite_recue ≤ quantite_restante × 1.1 (10%)."""
        from decimal import Decimal
        TOLERANCE = Decimal('0.10')
        for ligne in lignes:
            ligne_bc  = ligne.get('ligne_bc')
            qte_recue = ligne.get('quantite_recue')
            if ligne_bc and qte_recue:
                qte_max = ligne_bc.quantite_restante * (1 + TOLERANCE)
                if Decimal(str(qte_recue)) > qte_max:
                    raise serializers.ValidationError(
                        f"Surlivraison dépassant la tolérance (10 %) pour "
                        f"« {ligne_bc.article.designation} » : "
                        f"reçu {qte_recue}, max autorisé {qte_max:.3f} "
                        f"(restant {ligne_bc.quantite_restante} + 10 %)."
                    )
        return lignes

    def create(self, validated_data):
        from logistique.services import generer_reference_reception
        lignes_data = validated_data.pop('lignes')
        validated_data['recue_par']  = self.context['request'].user
        validated_data['reference']  = generer_reference_reception()
        rec = Reception.objects.create(**validated_data)
        for ligne in lignes_data:
            LigneReception.objects.create(reception=rec, **ligne)
        return rec


# ---------------------------------------------------------------------------
# Retours Fournisseurs (GAP R4)
# ---------------------------------------------------------------------------

class LigneRetourSerializer(serializers.ModelSerializer):
    article_designation = serializers.CharField(
        source='ligne_reception.ligne_bc.article.designation', read_only=True
    )
    lot_numero = serializers.CharField(
        source='ligne_reception.lot_cree.numero_lot', read_only=True, default=None
    )
    lot_statut = serializers.CharField(
        source='ligne_reception.lot_cree.statut', read_only=True, default=None
    )
    quantite_recue_origine = serializers.DecimalField(
        source='ligne_reception.quantite_recue', read_only=True,
        max_digits=12, decimal_places=3,
    )

    class Meta:
        model  = LigneRetour
        fields = [
            'id', 'ligne_reception', 'article_designation',
            'lot_numero', 'lot_statut',
            'quantite_recue_origine', 'quantite_retournee',
        ]

    def validate(self, data):
        ligne_rec = data.get('ligne_reception')
        qte       = data.get('quantite_retournee')
        if ligne_rec and qte:
            lot = ligne_rec.lot_cree
            if lot is None:
                raise serializers.ValidationError(
                    "Cette ligne de réception n'a pas encore de lot (réception non validée)."
                )
            from decimal import Decimal
            if Decimal(str(qte)) > lot.quantite_restante:
                raise serializers.ValidationError(
                    f"Quantité retournée ({qte}) > quantité restante du lot "
                    f"{lot.numero_lot} ({lot.quantite_restante})."
                )
        return data


class RetourFournisseurSerializer(serializers.ModelSerializer):
    lignes          = LigneRetourSerializer(many=True)
    statut_label    = serializers.CharField(source='get_statut_display', read_only=True)
    fournisseur_nom = serializers.CharField(source='fournisseur.raison_sociale', read_only=True)
    reception_ref   = serializers.CharField(source='reception.reference', read_only=True)
    cree_par_nom    = serializers.CharField(source='cree_par.nom_complet', read_only=True, default=None)

    class Meta:
        model  = RetourFournisseur
        fields = [
            'id', 'reference',
            'reception', 'reception_ref',
            'fournisseur', 'fournisseur_nom',
            'statut', 'statut_label',
            'date_retour', 'motif', 'notes', 'lignes',
            'cree_par', 'cree_par_nom', 'date_creation', 'date_modif',
        ]
        read_only_fields = ['reference', 'fournisseur', 'cree_par', 'date_creation', 'date_modif']

    def create(self, validated_data):
        from logistique.services import generer_reference_retour
        lignes_data = validated_data.pop('lignes')
        # Dénormaliser le fournisseur depuis la réception
        validated_data['fournisseur'] = validated_data['reception'].bon_commande.fournisseur
        validated_data['reference']   = generer_reference_retour()
        validated_data['cree_par']    = self.context['request'].user
        retour = RetourFournisseur.objects.create(**validated_data)
        for ligne in lignes_data:
            LigneRetour.objects.create(retour=retour, **ligne)
        return retour


# ---------------------------------------------------------------------------
# Factures Fournisseurs
# ---------------------------------------------------------------------------

class LigneFactureFournisseurSerializer(serializers.ModelSerializer):
    """F9 — Ligne de facture avec lien optionnel vers la ligne BC."""
    article_designation = serializers.CharField(
        source='ligne_bc.article.designation', read_only=True, default=None
    )
    montant_ht  = serializers.ReadOnlyField()
    montant_tva = serializers.ReadOnlyField()
    montant_ttc = serializers.ReadOnlyField()

    class Meta:
        model  = LigneFactureFournisseur
        fields = [
            'id', 'ligne_bc', 'article_designation',
            'designation', 'quantite', 'prix_unitaire', 'taux_tva',
            'montant_ht', 'montant_tva', 'montant_ttc',
        ]


class EcheanceFactureSerializer(serializers.ModelSerializer):
    """F10 — Ligne d'échéancier multi-échéances."""
    est_en_retard = serializers.ReadOnlyField()

    class Meta:
        model  = EcheanceFacture
        fields = ['id', 'montant', 'date_echeance', 'payee', 'notes', 'est_en_retard']


class PaiementFactureSerializer(serializers.ModelSerializer):
    mode_paiement_label = serializers.CharField(source='get_mode_paiement_display', read_only=True)
    effectue_par_nom    = serializers.CharField(source='effectue_par.nom_complet', read_only=True, default=None)

    class Meta:
        model  = PaiementFacture
        fields = [
            'id', 'montant', 'date_paiement',
            'mode_paiement', 'mode_paiement_label',
            'reference_paiement',
            'piece_jointe',       # F13
            'annule',             # F6/F14
            'effectue_par_nom',
            'date_saisie',
        ]
        read_only_fields = ['effectue_par_nom', 'annule', 'date_saisie']


class FactureFournisseurSerializer(serializers.ModelSerializer):
    fournisseur_detail  = FournisseurListSerializer(source='fournisseur', read_only=True)
    bon_commande_ref    = serializers.CharField(source='bon_commande.reference', read_only=True, default=None)
    reception_ref       = serializers.CharField(source='reception.reference', read_only=True, default=None)
    statut_label        = serializers.CharField(source='get_statut_display', read_only=True)
    type_document_label = serializers.CharField(source='get_type_document_display', read_only=True)
    facture_origine_ref = serializers.CharField(source='facture_origine.reference', read_only=True, default=None)
    montant_restant     = serializers.ReadOnlyField()
    est_en_retard       = serializers.ReadOnlyField()
    est_avoir           = serializers.ReadOnlyField()
    paiements           = PaiementFactureSerializer(many=True, read_only=True)
    lignes              = LigneFactureFournisseurSerializer(many=True, read_only=True)   # F9
    echeances           = EcheanceFactureSerializer(many=True, read_only=True)           # F10
    alerte_3way         = serializers.SerializerMethodField()   # F3 (bug fix)
    approuve_par_nom    = serializers.CharField(source='approuve_par.nom_complet', read_only=True, default=None)
    nb_paiements_actifs = serializers.SerializerMethodField()

    class Meta:
        model  = FactureFournisseur
        fields = [
            'id', 'reference', 'ref_fournisseur',
            'fournisseur', 'fournisseur_detail',
            'bon_commande', 'bon_commande_ref',
            'reception', 'reception_ref',
            'type_document', 'type_document_label',
            'facture_origine', 'facture_origine_ref',
            'est_avoir',
            'statut', 'statut_label',
            'montant_ht', 'tva', 'montant_ttc',
            'montant_paye', 'montant_restant', 'est_en_retard',
            'date_facture', 'date_echeance',
            'piece_jointe',                                          # F2
            'notes',
            'paiements', 'nb_paiements_actifs',
            'lignes',                                                # F9
            'echeances',                                             # F10
            'approuve_par_nom', 'date_approbation',                  # F1
            'date_creation',
            'alerte_3way',                                           # F3
        ]
        read_only_fields = [
            'reference', 'cree_par', 'date_creation',
            'montant_paye', 'approuve_par', 'date_approbation',
        ]

    def get_nb_paiements_actifs(self, obj):
        return obj.paiements.filter(annule=False).count()

    def get_alerte_3way(self, obj):
        """
        F3 (bug fix) + F9 — 3-way matching BC + Réception spécifique + Facture.
        Bug corrigé : utilise les quantités de obj.reception (pas toutes les lignes BC).
        Ajoute le matching ligne à ligne si des lignes de facture avec ligne_bc existent.
        Tolérance : 5 %.
        """
        from decimal import Decimal
        alertes = []
        TOL = Decimal('0.05')

        # ── 1. Montant facture vs montant BC ──────────────────────────────────
        if obj.bon_commande_id:
            bc = obj.bon_commande
            if bc.montant_ttc > 0:
                ecart = abs(obj.montant_ttc - bc.montant_ttc) / bc.montant_ttc
                if ecart > TOL:
                    alertes.append(
                        f"Montant TTC facture ({obj.montant_ttc:,.0f} FCFA) "
                        f"dévie de {ecart*100:.1f} % du BC "
                        f"({bc.montant_ttc:,.0f} FCFA) — tolérance 5 %."
                    )

        # ── 2. Montant facture vs montant réceptionné (bug fix F3) ────────────
        if obj.reception_id:
            from decimal import Decimal as D
            montant_recep = sum(
                D(str(lr.quantite_recue))
                * D(str(lr.ligne_bc.prix_unitaire))
                * (1 + D(str(lr.ligne_bc.taux_tva)) / 100)
                for lr in obj.reception.lignes.select_related('ligne_bc').all()
            )
            if montant_recep > 0:
                ecart = abs(obj.montant_ttc - montant_recep) / montant_recep
                if ecart > TOL:
                    alertes.append(
                        f"Montant TTC facture ({obj.montant_ttc:,.0f} FCFA) "
                        f"dévie de {ecart*100:.1f} % du montant réceptionné "
                        f"({montant_recep:,.0f} FCFA, réception {obj.reception.reference}) "
                        f"— tolérance 5 %."
                    )

        # ── 3. Matching ligne à ligne (F9) ─────────────────────────────────────
        for lf in obj.lignes.select_related('ligne_bc__article').filter(ligne_bc__isnull=False):
            lb = lf.ligne_bc
            if lb.prix_unitaire > 0:
                ecart_pu = abs(lf.prix_unitaire - lb.prix_unitaire) / lb.prix_unitaire
                if ecart_pu > TOL:
                    alertes.append(
                        f"Ligne « {lf.designation} » : P.U. facture "
                        f"({lf.prix_unitaire:,.0f} FCFA) dévie de "
                        f"{ecart_pu*100:.1f} % du P.U. BC "
                        f"({lb.prix_unitaire:,.0f} FCFA)."
                    )

        return alertes


class FactureFournisseurCreateSerializer(serializers.ModelSerializer):
    """
    F1/F7/F8/F9 — Création d'une facture, d'un avoir ou d'une facture de frais.
    Lignes et échéances optionnelles. Démarre toujours en BROUILLON.
    """
    lignes    = LigneFactureFournisseurSerializer(many=True, required=False)
    echeances = EcheanceFactureSerializer(many=True, required=False)

    class Meta:
        model  = FactureFournisseur
        fields = [
            'fournisseur', 'bon_commande', 'reception',
            'type_document', 'facture_origine',
            'ref_fournisseur', 'date_facture', 'date_echeance',
            'montant_ht', 'tva', 'montant_ttc',
            'piece_jointe', 'notes',
            'lignes', 'echeances',
        ]

    def validate(self, data):
        # F8 : un avoir doit référencer une facture d'origine
        if data.get('type_document') == FactureFournisseur.TypeDocument.AVOIR:
            if not data.get('facture_origine'):
                raise serializers.ValidationError({
                    'facture_origine': "Un avoir doit être lié à une facture d'origine."
                })
        return data

    def create(self, validated_data):
        from logistique.services import generer_reference_facture, generer_reference_avoir
        from django.db import transaction as db_tx

        lignes_data    = validated_data.pop('lignes',    [])
        echeances_data = validated_data.pop('echeances', [])

        type_doc = validated_data.get('type_document', FactureFournisseur.TypeDocument.FACTURE)
        validated_data['reference'] = (
            generer_reference_avoir()
            if type_doc == FactureFournisseur.TypeDocument.AVOIR
            else generer_reference_facture()
        )
        validated_data['cree_par'] = self.context['request'].user

        with db_tx.atomic():
            facture = FactureFournisseur.objects.create(**validated_data)
            for ligne_data in lignes_data:
                LigneFactureFournisseur.objects.create(facture=facture, **ligne_data)
            for ech_data in echeances_data:
                EcheanceFacture.objects.create(facture=facture, **ech_data)
            if lignes_data:
                facture.calculer_totaux()

        return facture


# ---------------------------------------------------------------------------
# Inventaires Physiques
# ---------------------------------------------------------------------------

class LigneInventaireSerializer(serializers.ModelSerializer):
    # Champs calculés — gèrent les deux cas : lot renseigné ou article direct
    lot_numero          = serializers.SerializerMethodField()
    article_designation = serializers.SerializerMethodField()
    unite_code          = serializers.SerializerMethodField()
    ecart               = serializers.ReadOnlyField()
    statut_saisie_label = serializers.CharField(source='get_statut_saisie_display', read_only=True)
    # I12 — quantite_theorique masquée si session en mode aveugle
    quantite_theorique  = serializers.SerializerMethodField()

    class Meta:
        model  = LigneInventaire
        fields = [
            'id', 'lot', 'article', 'lot_numero', 'article_designation', 'unite_code',
            'quantite_theorique', 'quantite_systeme_validation',
            'quantite_comptee', 'prix_unitaire_valorisation',
            'ecart', 'justification',
            'statut_saisie', 'statut_saisie_label', 'valide',
        ]
        read_only_fields = [
            'quantite_systeme_validation', 'prix_unitaire_valorisation',
            'statut_saisie', 'valide',
        ]

    def get_lot_numero(self, obj):
        return obj.lot.numero_lot if obj.lot_id else None

    def get_article_designation(self, obj):
        if obj.lot_id:
            return obj.lot.article.designation
        return obj.article.designation if obj.article_id else None

    def get_unite_code(self, obj):
        if obj.lot_id:
            return obj.lot.article.unite.code
        return obj.article.unite.code if obj.article_id else None

    def get_quantite_theorique(self, obj):
        """I12 — Masque la quantité théorique si la session est en mode aveugle."""
        request = self.context.get('request')
        session = obj.session
        if session.aveugle and obj.statut_saisie == LigneInventaire.StatutSaisie.NON_SAISIE:
            # Masqué sauf pour les admins/directeurs
            if request and hasattr(request.user, 'role') and request.user.role in ('admin', 'directeur'):
                return float(obj.quantite_theorique)
            return None
        return float(obj.quantite_theorique)


class InventaireSessionSerializer(serializers.ModelSerializer):
    statut_label          = serializers.CharField(source='get_statut_display', read_only=True)
    type_perimetre_label  = serializers.CharField(source='get_type_perimetre_display', read_only=True)
    cree_par_nom          = serializers.CharField(source='cree_par.nom_complet', read_only=True, default=None)
    lignes                = LigneInventaireSerializer(many=True, read_only=True)
    nb_lignes             = serializers.SerializerMethodField()
    nb_ecarts             = serializers.SerializerMethodField()
    nb_lignes_non_comptees = serializers.SerializerMethodField()   # I9
    taux_completion       = serializers.SerializerMethodField()    # I9

    class Meta:
        model  = InventaireSession
        fields = [
            'id', 'reference', 'statut', 'statut_label',
            'type_perimetre', 'type_perimetre_label', 'categories', 'articles_cibles',
            'aveugle',
            'date_debut', 'date_fin', 'notes',
            'cree_par', 'cree_par_nom',
            'lignes',
            'nb_lignes', 'nb_ecarts', 'nb_lignes_non_comptees', 'taux_completion',
        ]
        read_only_fields = ['reference', 'cree_par', 'date_debut']

    def get_nb_lignes(self, obj):
        return obj.lignes.count()

    def get_nb_ecarts(self, obj):
        return sum(1 for lg in obj.lignes.all() if lg.ecart is not None and abs(lg.ecart) > 0.001)

    def get_nb_lignes_non_comptees(self, obj):
        """I9 — Nombre de lignes sans quantite_comptee."""
        return obj.lignes.filter(quantite_comptee__isnull=True).count()

    def get_taux_completion(self, obj):
        """I9 — Pourcentage de lignes saisies."""
        total = obj.lignes.count()
        if not total:
            return None
        saisies = obj.lignes.filter(quantite_comptee__isnull=False).count()
        return round(saisies / total * 100, 1)
