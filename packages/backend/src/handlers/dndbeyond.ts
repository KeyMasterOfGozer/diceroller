import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { docClient, TABLE_NAME, getUserId, GetCommand, PutCommand } from '../lib/db.js';
import { ok, badRequest, internalError, notImplemented } from '../lib/response.js';

// D&D Beyond API endpoints (reverse-engineered — verify via browser Network tab if these change)
const DDB_CHARACTER_SERVICE = 'https://character-service.dndbeyond.com/character/v5';
const DDB_COBALT_TOKEN_URL  = 'https://auth-service.dndbeyond.com/v1/cobalt-token';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const { routeKey } = event;
    switch (routeKey) {
      case 'GET /dndbeyond/characters':                                      return listDndCharacters(event);
      case 'POST /characters/{id}/import/dndbeyond/{ddbCharId}':            return importCharacter(event);
      default:                                                               return notImplemented();
    }
  } catch (err) {
    return internalError(err);
  }
};

/** GET /dndbeyond/characters
 *  Lists the authenticated user's D&D Beyond characters.
 *  Query param: accessToken (D&D Beyond OAuth token, passed from client)
 *
 *  Note: The D&D Beyond access token is passed as a query param because it's
 *  ephemeral and user-owned — we never persist it server-side.
 */
async function listDndCharacters(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const cobaltSession = event.queryStringParameters?.['accessToken'];
  if (!cobaltSession) return badRequest('accessToken query param is required');

  // Exchange the CobaltSession browser cookie for a short-lived JWT + userId
  let auth: CobaltAuth;
  try {
    auth = await cobaltSessionToJwt(cobaltSession);
  } catch (err) {
    return badRequest((err as Error).message);
  }

  const listUrl = `${DDB_CHARACTER_SERVICE}/characters/list${auth.userId ? `?userId=${auth.userId}` : ''}`;
  const response = await fetch(listUrl, {
    headers: {
      'Authorization': `Bearer ${auth.jwt}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`DDB list characters failed: HTTP ${response.status}`, body);
    return badRequest(`D&D Beyond returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }

  const data = await response.json() as Record<string, unknown>;

  // Response shape: { id, success, message, data: { characterSlotLimit, characters: [...] }, pagination }
  const inner = data['data'] as Record<string, unknown> | undefined;
  const rawList: unknown[] = Array.isArray(inner?.['characters'])
    ? inner!['characters'] as unknown[]
    : [];

  const characters = rawList.map((char: unknown) => {
    const c = char as Record<string, unknown>;
    return {
      id: c['id'],
      name: c['name'],
      race: (c['race'] as Record<string, unknown>)?.['fullName'],
      classes: ((c['classes'] as unknown[]) ?? []).map((cls: unknown) => {
        const cl = cls as Record<string, unknown>;
        const def = cl['definition'] as Record<string, unknown> | undefined;
        return { name: def?.['name'], level: cl['level'] };
      }),
      avatarUrl: c['avatarUrl'],
    };
  });

  return ok(characters);
}

/** POST /characters/{id}/import/dndbeyond/{ddbCharId}
 *  Imports a D&D Beyond character into the dice roller.
 *  Path: id = local character ID, ddbCharId = D&D Beyond character ID
 *  Body: { accessToken: string }
 *
 *  Extracts standard variable keys (stats, proficiency bonus, etc.) and overwrites
 *  the target character's vars. Custom variables are untouched.
 */
async function importCharacter(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const targetCharacterId = event.pathParameters?.['id'];
  const dndCharacterId    = event.pathParameters?.['ddbCharId'];
  const body = JSON.parse(event.body ?? '{}') as { accessToken?: string };

  if (!body.accessToken)    return badRequest('accessToken is required');
  if (!targetCharacterId)   return badRequest('id path param is required');
  if (!dndCharacterId)      return badRequest('ddbCharId path param is required');

  // Exchange CobaltSession for JWT, then fetch the full character
  let auth: CobaltAuth;
  try {
    auth = await cobaltSessionToJwt(body.accessToken);
  } catch (err) {
    return badRequest((err as Error).message);
  }

  const response = await fetch(`${DDB_CHARACTER_SERVICE}/character/${dndCharacterId}?includeCustomItems=true`, {
    headers: {
      'Authorization': `Bearer ${auth.jwt}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    console.error(`DDB fetch character failed: HTTP ${response.status}`, errBody);
    return badRequest(`D&D Beyond returned ${response.status}${errBody ? `: ${errBody.slice(0, 200)}` : ''}`);
  }

  const data = await response.json() as { data: Record<string, unknown> };
  const char = data.data;

  // Extract stat values
  const stats = extractStats(char);
  const profBonus = computeProficiencyBonus(char);
  const level = computeTotalLevel(char);

  // Standard variable keys we import — always numeric modifiers
  const importedVars: Record<string, number> = {
    str: statMod(stats.str),
    dex: statMod(stats.dex),
    con: statMod(stats.con),
    int: statMod(stats.int),
    wis: statMod(stats.wis),
    cha: statMod(stats.cha),
    str_score: stats.str,
    dex_score: stats.dex,
    con_score: stats.con,
    int_score: stats.int,
    wis_score: stats.wis,
    cha_score: stats.cha,
    prof: profBonus,
    level,
  };

  // Fetch existing custom vars to merge (only overwrite standard keys)
  const existingResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}`, sk: `VARS#${targetCharacterId}` },
  }));
  const existingVars = (existingResult.Item?.['vars'] ?? {}) as Record<string, number>;

  // Overwrite only the standard keys; preserve custom ones
  const mergedVars = { ...existingVars, ...importedVars };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      pk: `USER#${userId}`, sk: `VARS#${targetCharacterId}`,
      vars: mergedVars, updatedAt: new Date().toISOString(),
    },
  }));

  return ok({ imported: Object.keys(importedVars).length, vars: mergedVars });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface CobaltAuth { jwt: string; userId: string; }

