import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useEffect } from 'react'

import { Shell } from '@/components/layout/Shell'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { Dashboard } from '@/pages/Dashboard'
import { Login } from '@/pages/Login'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { ProfilPage }      from '@/pages/ProfilPage'
import { useThemeStore } from '@/store/themeStore'

// Production
import { OrdreFabricationList } from '@/pages/production/OrdreFabricationList'
import { OFDetail }             from '@/pages/production/OFDetail'
import { NomenclatureList }     from '@/pages/production/NomenclatureList'
import { LotList }              from '@/pages/production/LotList'
import { ArticleList }          from '@/pages/production/ArticleList'

// Administration
import { TypeArticleList }        from '@/pages/administration/TypeArticleList'
import { UniteMesureList }        from '@/pages/administration/UniteMesureList'
import { RhAdminPage }            from '@/pages/administration/RhAdminPage'
import { ConditionTarifaireList } from '@/pages/administration/ConditionTarifaireList'
import { UtilisateursPage }       from '@/pages/administration/UtilisateursPage'
import { ParametresPage }         from '@/pages/administration/ParametresPage'
import { CategoriesPage }         from '@/pages/administration/CategoriesPage'

// RH
import { Employes }            from '@/pages/rh/Employes'
import { EmployeDetail }       from '@/pages/rh/EmployeDetail'
import { CongesPage }          from '@/pages/rh/CongesPage'
import { PresencesPage }       from '@/pages/rh/PresencesPage'
import { PayrollRunPage }      from '@/pages/rh/PayrollRunPage'
import { BulkSimpleRunPage }   from '@/pages/rh/BulkSimpleRunPage'

// Commercial
import { ClientList }           from '@/pages/commercial/ClientList'
import { ClientDetail }         from '@/pages/commercial/ClientDetail'
import { DevisList }            from '@/pages/commercial/DevisList'
import { DevisDetail }          from '@/pages/commercial/DevisDetail'
import { CommandeClientList }   from '@/pages/commercial/CommandeClientList'
import { CommandeClientDetail } from '@/pages/commercial/CommandeClientDetail'
import { BonLivraisonList }     from '@/pages/commercial/BonLivraisonList'
import { BonLivraisonDetail }   from '@/pages/commercial/BonLivraisonDetail'
import { FactureVenteList }     from '@/pages/commercial/FactureVenteList'
import { FactureVenteDetail }   from '@/pages/commercial/FactureVenteDetail'
import { RetourClientList }     from '@/pages/commercial/RetourClientList'

// Comptabilité
import { ComptabilitePage } from '@/pages/comptabilite/ComptabilitePage'

// Caisses
import { CaisseDashboard }       from '@/pages/caisses/CaisseDashboard'
import { CaisseDetail }          from '@/pages/caisses/CaisseDetail'
import { MouvementsEnAttente }   from '@/pages/caisses/MouvementsEnAttente'
import { TransfertsPage }        from '@/pages/caisses/TransfertsPage'
import { ParametresCaissePage }  from '@/pages/caisses/ParametresCaissePage'

// Logistique
import { FournisseurList }   from '@/pages/logistique/FournisseurList'
import { FournisseurDetail } from '@/pages/logistique/FournisseurDetail'
import { StockList }        from '@/pages/logistique/StockList'
import { BonCommandeList }   from '@/pages/logistique/BonCommandeList'
import { BonCommandeDetail } from '@/pages/logistique/BonCommandeDetail'
import { ReceptionList }     from '@/pages/logistique/ReceptionList'
import { ReceptionDetail }   from '@/pages/logistique/ReceptionDetail'
import { DemandeAchatList }   from '@/pages/logistique/DemandeAchatList'
import { DemandeAchatDetail } from '@/pages/logistique/DemandeAchatDetail'
import { MouvementList }    from '@/pages/logistique/MouvementList'
import { InventaireList }   from '@/pages/logistique/InventaireList'
import { InventaireDetail } from '@/pages/logistique/InventaireDetail'
import { FactureList }      from '@/pages/logistique/FactureList'
import { FactureDetail }   from '@/pages/logistique/FactureDetail'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
})

