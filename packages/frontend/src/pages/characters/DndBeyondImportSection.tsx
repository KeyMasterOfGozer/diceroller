import { useState } from 'react';
import { Loader2, User, ChevronRight, AlertCircle, Bookmark, ClipboardPaste } from 'lucide-react';
import { dndBeyondApi, type DdbCharacter } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Bookmarklet that reads CobaltSession from dndbeyond.com and redirects back.
// Must be a single expression — no newlines — so it survives the href attribute.
const BOOKMARKLET_HREF = `javascript:(function(){var m=document.cookie.match(/(?:^|;\\s*)CobaltSession=([^;]+)/);if(m){window.location.href='${window.location.origin}/ddb-callback?cobalt='+encodeURIComponent(m[1]);}else{alert('CobaltSession cookie not found.\\n\\nEither you are not logged in to D\\u0026D Beyond, or the cookie is marked HttpOnly (browser security).\\n\\nFall back to the manual paste method instead.');}})();`;

const DDB_URL = 'https://www.dndbeyond.com';

interface Props {
  characterId: string;
  onImported: (vars: Record<string, number>) => void;
}

type Tab = 'auto' | 'manual';
type Phase = 'idle' | 'loading-chars' | 'picking' | 'importing' | 'done';

export function DndBeyondImportSection({ characterId, onImported }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('auto');
  const [token, setToken] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [characters, setCharacters] = useState<DdbCharacter[]>([]);

  // ── Shared character load / import ────────────────────────────────────────

  async function handleLoadCharacters(cobaltToken: string) {
    setError('');
    setPhase('loading-chars');
    try {
      const chars = await dndBeyondApi.listCharacters(cobaltToken);
      setCharacters(chars);
      setPhase('picking');
    } catch (err) {
      const msg = (err as Error).message ?? '';
      setError(msg || 'Could not load characters. Make sure the token is current and try again.');
      setPhase('idle');
    }
  }

  async function handleImport(ddbChar: DdbCharacter, cobaltToken: string) {
    setPhase('importing');
    try {
      const result = await dndBeyondApi.importCharacter(cobaltToken, ddbChar.id, characterId);
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
  }

  function classString(char: DdbCharacter): string {
    return char.classes.map(c => `${c.name} ${c.level}`).join(' / ');
  }

  // ── Bookmarklet: store characterId so the callback page can resume ────────

  function handleGoToDdBeyond() {
    localStorage.setItem(
      'ddb_pending_import',
      JSON.stringify({ characterId, ts: Date.now() }),
    );
    window.open(DDB_URL, '_blank', 'noopener');
  }

  // ── Shared character picker (used by both tabs) ────────────────────────────

  function CharacterPicker({ cobaltToken }: { cobaltToken: string }) {
    return (
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
                  onClick={() => handleImport(char, cobaltToken)}
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
          Start over
        </button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">D&D Beyond</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── Tab switcher ── */}
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm w-fit">
          {([['auto', Bookmark, 'Bookmarklet'], ['manual', ClipboardPaste, 'Paste token']] as const).map(
            ([t, Icon, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); handleReset(); }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors',
                  tab === t
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            )
          )}
        </div>

        {/* ══ AUTO TAB ══════════════════════════════════════════════════════ */}
        {tab === 'auto' && (
          <>
            {(phase === 'idle' || phase === 'loading-chars') && (
              <div className="space-y-4">
                <div className="rounded-md bg-muted px-4 py-3 text-sm space-y-3">
                  <p className="font-medium">One-click import via bookmarklet</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                    <li>
                      Drag this button to your bookmarks bar:&nbsp;
                      {/* Draggable bookmarklet link — styled as a chip */}
                      <a
                        href={BOOKMARKLET_HREF}
                        onClick={e => e.preventDefault()}
                        draggable
                        className="inline-flex cursor-grab items-center gap-1 rounded border bg-background px-2 py-0.5 font-mono text-xs text-foreground shadow-sm select-none active:cursor-grabbing hover:bg-accent"
                        title="Drag me to your bookmarks bar"
                      >
                        <Bookmark className="h-3 w-3" />
                        DnD Import
                      </a>
                    </li>
                    <li>Click the button below to open D&D Beyond and sign in if needed.</li>
                    <li>Click the <strong>DnD Import</strong> bookmark — it will send your token here automatically.</li>
                  </ol>
                  <p className="text-xs text-muted-foreground">
                    The bookmarklet only runs on D&D Beyond and sends your token directly to this app.
                    It is never stored on our servers.
                  </p>
                </div>

                {error && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {error}
                  </p>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoToDdBeyond}
                  disabled={phase === 'loading-chars'}
                >
                  Open D&D Beyond
                </Button>

                <p className="text-xs text-muted-foreground">
                  After clicking the bookmark, you'll be redirected back here to finish the import.
                  {' '}If the bookmarklet shows a "cookie not found" error, use the{' '}
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => setTab('manual')}
                  >
                    Paste token
                  </button>
                  {' '}method instead.
                </p>
              </div>
            )}

            {(phase === 'picking' || phase === 'importing') && (
              <CharacterPicker cobaltToken={token} />
            )}

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
          </>
        )}

        {/* ══ MANUAL TAB ════════════════════════════════════════════════════ */}
        {tab === 'manual' && (
          <>
            {(phase === 'idle' || phase === 'loading-chars') && (
              <div className="space-y-3">
                <div className="rounded-md bg-muted px-4 py-3 text-sm space-y-2">
                  <p className="font-medium">How to get your Cobalt session token:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Open <strong>dndbeyond.com</strong> and sign in.</li>
                    <li>
                      Open DevTools —{' '}
                      <span className="font-mono text-xs">F12</span> on Windows/Linux or{' '}
                      <span className="font-mono text-xs">Cmd+Option+I</span> on Mac.
                    </li>
                    <li>Go to <strong>Application</strong> (Chrome) or <strong>Storage</strong> (Firefox).</li>
                    <li>Expand <strong>Cookies</strong> → click <strong>https://www.dndbeyond.com</strong>.</li>
                    <li>Find <strong>CobaltSession</strong> and copy its value.</li>
                    <li>Paste it below.</li>
                  </ol>
                </div>

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
                  onClick={() => handleLoadCharacters(token.trim())}
                >
                  {phase === 'loading-chars' ? (
                    <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Loading…</>
                  ) : (
                    'Find my D&D Beyond characters'
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Your token is sent directly to D&D Beyond and never stored on our servers.
                  Tokens expire when you sign out of D&D Beyond.
                </p>
              </div>
            )}

            {(phase === 'picking' || phase === 'importing') && (
              <CharacterPicker cobaltToken={token} />
            )}

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
          </>
        )}

      </CardContent>
    </Card>
  );
}
