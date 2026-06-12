import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { docClient, TABLE_NAME, getUserId, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '../lib/db.js';
import { ok, badRequest, internalError, notImplemented } from '../lib/response.js';

const smClient = new SecretsManagerClient({});
const SECRET_ARN = process.env.DNDBEYOND_SECRET_ARN!;
const DNDBEYOND_API_BASE = 'https://www.dndbeyond.com/api';
const OAUTH_TOKEN_URL = 'https://auth.dndbeyond.com/oauth2/token';

interface DdbCredentials {
  clientId: string;
  clientSecret: string;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const { routeKey } = event;
    switch (routeKey) {
      case 'POST /dndbeyond/token':       return exchangeToken(event);
      case 'GET /dndbeyond/characters':   return listDndCharacters(event);
      case 'POST /dndbeyond/import':      return importCharacter(event);
      default:                            return notImplemented();
    }
  } catch (err) {
    return internalError(err);
  }
};

/** POST /dndbeyond/token
 *  Exchanges an OAuth authorization code for a D&D Beyond access token.
 *  Body: { code: string; redirectUri: string }
 *  Returns: { accessToken: string; expiresIn: number; userId: string }
 *
 *  The client secret is fetched from Secrets Manager — never exposed to the browser.
 */
async function exchangeToken(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? '{}') as { code?: string; redirectUri?: string };
  if (!body.code) return badRequest('code is required');
  if (!body.redirectUri) return badRequest('redirectUri is required');

  const creds = await getDdbCredentials();

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: body.code,
    redirect_uri: body.redirectUri,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('DDB token exchange failed:', response.status, text);
    return badRequest('Failed to exchange token with D&D Beyond');
  }

  const data = await response.json() as {
    access_token: string; expires_in: number; token_type: string;
  };

  return ok({
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  });
}

/** GET /dndbeyond/characters
 *  Lists the authenticated user's D&D Beyond characters.
 *  Query param: accessToken (D&D Beyond OAuth token, passed from client)
 *
 *  Note: The D&D Beyond access token is passed as a query param because it's
 *  ephemeral and user-owned — we never persist it server-side.
 */
async function listDndCharacters(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const accessToken = event.queryStringParameters?.['accessToken'];
  if (!accessToken) return badRequest('accessToken query param is required');

  const response = await fetch(`${DNDBEYOND_API_BASE}/v5/character`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  });

  if (!response.ok) {
    return badRequest('Failed to fetch characters from D&D Beyond');
  }

  const data = await response.json() as { data: unknown[] };
  const characters = (data.data ?? []).map((char: unknown) => {
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

/** POST /dndbeyond/import
 *  Imports a D&D Beyond character into the dice roller.
 *  Body: { accessToken: string; dndCharacterId: string; targetCharacterId: string }
 *
 *  Extracts standard variable keys (stats, proficiency bonus, etc.) and overwrites
 *  the target character's vars. Custom variables are untouched.
 */
async function importCharacter(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const body = JSON.parse(event.body ?? '{}') as {
    accessToken?: string;
    dndCharacterId?: string;
    targetCharacterId?: string;
  };
  if (!body.accessToken) return badRequest('accessToken is required');
  if (!body.dndCharacterId) return badRequest('dndCharacterId is required');
  if (!body.targetCharacterId) return badRequest('targetCharacterId is required');

  // Fetch full character from D&D Beyond
  const response = await fetch(`${DNDBEYOND_API_BASE}/v5/character/${body.dndCharacterId}`, {
    headers: { 'Authorization': `Bearer ${body.accessToken}`, 'Accept': 'application/json' },
  });

  if (!response.ok) {
    return badRequest('Failed to fetch character from D&D Beyond');
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
    Key: { pk: `USER#${userId}`, sk: `VARS#${body.targetCharacterId}` },
  }));
  const existingVars = (existingResult.Item?.['vars'] ?? {}) as Record<string, number>;

  // Overwrite only the standard keys; preserve custom ones
  const mergedVars = { ...existingVars, ...importedVars };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      pk: `USER#${userId}`, sk: `VARS#${body.targetCharacterId}`,
      vars: mergedVars, updatedAt: new Date().toISOString(),
    },
  }));

  return ok({ imported: Object.keys(importedVars).length, vars: mergedVars });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getDdbCredentials(): Promise<DdbCredentials> {
  const result = await smClient.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
  return JSON.parse(result.SecretString ?? '{}') as DdbCredentials;
}

function statMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

interface StatBlock { str: number; dex: number; con: number; int: number; wis: number; cha: number; }

function extractStats(char: Record<string, unknown>): StatBlock {
  const stats = (char['stats'] as Array<{ id: number; value: number }> | undefined) ?? [];
  // DDB stat IDs: 1=STR,2=DEX,3=CON,4=INT,5=WIS,6=CHA
  const bonuses = (char['bonusStats'] as Array<{ id: number; value: number | null }> | undefined) ?? [];
  const overrides = (char['overrideStats'] as Array<{ id: number; value: number | null }> | undefined) ?? [];

  function getStat(id: number): number {
    const override = overrides.find(s => s.id === id);
    if (override?.value != null) return override.value;
    const base = stats.find(s => s.id === id)?.value ?? 10;
    const bonus = bonuses.find(s => s.id === id)?.value ?? 0;
    return base + bonus;
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
