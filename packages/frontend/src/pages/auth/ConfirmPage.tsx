import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ConfirmPage() {
  const location = useLocation();
  const email = (location.state as { email?: string })?.email ?? '';
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);
  const { confirmRegistration, resendCode, isLoading } = useAuthStore();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await confirmRegistration(email, code);
      navigate('/auth/sign-in', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleResend() {
    setError('');
    setResent(false);
    try {
      await resendCode(email);
      setResent(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">Check your email</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a 6-digit code to <strong>{email || 'your email'}</strong>
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {resent && (
        <p className="rounded-md bg-secondary px-3 py-2 text-sm">New code sent.</p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Verification code</Label>
        <Input
          id="code" inputMode="numeric" maxLength={6} required
          value={code} onChange={e => setCode(e.target.value)}
          placeholder="123456"
        />
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? 'Verifying…' : 'Verify'}
      </Button>

      <button
        type="button"
        onClick={handleResend}
        className="text-center text-sm text-muted-foreground hover:text-foreground"
      >
        Didn't receive a code? <span className="font-medium text-primary">Resend</span>
      </button>
    </form>
  );
}
