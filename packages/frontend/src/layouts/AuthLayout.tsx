import { Outlet, Navigate } from 'react-router-dom';
import { Dices } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

export default function AuthLayout() {
  const { user, isInitialized } = useAuthStore();

  // Redirect already-signed-in users to app
  if (isInitialized && user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 p-4">
      {/* Brand mark */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
          <Dices className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">D&amp;D Dice Roller</h1>
        <p className="text-sm text-muted-foreground">Roll smarter, play better</p>
      </div>

      {/* Auth card */}
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-md">
        <Outlet />
      </div>
    </div>
  );
}
