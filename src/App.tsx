import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ThemeProvider } from './theme/ThemeProvider';
import { I18nProvider } from './i18n/I18nProvider';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { FeedPage } from './features/feed/FeedPage';
import { VideoViewPage } from './features/feed/VideoViewPage';
import { ExplorePage } from './features/explore/ExplorePage';
import { TrainingPage } from './pages/TrainingPage';
import { DietPage } from './pages/DietPage';
import { MeuFitPage } from './features/meufit/MeuFitPage';
import { CommunitiesPage } from './pages/CommunitiesPage';
import { ChallengesPage } from './pages/ChallengesPage';
import { ProductsPage } from './features/market/ProductsPage';
import { MyProductsPage } from './features/market/MyProductsPage';
import { StudioPage } from './features/studio/StudioPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { EditProfilePage } from './features/profile/EditProfilePage';
import { VisualPreferencesPage } from './features/profile/VisualPreferencesPage';
import { InboxPage } from './features/messages/InboxPage';
import { ChatPage } from './features/messages/ChatPage';
import { MyBusinessesPage } from './features/profile/MyBusinessesPage';
import { CreateBusinessPage } from './features/profile/CreateBusinessPage';
import { BusinessWorkspacePage } from './features/profile/BusinessWorkspacePage';
import { PrivacyTermsPage } from './features/legal/PrivacyTermsPage';
import { CreatorProfilePage } from './features/creators/CreatorProfilePage';
import { HealthProfilePage } from './features/health/HealthProfilePage';
import { HealthQuestionnairePage } from './features/health/HealthQuestionnairePage';
import { NewHealthRecordPage } from './features/health/NewHealthRecordPage';
import { HealthEventDetailPage } from './features/health/HealthEventDetailPage';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AuthConfirmPage } from './pages/AuthConfirmPage';

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
          <Route path="/explorar" element={<ExplorePage />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/meu-fit" element={<MeuFitPage />} />
          <Route path="/meu-fit/treino" element={<TrainingPage />} />
          <Route path="/meu-fit/dieta" element={<DietPage />} />
          <Route path="/treino" element={<Navigate to="/meu-fit" replace />} />
          <Route path="/produtos" element={<ProductsPage />} />
          <Route path="/meus-produtos" element={<MyProductsPage />} />
          {/* /mercado era o nome antigo da vitrine, virou /produtos (bottom nav) */}
          <Route path="/mercado" element={<Navigate to="/produtos" replace />} />
          <Route path="/market" element={<Navigate to="/produtos" replace />} />
          <Route path="/comunidades" element={<CommunitiesPage />} />
          <Route path="/desafios" element={<ChallengesPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/perfil/editar" element={<EditProfilePage />} />
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
          <Route path="/creator/:username" element={<CreatorProfilePage />} />
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<LoginPage />} />
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <BrowserRouter>
              <AuthenticatedApp />
            </BrowserRouter>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
