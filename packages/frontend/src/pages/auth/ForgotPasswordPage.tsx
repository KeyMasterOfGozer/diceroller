import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { resetPassword } from 'aws-amplify/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await resetPassword({ username: email });
      navigate('/auth/reset-password', { state: { email } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">Reset password</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your email and we'll send you a reset code.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email" type="email" autoComplete="email" required
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <Button type="submit" disabled={isLoading || !email} className="w-full">
        {isLoading ? 'Sending…' : 'Send reset code'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link to="/auth/sign-in" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
