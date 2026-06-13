import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/store/auth';
import AppLayout from '@/layouts/AppLayout';
import AuthLayout from '@/layouts/AuthLayout';
import SignInPage from '@/pages/auth/SignInPage';
import SignUpPage from '@/pages/auth/SignUpPage';
import ConfirmPage from '@/pages/auth/ConfirmPage';
import CharactersPage from '@/pages/characters/CharactersPage';
import CharacterPage from '@/pages/characters/CharacterPage';
import MacrosPage from '@/pages/macros/MacrosPage';
import SharedMacroPage from '@/pages/shared/SharedMacroPage';
import ProfilePage from '@/pages/profile/ProfilePage';
import DdbCallbackPage from '@/pages/ddb/DdbCallbackPage';
import NotFoundPage from '@/pages/NotFoundPage';

// ── Auth guard ────────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isInitialized, initialize } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!isInitialized) initialize();
  }, [isInitialized, initialize]);

  if (!isInitialized) {
    // Show a minimal loading state while Amplify checks session
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/sign-in" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  // Protected app routes
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/characters" replace /> },
      { path: 'characters', element: <CharactersPage /> },
      { path: 'characters/:id', element: <CharacterPage /> },
      { path: 'characters/:id/macros', element: <MacrosPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'ddb-callback', element: <DdbCallbackPage /> },
    ],
  },
  // Auth routes (no auth required)
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { index: true, element: <Navigate to="/auth/sign-in" replace /> },
      { path: 'sign-in', element: <SignInPage /> },
      { path: 'sign-up', element: <SignUpPage /> },
      { path: 'confirm', element: <ConfirmPage /> },
    ],
  },
  // Public shared macro route
  {
    path: '/shared/:token',
    element: <SharedMacroPage />,
  },
  // 404
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
