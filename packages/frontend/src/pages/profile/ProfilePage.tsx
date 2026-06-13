import { useEffect, useState } from 'react';
import { updatePassword } from 'aws-amplify/auth';
import { useAuthStore } from '@/store/auth';
import { getPrefs, savePrefs, clearAllHistory, getTotalHistoryCount } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function ProfilePage() {
  const { user } = useAuthStore();
  const { toast } = useToast();

  // ── Change password ───────────────────────────────────────────────────────────

  const [oldPassword, setOldPassword]         = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving]               = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    setPwSaving(true);
    try {
      await updatePassword({ oldPassword, newPassword });
      toast({ title: 'Password updated' });
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      toast({ title: 'Password change failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setPwSaving(false);
    }
  }

  // ── Roll history ──────────────────────────────────────────────────────────────

  const [historyLimit, setHistoryLimit]     = useState(500);
  const [limitInput, setLimitInput]         = useState('500');
  const [totalEntries, setTotalEntries]     = useState(0);
  const [limitSaving, setLimitSaving]       = useState(false);
  const [clearing, setClearing]             = useState(false);

  useEffect(() => {
    getPrefs().then(p => {
      setHistoryLimit(p.historyLimitPerCharacter);
      setLimitInput(String(p.historyLimitPerCharacter));
    });
    getTotalHistoryCount().then(setTotalEntries);
  }, []);

  async function handleSaveLimit(e: React.FormEvent) {
    e.preventDefault();
    const val = parseInt(limitInput, 10);
    if (isNaN(val) || val < 10 || val > 10000) {
      toast({ title: 'Limit must be between 10 and 10,000', variant: 'destructive' });
      return;
    }
    setLimitSaving(true);
    try {
      await savePrefs({ historyLimitPerCharacter: val });
      setHistoryLimit(val);
      toast({ title: 'History limit saved' });
    } finally {
      setLimitSaving(false);
    }
  }

  async function handleClearAll() {
    if (!confirm(`Clear all ${totalEntries.toLocaleString()} roll history entries? This cannot be undone.`)) return;
    setClearing(true);
    try {
      await clearAllHistory();
      setTotalEntries(0);
      toast({ title: 'Roll history cleared' });
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
            <p className="text-sm font-medium">Change password</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="old-pw">Current password</Label>
              <Input
                id="old-pw"
                type="password"
                autoComplete="current-password"
                required
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-pw">New password</Label>
              <Input
                id="new-pw"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-pw">Confirm new password</Label>
              <Input
                id="confirm-pw"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={pwSaving || !oldPassword || !newPassword || !confirmPassword}>
                {pwSaving ? 'Saving…' : 'Update password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Roll history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roll history</CardTitle>
          <CardDescription>
            {totalEntries.toLocaleString()} entries stored locally
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Limit */}
          <form onSubmit={handleSaveLimit} className="flex flex-col gap-2">
            <Label htmlFor="history-limit">Entries kept per character</Label>
            <div className="flex gap-2">
              <Input
                id="history-limit"
                type="number"
                min={10}
                max={10000}
                className="w-32"
                value={limitInput}
                onChange={e => setLimitInput(e.target.value)}
              />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={limitSaving || limitInput === String(historyLimit)}
              >
                {limitSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Older entries are trimmed automatically when the limit is exceeded. Range: 10 – 10,000.
            </p>
          </form>

          {/* Clear */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Clear all history</p>
                <p className="text-xs text-muted-foreground">Removes roll history for all characters from this device.</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={clearing || totalEntries === 0}
                onClick={handleClearAll}
              >
                {clearing ? 'Clearing…' : 'Clear all'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
