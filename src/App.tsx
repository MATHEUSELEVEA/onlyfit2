import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ThemeProvider } from './theme/ThemeProvider';
import { I18nProvider } from './i18n/I18nProvider';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { FeedPage } from './features/feed/FeedPage';
import { VideoViewPage } from './features/feed/VideoViewPage';
import { ExplorePage } from './features/explore/ExplorePage';
import { TrainingPage } from './pages/TrainingPage';
import { TrainingPlayerPage } from './pages/TrainingPlayerPage';
import { TrainingProvider } from './features/training/TrainingProvider';
import { DietPage } from './pages/DietPage';
import { MeuFitPage } from './features/meufit/MeuFitPage';
import { RoutinePage } from './features/meufit/RoutinePage';
import { CommunitiesPage } from './features/communities/CommunitiesPage';
import { CommunityPage } from './features/communities/CommunityPage';
import { CommunityFormPage } from './features/communities/CommunityFormPage';
import { TopicPage } from './features/communities/TopicPage';
import { ChallengesPage } from './features/challenges/ChallengesPage';
import { ChallengePage } from './features/challenges/ChallengePage';
import { ChallengeFormPage } from './features/challenges/ChallengeFormPage';
import { ProductDetailPage } from './features/market/ProductDetailPage';
import { ProductsPage } from './features/market/ProductsPage';
import { StudioPage } from './features/studio/StudioPage';
import { StoryViewerPage } from './features/stories/StoryViewerPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { SettingsMenuPage } from './features/profile/SettingsMenuPage';
import { EditProfilePage } from './features/profile/EditProfilePage';
import { VisualPreferencesPage } from './features/profile/VisualPreferencesPage';
import { InboxPage } from './features/messages/InboxPage';
import { ChatPage } from './features/messages/ChatPage';
import { MyBusinessesPage } from './features/profile/MyBusinessesPage';
import { CreateBusinessPage } from './features/profile/CreateBusinessPage';
import { BusinessWorkspacePage } from './features/profile/BusinessWorkspacePage';
import { OfferingManagementPage } from './features/profile/OfferingManagementPage';
import { PaymentsPage } from './features/payments/PaymentsPage';
import { FinancePage } from './features/finance/FinancePage';
import { PrivacyTermsPage } from './features/legal/PrivacyTermsPage';
import { CreatorProfilePage } from './features/creators/CreatorProfilePage';
import { HealthProfilePage } from './features/health/HealthProfilePage';
import { HealthQuestionnairePage } from './features/health/HealthQuestionnairePage';
import { NewHealthRecordPage } from './features/health/NewHealthRecordPage';
import { HealthEventDetailPage } from './features/health/HealthEventDetailPage';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AuthConfirmPage } from './pages/AuthConfirmPage';
import { registerCapacitorAppBridge } from './lib/capacitorAppBridge';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

function AuthenticatedApp() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary" aria-label="Carregando" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Rotas públicas de auth — abertas com ou sem sessão (links de e-mail). */}
      <Route path="/auth/confirm" element={<AuthConfirmPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {session ? (
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/feed" replace />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/video/:postId" element={<VideoViewPage />} />
          <Route path="/stories/:creatorId" element={<StoryViewerPage />} />
          <Route path="/explorar" element={<ExplorePage />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/meu-fit" element={<MeuFitPage />} />
          <Route path="/meu-fit/rotina" element={<RoutinePage />} />
          <Route path="/meu-fit/treino" element={<TrainingPage />} />
          <Route path="/meu-fit/treino/player" element={<TrainingPlayerPage />} />
          <Route path="/meu-fit/dieta" element={<DietPage />} />
          <Route path="/treino" element={<Navigate to="/meu-fit" replace />} />
          <Route path="/produtos" element={<ProductsPage />} />
          <Route path="/produtos/:productId" element={<ProductDetailPage />} />
          {/* Minhas compras virou aba do Mercado; a rota antiga cai direto nela */}
          <Route path="/meus-produtos" element={<Navigate to="/produtos?aba=compras" replace />} />
          {/* /mercado era o nome antigo da vitrine, virou /produtos (bottom nav) */}
          <Route path="/mercado" element={<Navigate to="/produtos" replace />} />
          <Route path="/market" element={<Navigate to="/produtos" replace />} />
          <Route path="/comunidades" element={<CommunitiesPage />} />
          <Route path="/comunidades/nova" element={<CommunityFormPage />} />
          <Route path="/comunidades/:communityId" element={<CommunityPage />} />
          <Route path="/comunidades/:communityId/editar" element={<CommunityFormPage />} />
          <Route path="/comunidades/:communityId/topicos/:topicId" element={<TopicPage />} />
          <Route path="/desafios" element={<ChallengesPage />} />
          <Route path="/desafios/novo" element={<ChallengeFormPage />} />
          <Route path="/desafios/:challengeId" element={<ChallengePage />} />
          <Route path="/desafios/:challengeId/editar" element={<ChallengeFormPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/perfil/menu" element={<SettingsMenuPage />} />
          <Route path="/perfil/editar" element={<EditProfilePage />} />
          <Route path="/perfil/pagamentos" element={<PaymentsPage />} />
          <Route path="/perfil/financeiro" element={<FinancePage />} />
          <Route path="/perfil/visual" element={<VisualPreferencesPage />} />
          <Route path="/perfil/saude" element={<HealthProfilePage />} />
          <Route path="/perfil/saude/anamnese/questionario" element={<HealthQuestionnairePage />} />
          <Route path="/perfil/saude/novo" element={<NewHealthRecordPage />} />
          <Route path="/perfil/saude/eventos/:eventId" element={<HealthEventDetailPage />} />
          <Route path="/perfil/privacidade-termos" element={<PrivacyTermsPage />} />
          <Route path="/mensagens" element={<InboxPage />} />
          <Route path="/mensagens/:peerId" element={<ChatPage />} />
          <Route path="/negocios" element={<MyBusinessesPage />} />
          <Route path="/negocios/novo" element={<CreateBusinessPage />} />
          <Route path="/negocios/:businessId" element={<BusinessWorkspacePage />} />
          <Route path="/negocios/:businessId/ofertas/:offeringId" element={<OfferingManagementPage />} />
          <Route path="/creator/:username" element={<CreatorProfilePage />} />
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<LoginPage />} />
      )}
    </Routes>
  );
}

function NativeAppBridge() {
  const navigate = useNavigate();

  useEffect(() => registerCapacitorAppBridge(navigate), [navigate]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <BrowserRouter>
              <NativeAppBridge />
              <TrainingProvider>
                <AuthenticatedApp />
              </TrainingProvider>
            </BrowserRouter>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
