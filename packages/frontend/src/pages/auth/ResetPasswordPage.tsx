import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { confirmResetPassword } from 'aws-amplify/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // Email is passed via navigation state from ForgotPasswordPage.
  // If someone lands here directly they can still type their email.
  const [email, setEmail] = useState((location.state as { email?: string })?.email ?? '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsLoading(true);
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });
      navigate('/auth/sign-in', { state: { notice: 'Password reset — you can now sign in.' } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">Set new password</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the code sent to your email and choose a new password.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* Show email field only if it wasn't pre-filled from state */}
      {!((location.state as { email?: string })?.email) && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email" type="email" autoComplete="email" required
            value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Reset code</Label>
        <Input
          id="code" type="text" inputMode="numeric" autoComplete="one-time-code" required
          value={code} onChange={e => setCode(e.target.value)}
          placeholder="123456"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password" type="password" autoComplete="new-password" required
          value={newPassword} onChange={e => setNewPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password" type="password" autoComplete="new-password" required
          value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      <Button
        type="submit"
        disabled={isLoading || !email || !code || !newPassword || !confirmPassword}
        className="w-full"
      >
        {isLoading ? 'Resetting…' : 'Reset password'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Didn't get a code?{' '}
        <Link to="/auth/forgot-password" className="font-medium text-primary hover:underline">
          Try again
        </Link>
      </p>
    </form>
  );
}
