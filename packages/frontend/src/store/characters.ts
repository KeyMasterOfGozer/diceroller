import { create } from 'zustand';
import { charactersApi, type Character } from '@/lib/api';

interface CharactersState {
  characters: Character[];
  activeCharacterId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchCharacters: () => Promise<void>;
  createCharacter: (data: { name: string; class?: string; level?: number; notes?: string }) => Promise<Character>;
  updateCharacter: (id: string, data: Partial<Character>) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  setActiveCharacter: (id: string | null) => void;
  getActiveCharacter: () => Character | undefined;
}

export const useCharactersStore = create<CharactersState>((set, get) => ({
  characters: [],
  activeCharacterId: null,
  isLoading: false,
  error: null,

  fetchCharacters: async () => {
    set({ isLoading: true, error: null });
    try {
      const characters = await charactersApi.list();
      set({ characters, isLoading: false });
      // Auto-select first character if none selected
      if (!get().activeCharacterId && characters.length > 0) {
        set({ activeCharacterId: characters[0].characterId });
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createCharacter: async (data) => {
    const character = await charactersApi.create(data);
    set(state => ({ characters: [...state.characters, character] }));
    // Auto-select the new character
    set({ activeCharacterId: character.characterId });
    return character;
  },

  updateCharacter: async (id, data) => {
    await charactersApi.update(id, data);
    set(state => ({
      characters: state.characters.map(c =>
        c.characterId === id ? { ...c, ...data } : c
      ),
    }));
  },

  deleteCharacter: async (id) => {
    await charactersApi.delete(id);
    set(state => {
      const characters = state.characters.filter(c => c.characterId !== id);
      const activeCharacterId =
        state.activeCharacterId === id
          ? (characters[0]?.characterId ?? null)
          : state.activeCharacterId;
      return { characters, activeCharacterId };
    });
  },

  setActiveCharacter: (id) => set({ activeCharacterId: id }),

  getActiveCharacter: () => {
    const { characters, activeCharacterId } = get();
    return characters.find(c => c.characterId === activeCharacterId);
  },
}));
