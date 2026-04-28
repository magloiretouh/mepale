# MEPALE ERP — Guide Claude

> **À la fin de chaque session**, propose une mise à jour de ce fichier avec les nouvelles conventions, décisions ou commandes découvertes.
> **À chaque décision d'architecture**, note-la dans la section correspondante.

---

## Chemins absolus

| Projet | Chemin |
|---|---|
| Backend (Django) | `C:\Users\maglo\Documents\MANZAY\MEPALE API\` |
| Frontend (React) | `C:\Users\maglo\Documents\MANZAY\MEPALE Frontend\src\` |

---

## Commandes essentielles

### Backend
```bash
# Serveur de développement
cd "C:\Users\maglo\Documents\MANZAY\MEPALE API"
venv/Scripts/python manage.py runserver

# Migrations (toujours via venv — pas python direct)
venv/Scripts/python manage.py makemigrations <app>
venv/Scripts/python manage.py migrate

# Shell Django
venv/Scripts/python manage.py shell

# Tests
venv/Scripts/python manage.py test <app>
```

### Frontend
```bash
cd "C:\Users\maglo\Documents\MANZAY\MEPALE Frontend"
npm run dev      # port 5173 → proxy /api → localhost:8000
npm run build    # tsc -b && vite build
npm run lint
```

---

## Stack

| | Tech | Version |
|---|---|---|
| **Frontend** | React + Vite + TailwindCSS v4 + React Query v5 + React Router v7 | React 19 |
| **State** | Zustand (auth, theme) + React Query (serveur) | — |
| **Backend** | Django + DRF + JWT (simplejwt) + PostgreSQL | Django 6 |
| **Async** | Celery + Redis | — |
| **Audit** | django-simple-history | — |

---

## Architecture Backend

### Structure d'un app Django
```
{app}/
├── models.py       # Modèles + logique métier (propriétés, méthodes)
├── serializers.py  # ListSerializer (léger) + DetailSerializer (complet) + CreateSerializer
├── views.py        # ViewSets (ModelViewSet) + @action pour endpoints custom
├── filters.py      # django-filter FilterSets (toujours ChoiceFilter/MultipleChoiceFilter)
├── permissions.py  # Permission classes custom
├── services.py     # Logique utilitaire (génération référence, calculs)
└── urls.py         # Router DRF
```

### Patterns ViewSet établis
```python
# Deux serializers : léger (list) / complet (retrieve/update)
def get_serializer_class(self):
    if self.action == 'list':
        return MonModelListSerializer
    return MonModelSerializer

# Actions custom
@action(detail=True, methods=['post'], url_path='mon-action')
def mon_action(self, request, pk=None):
    obj = self.get_object()
    # ...
    return Response({'detail': 'Message.'})
```

### Patterns Filter (filters.py)
```python
class MonFilter(django_filters.FilterSet):
    statut    = django_filters.MultipleChoiceFilter(choices=Mon.Statut.choices)
    champ_fk  = django_filters.UUIDFilter(field_name='fk__id')
    actif     = django_filters.BooleanFilter()

    class Meta:
        model  = Mon
        fields = ['statut', 'champ_fk', 'actif']
```

### IDs : UUID partout
Tous les modèles utilisent `UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`.

### URL API
Toutes les routes sont préfixées `/api/v1/` → ex: `/api/v1/logistique/fournisseurs/`

---

## Architecture Frontend

### Layout Shell
```
Shell.tsx
└── <main class="flex-1 overflow-y-auto overflow-x-hidden">
    └── <div class="p-6 min-h-full">
        └── <Outlet /> ← pages ici
```
**Le scroll principal est dans `<main>`.** Ne jamais mettre `overflow-auto` sur un conteneur de page.

### Structure d'une page standard
```tsx
// Toujours : fragment + modals HORS animate-fade-in
<>
  {showModal && <Modal ... />}

  <div className="space-y-4 animate-fade-in">
    {/* Header */}
    {/* Filtres */}
    {/* Table / Contenu */}
  </div>
