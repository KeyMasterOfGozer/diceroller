import { fetchAuthSession } from 'aws-amplify/auth';

const API_URL = (import.meta.env.VITE_API_URL as string).replace(/\/$/, '');

// ── Auth header ───────────────────────────────────────────────────────────────

async function authHeader(): Promise<Record<string, string>> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

// ── Base request ──────────────────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  authenticated = true,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authenticated) Object.assign(headers, await authHeader());

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: string }).error
             ?? (err as { message?: string }).message
             ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Typed API surface ─────────────────────────────────────────────────────────

export interface Character {
  characterId: string;
  name: string;
  class: string;
  level: number;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Macro {
  macroId: string;
  characterId: string;
  name: string;
  notation: string;
  category: string;
  description: string;
  isShared: boolean;
  shareToken: string | null;
  sortOrder: number;
  type: 'standard' | 'combo';
  macroIds: string[];   // ordered list of constituent macroIds; only meaningful for type='combo'
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  displayName: string;
}

// Profile
export const profileApi = {
  get: () => request<UserProfile>('GET', '/me'),
  update: (data: Partial<UserProfile>) => request<UserProfile>('PUT', '/me', data),
};

// Characters
export const charactersApi = {
  list: () => request<Character[]>('GET', '/characters'),
  create: (data: Partial<Character>) => request<Character>('POST', '/characters', data),
  get: (id: string) => request<Character>('GET', `/characters/${id}`),
  update: (id: string, data: Partial<Character>) => request<Character>('PUT', `/characters/${id}`, data),
  delete: (id: string) => request<void>('DELETE', `/characters/${id}`),
  getVars: (id: string) => request<Record<string, number>>('GET', `/characters/${id}/vars`),
  putVars: (id: string, vars: Record<string, number>) =>
    request<Record<string, number>>('PUT', `/characters/${id}/vars`, vars),
};

// Macros
export const macrosApi = {
  list: (charId: string) => request<Macro[]>('GET', `/characters/${charId}/macros`),
  create: (charId: string, data: Partial<Macro>) =>
    request<Macro>('POST', `/characters/${charId}/macros`, data),
  get: (charId: string, macroId: string) =>
    request<Macro>('GET', `/characters/${charId}/macros/${macroId}`),
  update: (charId: string, macroId: string, data: Partial<Macro>) =>
    request<Macro>('PUT', `/characters/${charId}/macros/${macroId}`, data),
  delete: (charId: string, macroId: string) =>
    request<void>('DELETE', `/characters/${charId}/macros/${macroId}`),
  reorder: (charId: string, order: Array<{ macroId: string; sortOrder: number }>) =>
    request<void>('PUT', `/characters/${charId}/macros/order`, order),
};

// Sharing
export const sharingApi = {
  share: (charId: string, macroId: string) =>
    request<{ shareToken: string }>('POST', `/characters/${charId}/macros/${macroId}/share`),
  unshare: (charId: string, macroId: string) =>
    request<void>('DELETE', `/characters/${charId}/macros/${macroId}/share`),
  getShared: (token: string) =>
    request<Macro>('GET', `/shared/${token}`, undefined, false),
  // Note: macroId in the path is required for API Gateway routing but the backend
  // ignores it and generates its own UUID for the new macro.
  importShared: (charId: string, shareToken: string) =>
    request<Macro>('POST', `/characters/${charId}/macros/${crypto.randomUUID()}/import-share`, { shareToken }),
};

// D&D Beyond
export interface DdbCharacterClass {
  name: string;
  level: number;
}

export interface DdbCharacter {
  id: number;
  name: string;
  race: string;
  classes: DdbCharacterClass[];
  avatarUrl: string | null;
}

export interface DdbImportResult {
  imported: number;
  vars: Record<string, number>;
}

export const dndBeyondApi = {
  /** List characters using a Cobalt session token (from DnD Beyond cookies). */
  listCharacters: (cobaltToken: string) =>
    request<DdbCharacter[]>(`GET`, `/dndbeyond/characters?accessToken=${encodeURIComponent(cobaltToken)}`),
  /** Import a DnD Beyond character's stats into a local character. */
  importCharacter: (cobaltToken: string, dndCharacterId: number, targetCharacterId: string) =>
    request<DdbImportResult>(
      'POST', `/characters/${targetCharacterId}/import/dndbeyond/${dndCharacterId}`, { accessToken: cobaltToken }
    ),
};
