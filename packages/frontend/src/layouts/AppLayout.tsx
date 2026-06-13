import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Dices, User, LogOut, Menu, X, Plus, Settings } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useCharactersStore } from '@/store/characters';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export default function AppLayout() {
  const { user, logout } = useAuthStore();
  const { characters, activeCharacterId, fetchCharacters, setActiveCharacter } = useCharactersStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? '??';

  function handleCharacterClick(id: string) {
    setActiveCharacter(id);
    navigate(`/characters/${id}/macros`);
    setSidebarOpen(false);
  }

  async function handleLogout() {
    await logout();
    navigate('/auth/sign-in');
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 pb-3 pt-1">
        <Dices className="h-6 w-6 text-primary" />
        <span className="font-bold tracking-tight">Dice Roller</span>
      </div>

      {/* Characters section */}
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Characters
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => { navigate('/characters'); setSidebarOpen(false); }}
          title="New character"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {characters.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">No characters yet</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {characters.map(char => (
            <li key={char.characterId}>
              <button
                onClick={() => handleCharacterClick(char.characterId)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                  activeCharacterId === char.characterId
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-foreground',
                )}
              >
                <span className="truncate">{char.name}</span>
                <span className="ml-1 shrink-0 text-xs text-muted-foreground">
                  Lv {char.level}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto border-t pt-2">
        <NavLink
          to="/characters"
          className={({ isActive }) =>
            cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
              isActive && 'bg-accent font-medium')
          }
          onClick={() => setSidebarOpen(false)}
        >
          <User className="h-4 w-4" />
          All Characters
        </NavLink>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r lg:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-56 border-r bg-background shadow-xl lg:hidden">
            <button
              className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </>
      )}

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1 text-sm text-muted-foreground lg:hidden">
              <Dices className="h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground">Dice Roller</span>
            </div>
          </div>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[140px] truncate text-sm sm:block">
                  {user?.email}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                {user?.email}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')}>
                <Settings className="mr-2 h-4 w-4" />
                Profile &amp; settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