</>
```

### Services API
```
src/services/
├── api.ts          # Axios + JWT interceptors + refresh
├── logistique.ts   # Interfaces + logistiqueApi.*
├── production.ts   # Interfaces + productionApi.*
└── rh.ts           # Interfaces + rhApi.*
```

### React Query patterns
```tsx
// Lecture
const { data, isLoading } = useQuery({
  queryKey: ['ma-ressource', id],
  queryFn:  () => monApi.get(id).then(r => r.data),
})

// Invalidation préfixe (invalide toutes les queries commençant par 'ma-ressource')
qc.invalidateQueries({ queryKey: ['ma-ressource'] })

// Mutation
const { mutate, isPending } = useMutation({
  mutationFn: (data) => monApi.create(data),
  onSuccess:  () => { toast.success('OK'); qc.invalidateQueries(...) },
  onError:    (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur'),
})
```

---

## Design System

### Tokens CSS (src/index.css)
```css
--bg-base        /* fond global */
--bg-surface     /* cartes, panneaux */
--bg-elevated    /* thead, footer de table, inputs */
--border         /* bordures standards */
--border-subtle  /* séparateurs de lignes */
--accent         /* couleur principale (#00A88C teal) */
--accent-dim     /* accent transparent (bg hover, badges) */
--text-primary   --text-secondary   --text-muted
--status-success --status-warning --status-danger --status-info
--shadow-lg
```

### Polices
- **Texte** : Plus Jakarta Sans (sans-serif) — remplace Outfit depuis 2026-04
- **Données / codes** : JetBrains Mono → classe `font-data`

### ⚠️ Rem offset
`html { font-size: 14px }` → les classes Tailwind rem sont ~12.5% plus petites qu'attendu.
→ Pour espacements critiques : `style={{ marginBottom: '16px' }}` plutôt que `mb-4`.

### Composants UI (`src/components/ui/`)

**Button**
```tsx
<Button
  variant="primary|secondary|ghost|danger|outline"  // défaut: primary
  size="xs|sm|md|lg"                                 // défaut: md (36px)
  loading={bool}
  icon={<Icon size={13} />}
  iconRight={<Icon />}
/>
```

**Badge**
```tsx
<Badge variant="success|warning|danger|info|neutral|accent" dot>Texte</Badge>
```

**Input** (height fixe 36px, focus ring cohérent)
```tsx
<Input icon={<Icon size={13} />} error="msg" label="Label" />
```

**FilterChip / FilterBar** (`src/components/ui/FilterChip.tsx`)
```tsx
import { FilterBar, FilterChip } from '@/components/ui/FilterChip'

<FilterBar>
  <div className="w-64"><Input ... /></div>
  <div className="flex items-center gap-2">
    {FILTRES.map(f => (
      <FilterChip
        key={f.value}
        active={filtre === f.value}
        onClick={() => setFiltre(f.value)}
        badge={f.count}           // optionnel : badge numérique
        variant="default|danger|warning"  // défaut: default
      >
        {f.label}
      </FilterChip>
    ))}
  </div>
</FilterBar>
```
→ **Toutes les nouvelles pages doivent utiliser ces composants.**
→ Les pages existantes utilisent encore l'ancien pattern (inline style) — acceptable.

**SELECT_CLASS** (pattern copié dans chaque fichier qui en a besoin)
```ts
const SELECT_CLASS =
  'w-full bg-[--bg-elevated] border border-[--border] rounded-lg text-sm text-[--text-primary] ' +
  'px-3 outline-none transition-all focus:border-[--accent] focus:bg-[--bg-surface] ' +
  'focus:shadow-[0_0_0_3px_var(--accent-dim)]'
```

**FIELD_LABEL** (labels de formulaire)
```ts
const FIELD_LABEL = 'block text-xs font-medium text-[--text-secondary] uppercase tracking-wider mb-1.5'
```

### surface (classe utilitaire)
```css
/* Carte/panneau standard */
.surface { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 0.75rem; }
```

---

## Règles critiques (bugs récurrents)

| ❌ Ne JAMAIS faire | ✅ À la place |
|---|---|
| `<Modal>` dans un div `animate-fade-in` | Modal dans `<>` fragment, hors du div |
| `overflow-y-auto` sur le backdrop Modal | Rien (le scroll est géré par `<main>`) |
| `overflow-auto` sur un conteneur de page | Laisser `<main>` gérer le scroll |
| `sticky` dans un conteneur avec transform | Pas de sticky si parent a transform |
| `python manage.py` sans venv | `venv/Scripts/python manage.py` |
| Filtre non déclaré dans `FilterSet` | Ajouter dans `filters.py` + `fields` Meta |
| `ArticleListSerializer` sans `prix_standard` | Déjà ajouté (voir production/serializers.py) |
| Dropdown `absolute` dans un conteneur `overflow-hidden` | `createPortal` vers `document.body` (voir pattern ci-dessous) |
| Boutons modal : Cancel=`secondary`, Confirm=`primary` | Cancel=`ghost`, Confirm=`primary` ; destructif : Cancel=`secondary`, Confirm=`danger` |

### Dropdown actions tableau : pattern obligatoire (portal)
Les tableaux ont `overflow-hidden` → les dropdowns `absolute` sont clippés. Utiliser `createPortal` :
```tsx
import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

function ActionMenu({ ... }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef          = useRef<HTMLButtonElement>(null)

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()                              // ← évite navigation row
    if (!open && btnRef.current)
      setRect(btnRef.current.getBoundingClientRect())
    setOpen(v => !v)
  }

  const dropdown = rect && open && createPortal(
    <>
      <div className="fixed inset-0 z-[9998]"
           onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
      <div
        className="rounded-md py-1 animate-scale-in"
        onClick={(e) => e.stopPropagation()}         // ← évite navigation row
        style={{
          position: 'fixed',
          top:      rect.bottom + 4,
          left:     rect.right - DROPDOWN_W,         // aligné bord droit du bouton
          width:    DROPDOWN_W,
          zIndex:   9999,
          backgroundColor: 'var(--bg-surface)',
          border:   '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* items */}
      </div>
    </>,
    document.body
  )

  return (
    <>
      {dropdown}
      <button ref={btnRef} onClick={handleToggle} ...>
        <MoreHorizontal size={14} />
      </button>
    </>
  )
}
```
- `DROPDOWN_W` en px : w-44=176, w-48=192, w-52=208
- `animate-scale-in` utilise `transform: scale()` → ne PAS combiner avec `transform: translateX()`
- Pages appliquées : DevisList, BonLivraisonList, ClientList, CommandeClientList, FactureVenteList, RetourClientList, FournisseurList, LotList, OrdreFabricationList

### Modals : pattern obligatoire
```tsx
// ✅ CORRECT
<>
  {showModal && <MonModal ... />}         {/* hors animate-fade-in */}
  <div className="... animate-fade-in">  {/* page content */}
    ...
  </div>
</>

// ✅ Container modal
<div className="relative z-10 ... flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
  <header className="flex-shrink-0 border-b" ...>
  <div className="flex-1 overflow-y-auto px-5 py-5">   {/* body scrollable */}
    <div className="flex flex-col gap-5"> ... </div>
  </div>
  <footer className="flex-shrink-0 border-t" ...>
</div>
```

---

## Modules et routes

### Frontend (`src/App.tsx`)
```
/dashboard
/production/ordres-de-fabrication         OrdreFabricationList
/production/ordres-de-fabrication/:id     OFDetail
/production/catalogue                     ArticleList
/production/nomenclatures                 NomenclatureList
/production/lots                          LotList
/logistique/fournisseurs                  FournisseurList
/logistique/fournisseurs/:id              FournisseurDetail
/logistique/stock                         StockList
/logistique/bons-commande                 BonCommandeList
/logistique/receptions                    ReceptionList
/logistique/demandes-achat                DemandeAchatList
/logistique/demandes-achat/:id            DemandeAchatDetail  ← ajouté
/logistique/mouvements                    MouvementList
/logistique/inventaires                   InventaireList
/logistique/inventaires/:id               InventaireDetail
/logistique/factures                      FactureList
/rh/employes                              Employes
/commercial/clients                       ClientList
/commercial/clients/:id                   ClientDetail
/commercial/devis                         DevisList
/commercial/devis/:id                     DevisDetail
/commercial/commandes                     CommandeClientList
/commercial/commandes/:id                 CommandeClientDetail
/commercial/bons-livraison               BonLivraisonList
/commercial/bons-livraison/:id           BonLivraisonDetail
/commercial/factures                      FactureVenteList
/commercial/factures/:id                  FactureVenteDetail
/commercial/retours                       RetourClientList
```

### Backend — Apps actives
```
authentication/   # JWT + User custom
production/       # Articles, Nomenclatures, OF, Lots, Pertes, CoutRevient
logistique/       # Fournisseurs, Stock, BC, Réceptions, DA, Mouvements, Inventaires, Factures
rh/               # Employés, Postes, Contrats, Congés
commercial/       # Clients, Devis, CommandeClient, BonLivraison, FactureVente, RetourClient ✅
caisses/          # (en cours)
comptabilite/     # (en cours)
```

---

## Workflow DA (Demandes d'Achat)

```
brouillon → soumise → [montant > 5 000 000 FCFA ?]
                          oui → attente_direction → approuvee
                          non → approuvee
                      → traitee (après conversion en BC)
                    → refusee (à tout moment)
```
- `montant_estime` calculé depuis `LigneDA.prix_unitaire_estime × quantite`
- `prix_unitaire_estime` pré-rempli depuis `Article.prix_standard` (ArticleListSerializer l'expose)
- Seuls les fournisseurs `qualification='approuve'` apparaissent dans la conversion DA→BC

---

## Décisions d'architecture

| Date | Décision |
|---|---|
| 2026-04 | DA : `prix_unitaire_estime` par ligne (Option A) pour estimer le montant |
| 2026-04 | `ArticleListSerializer` expose `prix_standard` |
| 2026-04 | `FournisseurFilter` : filtre `qualification` ajouté dans `filters.py` |
| 2026-04 | Pages liste → page détail via `/:id` (pattern : FournisseurDetail, DemandeAchatDetail, InventaireDetail, OFDetail) |
| 2026-04 | Scroll principal dans `Shell.<main>` — pages sans `overflow-auto` interne |
| 2026-04 | Module Commercial complet : 11 pages créées (ClientList/Detail, DevisList/Detail, CCList/Detail, BLList/Detail, FVList/Detail, RetourClientList) |
| 2026-04 | FactureVente : `NiveauRetard` (ok/soon/danger) → indicateurs visuels couleur sur jours_retard |
| 2026-04 | BL expédition : erreur 400 si stock insuffisant → toast.error côté frontend |
| 2026-04 | Devis : `convertir_en_commande` → navigate to new CC ; `revision` → navigate to new Devis |
| 2026-04 | CommandeClient : `confirmer` retourne `ConfirmationCCResult` (tout_disponible + warnings[]) |
| 2026-04 | Design modernisé : Plus Jakarta Sans (ex-Outfit), bg-base #E5E8F4, surface plus contrastée, radius-md→8px, radius-lg→12px, `p-6` Shell, SELECT_CLASS `rounded-lg` |
| 2026-04 | Filter bars : bg-elevated (ex bg-base), chip `rounded-lg px-3.5 py-1.5 gap-2`, border subtil sur inactif. Nouveau composant `FilterChip`+`FilterBar` pour les nouvelles pages |
| 2026-04 | bg-base → `#FFFFFF` (blanc), bg-surface → `#F7F8FC`, bg-elevated → `#ECEEF6` (light mode) |
| 2026-04 | Button primary : `bg-[var(--accent)]` (syntaxe explicite var()) obligatoire en Tailwind v4 |
| 2026-04 | Boutons Cancel modal : `variant="ghost"` (pas secondary) ; destructif : `variant="secondary"` + `variant="danger"` |
| 2026-04 | `select { height: 38px }` dans index.css — hauteur unifiée avec `<Input>` (38px) pour tous les selects |
| 2026-04 | Dropdown actions tableau : `createPortal → document.body` + `e.stopPropagation()` sur overlay et dropdown (voir pattern Règles critiques) |
| 2026-04 | Icône calendrier dark mode : `filter: invert(1) !important` sur `::-webkit-calendar-picker-indicator` ; PAS de `color-scheme: dark` (crée un conflit) |
| 2026-04 | BonCommandeList : filtre `en_retard` ajouté — utilise endpoint `/bons-commande/en-retard/` ; bouton "Voir tout" bannière → `setFiltre('en_retard')` |
