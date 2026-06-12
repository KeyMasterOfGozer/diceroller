import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Dices, ArrowRight } from 'lucide-react';
import { roll } from '@dnd-dice-roller/dice-engine';
import { sharingApi, type Macro } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function SharedMacroPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [macro, setMacro] = useState<Macro | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [rollResult, setRollResult] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    sharingApi.getShared(token)
      .then(m => setMacro(m as Macro))
      .catch(() => setError('This macro link is invalid or has been revoked.'))
      .finally(() => setIsLoading(false));
  }, [token]);

  function handleRoll() {
    if (!macro) return;
    const result = roll(macro.notation);
    setRollResult(result.total);
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
            <div className="flex items-center justify-between">
              <CardTitle>{macro.name}</CardTitle>
              <Badge variant="secondary">{macro.category}</Badge>
            </div>
            {macro.description && <CardDescription>{macro.description}</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="rounded bg-muted px-3 py-2 font-mono text-sm">{macro.notation}</p>

            {rollResult !== null && (
              <div className="flex flex-col items-center gap-1 py-2">
                <span className="text-5xl font-black tabular-nums text-primary">{rollResult}</span>
                <span className="text-xs text-muted-foreground">total</span>
              </div>
            )}

            <Button onClick={handleRoll} className="w-full">
              <Dices className="mr-2 h-4 w-4" />
              {rollResult === null ? 'Roll' : 'Roll again'}
            </Button>

            <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
              Try the app
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
