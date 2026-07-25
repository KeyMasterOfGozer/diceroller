import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, ScrollText, RefreshCw, Search, ChevronRight, Trash2, Lock, Unlock, KeyRound } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { adminApi, type AdminUser, type AdminLogEvent } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'users' | 'logs';

interface ConfirmAction {
  label: string;
  description: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown>;
}

// ── Confirm dialog (inline — no external component needed) ────────────────────

function ConfirmDialog({ action, onClose }: { action: ConfirmAction; onClose: () => void }) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await action.onConfirm();
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Dialog */}
      <div className="relative z-10 mx-4 w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold">{action.label}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{action.description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={action.destructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(user: AdminUser) {
  if (!user.enabled) {
    return <Badge variant="secondary" className="text-xs">Disabled</Badge>;
  }
  switch (user.status) {
    case 'CONFIRMED':
      return <Badge variant="outline" className="border-green-500 text-xs text-green-700 dark:text-green-400">Active</Badge>;
    case 'UNCONFIRMED':
      return <Badge variant="outline" className="border-yellow-500 text-xs text-yellow-700 dark:text-yellow-400">Unverified</Badge>;
    case 'RESET_REQUIRED':
      return <Badge variant="outline" className="border-orange-500 text-xs text-orange-700 dark:text-orange-400">Reset required</Badge>;
    case 'FORCE_CHANGE_PASSWORD':
      return <Badge variant="outline" className="border-blue-500 text-xs text-blue-700 dark:text-blue-400">Temp password</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">{user.status}</Badge>;
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers]             = useState<AdminUser[]>([]);
  const [nextToken, setNextToken]     = useState<string | null>(null);
  const [search, setSearch]           = useState('');
  const [liveSearch, setLiveSearch]   = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [actionError, setActionError] = useState('');
  const [confirm, setConfirm]         = useState<ConfirmAction | null>(null);
  const [busy, setBusy]               = useState<string | null>(null);

  const load = useCallback(async (searchVal: string, pageToken?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.listUsers(searchVal || undefined, pageToken);
      setUsers(prev => pageToken ? [...prev, ...res.users] : res.users);
      setNextToken(res.nextToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setUsers([]);
    setNextToken(null);
    setSearch(liveSearch);
    load(liveSearch);
  }

  async function runAction(username: string, fn: () => Promise<unknown>) {
    setBusy(username);
    setActionError('');
    try {
      await fn();
      setUsers([]);
      setNextToken(null);
      await load(search);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  function promptDisable(user: AdminUser) {
    setConfirm({
      label: `Disable ${user.email}`,
      description: `This will prevent ${user.email} from signing in. You can re-enable them at any time.`,
      onConfirm: () => runAction(user.username, () => adminApi.disableUser(user.username)),
    });
  }

  function promptEnable(user: AdminUser) {
    setConfirm({
      label: `Enable ${user.email}`,
      description: `This will restore ${user.email}'s ability to sign in.`,
      onConfirm: () => runAction(user.username, () => adminApi.enableUser(user.username)),
    });
  }

  function promptReset(user: AdminUser) {
    setConfirm({
      label: `Reset password for ${user.email}`,
      description: `This will send a password-reset email to ${user.email} and invalidate their current password.`,
      onConfirm: () => runAction(user.username, () => adminApi.resetPassword(user.username)),
    });
  }

  function promptDelete(user: AdminUser) {
    setConfirm({
      label: `Delete ${user.email}`,
      description: `This will permanently delete the Cognito account for ${user.email}. Their characters and macros in the database are unaffected.`,
      destructive: true,
      onConfirm: () => runAction(user.username, () => adminApi.deleteUser(user.username)),
    });
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by email prefix…"
            value={liveSearch}
            onChange={e => setLiveSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={loading}>
          Search
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={loading}
          onClick={() => { setLiveSearch(''); setSearch(''); setUsers([]); load(''); }}
          title="Clear filter"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </form>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {actionError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{actionError}</p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Created</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  {search ? 'No users match that email.' : 'No users found.'}
                </td>
              </tr>
            )}
            {users.map(u => (
              <tr key={u.username} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <p className="font-medium">{u.email || '(no email)'}</p>
                  <p className="text-xs text-muted-foreground font-mono">{u.username}</p>
                </td>
                <td className="px-4 py-3">{statusBadge(u)}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(u.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {u.enabled ? (
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="Disable account" disabled={busy === u.username}
                        onClick={() => promptDisable(u)}
                      >
                        <Lock className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="Enable account" disabled={busy === u.username}
                        onClick={() => promptEnable(u)}
                      >
                        <Unlock className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title="Send password reset email" disabled={busy === u.username}
                      onClick={() => promptReset(u)}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Delete account" disabled={busy === u.username}
                      onClick={() => promptDelete(u)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextToken && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => load(search, nextToken)}>
            <ChevronRight className="mr-1 h-4 w-4" />
            Load more
          </Button>
        </div>
      )}

      {confirm && <ConfirmDialog action={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────

const HOURS_OPTIONS = [
  { label: '1 hour',  value: 1   },
  { label: '6 hours', value: 6   },
  { label: '24 hours',value: 24  },
  { label: '3 days',  value: 72  },
  { label: '7 days',  value: 168 },
];

function LogsTab() {
  const [logGroups, setLogGroups]   = useState<string[]>([]);
  const [selectedFn, setSelectedFn] = useState('');
  const [filter, setFilter]         = useState('ERROR');
  const [hours, setHours]           = useState(24);
  const [events, setEvents]         = useState<AdminLogEvent[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [searched, setSearched]     = useState(false);

  useEffect(() => {
    adminApi.listLogGroups()
      .then(res => setLogGroups(res.logGroups))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load log groups'));
  }, []);

  async function fetchLogs() {
    if (!selectedFn) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const res = await adminApi.getLogs(selectedFn, filter, hours);
      setEvents(res.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load logs');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  function levelColor(msg: string) {
    if (/\bERROR\b/.test(msg)) return 'text-red-600 dark:text-red-400';
    if (/\bWARN\b/.test(msg))  return 'text-yellow-600 dark:text-yellow-400';
    return 'text-muted-foreground';
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Lambda function</label>
          <select
            value={selectedFn}
            onChange={e => setSelectedFn(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select a function…</option>
            {logGroups.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Filter pattern</label>
          <Input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="e.g. ERROR, ?WARN"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Time range</label>
          <select
            value={hours}
            onChange={e => setHours(parseInt(e.target.value, 10))}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {HOURS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <Button onClick={fetchLogs} disabled={!selectedFn || loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Fetch logs
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {searched && !loading && events.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-md border py-12 text-center text-muted-foreground">
          <ScrollText className="h-8 w-8 opacity-30" />
          <p>No log events match the filter in that time window.</p>
          <p className="text-xs">Try a broader filter or longer time range.</p>
        </div>
      )}

      {events.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <div className="border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
            {events.length} event{events.length !== 1 ? 's' : ''} — {selectedFn}, last {hours}h
            {filter && `, filter: ${filter}`}
          </div>
          <div className="max-h-[60vh] divide-y overflow-y-auto font-mono text-xs">
            {events.map((e, i) => (
              <div key={i} className="flex gap-3 px-4 py-2 hover:bg-muted/30">
                <span className="shrink-0 text-muted-foreground">{fmtTime(e.timestamp)}</span>
                <span className={`whitespace-pre-wrap break-all ${levelColor(e.message)}`}>
                  {e.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AdminPage ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user }      = useAuthStore();
  const navigate      = useNavigate();
  const [tab, setTab] = useState<Tab>('users');

  useEffect(() => {
    if (user && !user.isAdmin) navigate('/characters', { replace: true });
  }, [user, navigate]);

  if (!user?.isAdmin) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'users', label: 'Users',      icon: <Users      className="h-4 w-4" /> },
    { id: 'logs',  label: 'Error Logs', icon: <ScrollText className="h-4 w-4" /> },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">User management and error logs</p>
        </div>
      </div>

      <div className="border-b">
        <nav className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'logs'  && <LogsTab />}
    </div>
  );
}
