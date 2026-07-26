import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, User, ChevronRight, AlertCircle, ArrowLeft } from 'lucide-react';
import { dndBeyondApi, type DdbCharacter } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const PENDING_KEY = 'ddb_pending_import';
const PENDING_TTL_MS = 30 * 60 * 1000; // 30 minutes

// The bookmarklet runs on dndbeyond.com, so postMessage arrives from this origin.
const DDB_ORIGIN = 'https://www.dndbeyond.com';

interface PendingImport {
  characterId: string;
  ts: number;
}

// 'waiting' = listening for postMessage from the bookmarklet
// 'loading'  = token received, fetching character list
// 'picking'  = user selects which DDB character to import
// 'importing'= import in flight
// 'done'     = import complete
// 'error'    = unrecoverable error
type Phase = 'waiting' | 'loading' | 'picking' | 'importing' | 'done' | 'error';

export default function DdbCallbackPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [cobalt, setCobalt]       = useState('');
  const [phase, setPhase]         = useState<Phase>('waiting');
  const [error, setError]         = useState('');
  const [characters, setCharacters] = useState<DdbCharacter[]>([]);
  const [pending, setPending]     = useState<PendingImport | null>(null);

  // ── Set up postMessage listener + read pending import from localStorage ──────

  useEffect(() => {
    // Recover the local character we're importing into
    let pendingImport: PendingImport | null = null;
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PendingImport;
        if (Date.now() - parsed.ts < PENDING_TTL_MS) pendingImport = parsed;
        localStorage.removeItem(PENDING_KEY);
      }
    } catch { /* ignore parse errors */ }
    setPending(pendingImport);

    // Listen for the CobaltSession token from the bookmarklet.
    // The bookmarklet runs on dndbeyond.com, so we validate e.origin against
    // DDB_ORIGIN (not window.location.origin) — the message crosses origins.
    function onMessage(e: MessageEvent) {
      if (e.origin !== DDB_ORIGIN) return;
      const data = e.data as { type?: string; token?: string } | null;
      if (data?.type !== 'COBALT_TOKEN' || !data.token) return;
      setCobalt(data.token);
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // ── When the token arrives, load DDB characters ───────────────────────────────

  useEffect(() => {
    if (!cobalt) return;
    setPhase('loading');

    dndBeyondApi.listCharacters(cobalt)
      .then(chars => {
        setCharacters(chars);
        setPhase('picking');
      })
      .catch(err => {
        setError(
          (err as Error).message ||
          'Could not load D&D Beyond characters. Your session may have expired.',
        );
        setPhase('error');
      });
  }, [cobalt]);

  // ── Import the selected DDB character into the pending local character ────────

  async function handleImport(ddbChar: DdbCharacter, targetCharacterId: string) {
    setPhase('importing');
    try {
      const result = await dndBeyondApi.importCharacter(cobalt, ddbChar.id, targetCharacterId);
      toast({
        title: `Imported ${result.imported} variables from ${ddbChar.name}`,
        description: 'Stat variables have been updated.',
      });
      setPhase('done');
      setTimeout(() => navigate(`/characters/${targetCharacterId}`), 1500);
    } catch (err) {
      setError((err as Error).message ?? 'Import failed.');
      setPhase('picking');
    }
  }

  function classString(char: DdbCharacter): string {
    return char.classes.map(c => `${c.name} ${c.level}`).join(' / ');
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">D&D Beyond Import</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {phase === 'done' ? 'Import complete' : 'Choose a character to import'}
          </CardTitle>
          {pending && phase !== 'done' && (
            <CardDescription>
              Importing into your local character. Select the matching D&D Beyond character below.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Waiting for bookmarklet */}
          {phase === 'waiting' && (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for the bookmarklet…
              </div>
              <p className="text-xs text-muted-foreground">
                Click the <strong>DnD Import</strong> bookmark while you are on D&D Beyond.
                This page will update automatically once the token is received.
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate(-1)}>Go back</Button>
            </div>
          )}

          {/* Loading characters */}
          {phase === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your D&D Beyond characters…
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="space-y-4">
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
              <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
            </div>
          )}

          {/* Character picker */}
          {(phase === 'picking' || phase === 'importing') && (
            <div className="space-y-3">
              {characters.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No characters found on this D&D Beyond account.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {characters.map(char => (
                    <li key={char.id}>
                      <button
                        type="button"
                        disabled={phase === 'importing' || !pending?.characterId}
                        onClick={() => {
                          if (pending?.characterId) handleImport(char, pending.characterId);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                      >
                        {char.avatarUrl ? (
                          <img
                            src={char.avatarUrl}
                            alt={char.name}
                            className="h-10 w-10 shrink-0 rounded-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                            <User className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{char.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[char.race, classString(char)].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!pending?.characterId && (
                <p className="text-xs text-muted-foreground">
                  No target character was found. Go back to your character page and start the
                  import from there.
                </p>
              )}

              {error && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}

              {phase === 'importing' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </div>
              )}
            </div>
          )}

          {/* Done */}
          {phase === 'done' && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-green-600 font-medium">
                ✓ Variables imported successfully. Returning to your character…
              </p>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
