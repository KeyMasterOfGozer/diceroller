import { useState } from 'react';
import { Loader2, User, ChevronRight, AlertCircle } from 'lucide-react';
import { dndBeyondApi, type DdbCharacter } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface Props {
  characterId: string;
  onImported: (vars: Record<string, number>) => void;
}

type Phase = 'idle' | 'loading-chars' | 'picking' | 'importing' | 'done';

export function DndBeyondImportSection({ characterId, onImported }: Props) {
  const { toast } = useToast();
  const [token, setToken] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [characters, setCharacters] = useState<DdbCharacter[]>([]);

  async function handleLoadCharacters() {
    if (!token.trim()) return;
    setError('');
    setPhase('loading-chars');
    try {
      const chars = await dndBeyondApi.listCharacters(token.trim());
      setCharacters(chars);
      setPhase('picking');
    } catch (err) {
      setError((err as Error).message ?? 'Could not load characters. Check your token and try again.');
      setPhase('idle');
    }
  }

  async function handleImport(ddbChar: DdbCharacter) {
    setPhase('importing');
    try {
      const result = await dndBeyondApi.importCharacter(token.trim(), ddbChar.id, characterId);
      toast({
        title: `Imported ${result.imported} variables from ${ddbChar.name}`,
        description: 'Stat variables have been updated.',
      });
      onImported(result.vars);
      setPhase('done');
    } catch (err) {
      setError((err as Error).message ?? 'Import failed.');
      setPhase('picking');
    }
  }

  function handleReset() {
    setPhase('idle');
    setCharacters([]);
    setError('');
    // keep token in case they want to try again
  }

  function classString(char: DdbCharacter): string {
    return char.classes.map(c => `${c.name} ${c.level}`).join(' / ');
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">D&D Beyond</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── Instructions ── */}
        <div className="rounded-md bg-muted px-4 py-3 text-sm space-y-2">
          <p className="font-medium">How to get your Cobalt session token:</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Open <strong>dndbeyond.com</strong> and sign in.</li>
            <li>
              Open DevTools —{' '}
              <span className="font-mono text-xs">F12</span> on Windows/Linux or{' '}
              <span className="font-mono text-xs">Cmd+Option+I</span> on Mac.
            </li>
            <li>Go to the <strong>Application</strong> tab (Chrome) or <strong>Storage</strong> tab (Firefox).</li>
            <li>Expand <strong>Cookies</strong> → click <strong>https://www.dndbeyond.com</strong>.</li>
            <li>Find the cookie named <strong>CobaltSession</strong> and copy its value.</li>
            <li>Paste it below.</li>
          </ol>
          <p className="text-xs text-muted-foreground pt-1">
            Your token is sent directly to D&D Beyond and is never stored on our servers.
            Tokens expire when you sign out of D&D Beyond.
          </p>
        </div>

        {/* ── Token input (idle / error states) ── */}
        {(phase === 'idle' || phase === 'loading-chars') && (
          <div className="space-y-2">
            <textarea
              className="h-20 w-full resize-none rounded-md border bg-background px-3 py-2 font-mono text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Paste your CobaltSession token here…"
              value={token}
              onChange={e => setToken(e.target.value)}
              disabled={phase === 'loading-chars'}
              spellCheck={false}
            />
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={!token.trim() || phase === 'loading-chars'}
              onClick={handleLoadCharacters}
            >
              {phase === 'loading-chars' ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Loading…</>
              ) : (
                'Find my D&D Beyond characters'
              )}
            </Button>
          </div>
        )}

        {/* ── Character picker ── */}
        {(phase === 'picking' || phase === 'importing') && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Select a character to import:</p>
            {characters.length === 0 ? (
              <p className="text-sm text-muted-foreground">No characters found on this account.</p>
            ) : (
              <ul className="space-y-1.5">
                {characters.map(char => (
                  <li key={char.id}>
                    <button
                      type="button"
                      disabled={phase === 'importing'}
                      onClick={() => handleImport(char)}
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
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Use a different token
            </button>
          </div>
        )}

        {/* ── Importing spinner ── */}
        {phase === 'importing' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Importing…
          </div>
        )}

        {/* ── Done ── */}
        {phase === 'done' && (
          <div className="space-y-2">
            <p className="text-sm text-green-600 font-medium">
              ✓ Variables imported — saved to your character.
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Import again
            </button>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
