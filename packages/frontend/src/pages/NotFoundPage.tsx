import { useNavigate } from 'react-router-dom';
import { Dices } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <Dices className="h-12 w-12 text-muted-foreground opacity-40" />
      <div>
        <h1 className="text-2xl font-bold">Natural 1</h1>
        <p className="mt-1 text-muted-foreground">You rolled a critical miss. This page doesn't exist.</p>
      </div>
      <Button onClick={() => navigate('/')}>Back to safety</Button>
    </div>
  );
}