/**
 * Exchange a CobaltSession browser cookie for a short-lived JWT.
 * Also decodes the JWT payload to extract userId (needed for the characters list endpoint).
 */
async function cobaltSessionToJwt(cobaltSession: string): Promise<CobaltAuth> {
  const res = await fetch(DDB_COBALT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Cookie': `CobaltSession=${cobaltSession}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`Cobalt token exchange failed: HTTP ${res.status}`, body);
    throw new Error(`Token exchange returned ${res.status} — check that your CobaltSession value is current`);
  }
  const data = await res.json() as { token?: string; cobalt?: string };
  const jwt = data.token ?? data.cobalt;
  if (!jwt) throw new Error('No token in D&D Beyond cobalt-token response');

  // Decode JWT payload (no verification needed — we just need the userId claim)
  let userId = '';
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    console.log('JWT payload keys:', Object.keys(payload), '| sub:', payload['sub'], '| userId:', payload['userId']);
    // DnD Beyond may use a namespaced claim or a numeric sub
    userId = String(
      payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']
      ?? payload['userId']
      ?? payload['sub']
      ?? ''
    );
  } catch (e) {
    console.warn('Could not decode JWT payload to extract userId:', e);
  }

  console.log('Cobalt JWT obtained, userId:', userId);
  return { jwt, userId };
}

function statMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

interface StatBlock { str: number; dex: number; con: number; int: number; wis: number; cha: number; }

function extractStats(char: Record<string, unknown>): StatBlock {
  // DDB stat IDs: 1=STR, 2=DEX, 3=CON, 4=INT, 5=WIS, 6=CHA
  const baseStats     = (char['stats']         as Array<{ id: number; value: number | null }> | undefined) ?? [];
  const bonusStats    = (char['bonusStats']     as Array<{ id: number; value: number | null }> | undefined) ?? [];
  const overrideStats = (char['overrideStats']  as Array<{ id: number; value: number | null }> | undefined) ?? [];

  // Gather all modifiers from every source: race, class, background, feat, item, condition, …
  type DdbModifier = { type: string; subType: string; value: number | null };
  const modifiersMap = (char['modifiers'] as Record<string, DdbModifier[]> | undefined) ?? {};
  const allModifiers: DdbModifier[] = Object.values(modifiersMap).flat();

  // DDB modifier subType strings for each ability score
  const statSubType: Record<number, string> = {
    1: 'strength-score',
    2: 'dexterity-score',
    3: 'constitution-score',
    4: 'intelligence-score',
    5: 'wisdom-score',
    6: 'charisma-score',
  };

  function getStat(id: number): number {
    // Manual override (set via DDB UI) takes full precedence
    const override = overrideStats.find(s => s.id === id);
    if (override?.value != null) return override.value;

    const subType = statSubType[id];

    // Base rolled/assigned score
    const base = baseStats.find(s => s.id === id)?.value ?? 10;

    // Manual bonus adjustment entered in DDB UI
    const manualBonus = bonusStats.find(s => s.id === id)?.value ?? 0;

    // Sum all 'bonus' modifiers: racial bonuses, class ASIs, feat bonuses, item bonuses, etc.
    const modBonus = allModifiers
      .filter(m => m.type === 'bonus' && m.subType === subType)
      .reduce((sum, m) => sum + (m.value ?? 0), 0);

    const raw = base + manualBonus + modBonus;

    // 'set' modifiers (e.g., Gauntlets of Ogre Power set STR to 19 if it would be lower)
    const setValues = allModifiers
      .filter(m => m.type === 'set' && m.subType === subType && m.value != null)
      .map(m => m.value!);

    return setValues.length > 0 ? Math.max(raw, ...setValues) : raw;
  }

  return { str: getStat(1), dex: getStat(2), con: getStat(3), int: getStat(4), wis: getStat(5), cha: getStat(6) };
}

function computeTotalLevel(char: Record<string, unknown>): number {
  const classes = (char['classes'] as Array<{ level: number }> | undefined) ?? [];
  return classes.reduce((sum, c) => sum + (c.level ?? 0), 0) || 1;
}

function computeProficiencyBonus(char: Record<string, unknown>): number {
  const level = computeTotalLevel(char);
  return Math.ceil(level / 4) + 1;
}
