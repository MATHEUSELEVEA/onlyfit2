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
import { CommunitiesPage } from './pages/CommunitiesPage';
import { ChallengesPage } from './pages/ChallengesPage';
import { MarketPage } from './features/market/MarketPage';
import { MyProductsPage } from './features/market/MyProductsPage';
import { StudioPage } from './features/studio/StudioPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { EditProfilePage } from './features/profile/EditProfilePage';
import { MyBusinessesPage } from './features/profile/MyBusinessesPage';
import { CreatorProfilePage } from './features/creators/CreatorProfilePage';
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
          <Route path="/treino" element={<TrainingPage />} />
          <Route path="/produtos" element={<MyProductsPage />} />
          <Route path="/mercado" element={<MarketPage />} />
          <Route path="/market" element={<Navigate to="/mercado" replace />} />
          <Route path="/comunidades" element={<CommunitiesPage />} />
          <Route path="/desafios" element={<ChallengesPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/perfil/editar" element={<EditProfilePage />} />
          <Route path="/negocios" element={<MyBusinessesPage />} />
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