function ThemeInitializer() {
  const { theme } = useThemeStore()
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeInitializer />

        <Routes>
          {/* Public */}
          <Route path="/connexion" element={<Login />} />

          {/* Protected — ProtectedRoute redirige vers /connexion si non authentifié */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Shell />}>
              <Route index element={<Navigate to="/dashboard" replace />} />

              <Route path="dashboard" element={<Dashboard />} />
              <Route path="profil"    element={<ProfilPage />} />

              {/* ── Production ── */}
              <Route path="production">
                <Route index element={<Navigate to="ordres-de-fabrication" replace />} />
                <Route path="ordres-de-fabrication"          element={<OrdreFabricationList />} />
                <Route path="ordres-de-fabrication/:id"      element={<OFDetail />} />
                <Route path="catalogue"                      element={<ArticleList />} />
                <Route path="nomenclatures"                  element={<NomenclatureList />} />
                <Route path="lots"                           element={<LotList />} />
              </Route>

              {/* ── Logistique ── */}
              <Route path="logistique">
                <Route index element={<Navigate to="stock" replace />} />
                <Route path="fournisseurs"      element={<FournisseurList />} />
                <Route path="fournisseurs/:id"  element={<FournisseurDetail />} />
                <Route path="stock"           element={<StockList />} />
                <Route path="bons-commande"      element={<BonCommandeList />} />
                <Route path="bons-commande/:id"  element={<BonCommandeDetail />} />
                <Route path="receptions"         element={<ReceptionList />} />
                <Route path="receptions/:id"     element={<ReceptionDetail />} />
                <Route path="demandes-achat"       element={<DemandeAchatList />} />
                <Route path="demandes-achat/:id"  element={<DemandeAchatDetail />} />
                <Route path="mouvements"      element={<MouvementList />} />
                <Route path="inventaires"     element={<InventaireList />} />
                <Route path="inventaires/:id" element={<InventaireDetail />} />
                <Route path="factures"        element={<FactureList />} />
                <Route path="factures/:id"    element={<FactureDetail />} />
              </Route>

              {/* ── Commercial ── */}
              <Route path="commercial">
                <Route index element={<Navigate to="clients" replace />} />
                <Route path="clients"              element={<ClientList />} />
                <Route path="clients/:id"          element={<ClientDetail />} />
                <Route path="devis"                element={<DevisList />} />
                <Route path="devis/:id"            element={<DevisDetail />} />
                <Route path="commandes"            element={<CommandeClientList />} />
                <Route path="commandes/:id"        element={<CommandeClientDetail />} />
                <Route path="bons-livraison"       element={<BonLivraisonList />} />
                <Route path="bons-livraison/:id"   element={<BonLivraisonDetail />} />
                <Route path="factures"             element={<FactureVenteList />} />
                <Route path="factures/:id"         element={<FactureVenteDetail />} />
                <Route path="retours"              element={<RetourClientList />} />
              </Route>

              {/* ── RH ── */}
              <Route path="rh">
                <Route index element={<Navigate to="employes" replace />} />
                <Route path="employes"      element={<Employes />} />
                <Route path="employes/:id"  element={<EmployeDetail />} />
                <Route path="paie"          element={<PayrollRunPage />} />
                <Route path="paie/:type"    element={<BulkSimpleRunPage />} />
                <Route path="conges"        element={<CongesPage />} />
                <Route path="presences"     element={<PresencesPage />} />
              </Route>

              {/* ── Caisses ── */}
              <Route path="caisses">
                <Route index                element={<CaisseDashboard />} />
                <Route path="en-attente"    element={<MouvementsEnAttente />} />
                <Route path="transferts"    element={<TransfertsPage />} />
                <Route path="parametres"    element={<ParametresCaissePage />} />
                <Route path=":id"           element={<CaisseDetail />} />
              </Route>

              {/* ── Comptabilité ── */}
              <Route path="comptabilite">
                <Route index element={<ComptabilitePage />} />
              </Route>

              {/* ── Administration ── */}
              <Route path="administration">
                <Route index element={<Navigate to="types-articles" replace />} />
                <Route path="types-articles"         element={<TypeArticleList />} />
                <Route path="unites-mesure"          element={<UniteMesureList />} />
                <Route path="rh"                     element={<RhAdminPage />} />
                <Route path="conditions-tarifaires"  element={<ConditionTarifaireList />} />
                <Route path="utilisateurs"    element={<UtilisateursPage />} />
                <Route path="parametres"      element={<ParametresPage />} />
                <Route path="categories"      element={<CategoriesPage />} />
              </Route>

              {/* 404 fallback */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>
        </Routes>

        {/* Toast notifications */}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontFamily: "'Outfit', sans-serif",
              fontSize: '13px',
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
