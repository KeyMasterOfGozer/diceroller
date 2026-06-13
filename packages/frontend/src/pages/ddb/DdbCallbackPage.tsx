import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, User, ChevronRight, AlertCircle, ArrowLeft } from 'lucide-react';
import { dndBeyondApi, type DdbCharacter } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const PENDING_KEY = 'ddb_pending_import';
const PENDING_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface PendingImport {
  characterId: string;
  ts: number;
}

type Phase = 'loading' | 'picking' | 'importing' | 'done' | 'error';

export default function DdbCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const cobalt = params.get('cobalt') ?? '';

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [characters, setCharacters] = useState<DdbCharacter[]>([]);
  const [pending, setPending] = useState<PendingImport | null>(null);

  useEffect(() => {
    if (!cobalt) {
      setError('No cobalt token in URL. The bookmarklet may have failed — go back and try again.');
      setPhase('error');
      return;
    }

    // Read pending import state stored before navigating to DnD Beyond
    let pendingImport: PendingImport | null = null;
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PendingImport;
        if (Date.now() - parsed.ts < PENDING_TTL_MS) {
          pendingImport = parsed;
        }
        localStorage.removeItem(PENDING_KEY);
      }
    } catch {
      // ignore parse errors
    }
    setPending(pendingImport);

    // Fetch the user's DnD Beyond characters
    dndBeyondApi.listCharacters(cobalt).then(chars => {
      setCharacters(chars);
      setPhase('picking');
    }).catch(err => {
      setError((err as Error).message || 'Could not load D&D Beyond characters. Your session may have expired.');
      setPhase('error');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleImport(ddbChar: DdbCharacter, targetCharacterId: string) {
    setPhase('importing');
    try {
      const result = await dndBeyondApi.importCharacter(cobalt, ddbChar.id, targetCharacterId);
      toast({
        title: `Imported ${result.imported} variables from ${ddbChar.name}`,
        description: 'Stat variables have been updated.',
      });
      setPhase('done');
      // Navigate back to the character page after a short delay
      setTimeout(() => navigate(`/characters/${targetCharacterId}`), 1500);
    } catch (err) {
      setError((err as Error).message ?? 'Import failed.');
      setPhase('picking');
    }
  }

  function classString(char: DdbCharacter): string {
    return char.classes.map(c => `${c.name} ${c.level}`).join(' / ');
  }

  // If we have a pending characterId, skip the target-character step and go straight to the DnD character picker.
  // The user already chose which local character to import into before clicking the bookmarklet.

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

          {/* Loading */}
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
                <p className="text-sm text-muted-foreground">No characters found on this D&D Beyond account.</p>
              ) : (
                <ul className="space-y-1.5">
                  {characters.map(char => (
                    <li key={char.id}>
                      <button
                        type="button"
                        disabled={phase === 'importing'}
                        onClick={() => {
                          if (pending?.characterId) {
                            handleImport(char, pending.characterId);
                          }
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
                  No target character was found. Go back to your character page and start the import from there.
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
