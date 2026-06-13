import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Dices, ArrowRight, Check } from 'lucide-react';
import { roll, type RollResult } from '@dnd-dice-roller/dice-engine';
import { useAuthStore } from '@/store/auth';
import { sharingApi, charactersApi, type Macro, type Character } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { RollResultDisplay } from '@/components/RollResultDisplay';

const CATEGORY_COLORS: Record<string, string> = {
  Attack:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Damage:  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Spell:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Skill:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Save:    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Utility: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  Other:   'bg-gray-100 text-gray-700',
};

export default function SharedMacroPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isInitialized, initialize } = useAuthStore();

  const [macro, setMacro] = useState<Macro | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [rollResult, setRollResult] = useState<RollResult | null>(null);

  // Import flow
  const [characters, setCharacters] = useState<Character[]>([]);
  const [charsLoading, setCharsLoading] = useState(false);
  const [selectedCharId, setSelectedCharId] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importedCharId, setImportedCharId] = useState<string | null>(null);

  // Initialize auth on this public page so we know if user is logged in
  useEffect(() => {
    if (!isInitialized) initialize();
  }, [isInitialized, initialize]);

  // Load the shared macro
  useEffect(() => {
    if (!token) return;
    sharingApi.getShared(token)
      .then(m => setMacro(m as Macro))
      .catch(() => setError('This macro link is invalid or has been revoked.'))
      .finally(() => setIsLoading(false));
  }, [token]);

  // Load characters once we know the user is logged in
  useEffect(() => {
    if (!user) return;
    setCharsLoading(true);
    charactersApi.list()
      .then(list => {
        const active = list.filter(c => !c.archived);
        setCharacters(active);
        if (active.length > 0) setSelectedCharId(active[0].characterId);
      })
      .catch(() => {})
      .finally(() => setCharsLoading(false));
  }, [user]);

  function handleRoll() {
    if (!macro) return;
    setRollResult(roll(macro.notation));
  }

  async function handleImport() {
    if (!selectedCharId || !token) return;
    setIsImporting(true);
    try {
      await sharingApi.importShared(selectedCharId, token);
      setImportedCharId(selectedCharId);
    } catch (err) {
      // Show error inline — no toast available on this page
      console.error('Import failed:', err);
    } finally {
      setIsImporting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 p-4">
      {/* Branding */}
      <div className="mb-6 flex items-center gap-2">
        <Dices className="h-6 w-6 text-primary" />
        <span className="font-bold">D&amp;D Dice Roller</span>
      </div>

      {error ? (
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button className="mt-4" onClick={() => navigate('/')}>Go to app</Button>
          </CardContent>
        </Card>
      ) : macro ? (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg">{macro.name}</CardTitle>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[macro.category] ?? CATEGORY_COLORS.Other}`}>
                {macro.category}
              </span>
            </div>
            {macro.description && <CardDescription>{macro.description}</CardDescription>}
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {/* Notation */}
            <p className="rounded bg-muted px-3 py-2 font-mono text-sm break-all">{macro.notation}</p>

            {/* Roll result */}
            {rollResult && <RollResultDisplay result={rollResult} />}

            {/* Roll button */}
            <Button onClick={handleRoll} className="w-full">
              <Dices className="mr-2 h-4 w-4" />
              {rollResult ? 'Roll again' : 'Roll'}
            </Button>

            <Separator />

            {/* Import section */}
            {!isInitialized ? null : !user ? (
              <div className="flex flex-col gap-2 text-center">
                <p className="text-sm text-muted-foreground">Sign in to import this macro to your characters.</p>
                <Button variant="outline" className="w-full" onClick={() => navigate('/auth/sign-in')}>
                  Sign in
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : importedCharId ? (
              /* Success state */
              <div className="flex flex-col gap-2 text-center">
                <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                  <Check className="h-4 w-4" />
                  Macro imported!
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate(`/characters/${importedCharId}/macros`)}
                >
                  View macros
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : (
              /* Import form */
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Import to character</p>
                {charsLoading ? (
                  <p className="text-xs text-muted-foreground">Loading characters…</p>
                ) : characters.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No characters yet.{' '}
                    <button
                      className="underline underline-offset-2"
                      onClick={() => navigate('/characters')}
                    >
                      Create one first.
                    </button>
                  </p>
                ) : (
                  <>
                    <select
                      value={selectedCharId}
                      onChange={e => setSelectedCharId(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {characters.map(c => (
                        <option key={c.characterId} value={c.characterId}>
                          {c.name}{c.class ? ` — ${c.class}` : ''}{c.level ? ` (Lv ${c.level})` : ''}
                        </option>
                      ))}
                    </select>
                    <Button onClick={handleImport} disabled={isImporting || !selectedCharId} className="w-full">
                      {isImporting ? 'Importing…' : 'Import macro'}
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
