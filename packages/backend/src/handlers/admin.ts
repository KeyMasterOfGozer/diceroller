import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminDeleteUserCommand,
  AdminResetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { ok, forbidden, badRequest, notImplemented, internalError } from '../lib/response.js';

const USER_POOL_ID = process.env.USER_POOL_ID!;

const cognitoClient = new CognitoIdentityProviderClient({});
const logsClient    = new CloudWatchLogsClient({});

// Log groups injected by CDK — enumerate expected keys explicitly rather than
// scanning all env vars, which is fragile and picks up unrelated LOG_GROUP_* vars.
const LAMBDA_KEYS = ['ME', 'CHARACTERS', 'MACROS', 'SHARING', 'DNDBEYOND', 'ADMIN'] as const;
const LOG_GROUPS: Record<string, string> = Object.fromEntries(
  LAMBDA_KEYS.flatMap(k => {
    const val = process.env[`LOG_GROUP_${k}`];
    return val ? [[k.toLowerCase(), val]] : [];
  })
);

// ── Admin guard ───────────────────────────────────────────────────────────────

type JwtEvent = { requestContext?: { authorizer?: { jwt?: { claims?: Record<string, unknown> } } } };

function isAdmin(event: APIGatewayProxyEventV2): boolean {
  const claims = (event as unknown as JwtEvent).requestContext?.authorizer?.jwt?.claims;
  if (!claims) return false;
  const groups = claims['cognito:groups'];
  if (!groups) return false;

  let list: string[];
  if (Array.isArray(groups)) {
    list = groups as string[];
  } else {
    const str = String(groups);
    try {
      // Try valid JSON first: '["Admins"]'
      const parsed: unknown = JSON.parse(str);
      list = Array.isArray(parsed) ? (parsed as string[]) : [str];
    } catch {
      // Cognito/APIGW sends bracket notation without quotes: "[Admins]" or "[A,B]"
      // Strip [ ] then split on comma
      list = str.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return list.includes('Admins');
}

// ── Router ────────────────────────────────────────────────────────────────────

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    if (!isAdmin(event)) return forbidden();

    const { routeKey } = event;
    switch (routeKey) {
      case 'GET /admin/users':                          return listUsers(event);
      case 'POST /admin/users/{username}/disable':      return disableUser(event);
      case 'POST /admin/users/{username}/enable':       return enableUser(event);
      case 'POST /admin/users/{username}/reset-password': return resetUserPassword(event);
      case 'DELETE /admin/users/{username}':            return deleteUser(event);
      case 'GET /admin/logs':                           return getLogs(event);
      default:                                          return notImplemented();
    }
  } catch (err) {
    return internalError(err);
  }
};

// ── User management ───────────────────────────────────────────────────────────

async function listUsers(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const qs              = event.queryStringParameters ?? {};
  const search          = qs['search'];
  const paginationToken = qs['token'];

  const result = await cognitoClient.send(new ListUsersCommand({
    UserPoolId:       USER_POOL_ID,
    Limit:            60,
    Filter:           search ? `email ^= "${search}"` : undefined,
    PaginationToken:  paginationToken,
  }));

  type Attr = { Name?: string; Value?: string };
  const users = (result.Users ?? []).map(u => ({
    username:      u.Username,
    email:         (u.Attributes as Attr[] | undefined)?.find(a => a.Name === 'email')?.Value ?? '',
    emailVerified: (u.Attributes as Attr[] | undefined)?.find(a => a.Name === 'email_verified')?.Value === 'true',
    status:        u.UserStatus ?? 'UNKNOWN',
    enabled:       u.Enabled ?? true,
    createdAt:     u.UserCreateDate?.toISOString() ?? null,
    updatedAt:     u.UserLastModifiedDate?.toISOString() ?? null,
  }));

  return ok({ users, nextToken: result.PaginationToken ?? null });
}

async function disableUser(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const username = decodeURIComponent(event.pathParameters?.username ?? '');
  if (!username) return badRequest('Missing username');
  await cognitoClient.send(new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  return ok({ success: true });
}

async function enableUser(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const username = decodeURIComponent(event.pathParameters?.username ?? '');
  if (!username) return badRequest('Missing username');
  await cognitoClient.send(new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  return ok({ success: true });
}

async function resetUserPassword(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const username = decodeURIComponent(event.pathParameters?.username ?? '');
  if (!username) return badRequest('Missing username');
  await cognitoClient.send(new AdminResetUserPasswordCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  return ok({ success: true });
}

async function deleteUser(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const username = decodeURIComponent(event.pathParameters?.username ?? '');
  if (!username) return badRequest('Missing username');
  await cognitoClient.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  return ok({ success: true });
}

// ── Logs ──────────────────────────────────────────────────────────────────────

async function getLogs(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const qs     = event.queryStringParameters ?? {};
  const fn     = qs['fn']?.toLowerCase();
  const filter = qs['filter'] ?? 'ERROR';
  const limit  = Math.min(parseInt(qs['limit'] ?? '100', 10), 500);
  const hours  = Math.min(parseInt(qs['hours'] ?? '24', 10), 168); // max 7 days

  // Without fn, return the list of available log group keys
  if (!fn) {
    return ok({ logGroups: Object.keys(LOG_GROUPS).sort() });
  }

  const logGroup = LOG_GROUPS[fn];
  if (!logGroup) {
    return badRequest(`Unknown function "${fn}". Available: ${Object.keys(LOG_GROUPS).sort().join(', ')}`);
  }

  const startTime = Date.now() - hours * 60 * 60 * 1000;

  const result = await logsClient.send(new FilterLogEventsCommand({
    logGroupName:  logGroup,
    filterPattern: filter || undefined,
    startTime,
    limit,
  }));

  type LogEvent = { timestamp?: number; message?: string; logStreamName?: string };
  const events = (result.events as LogEvent[] ?? []).map(e => ({
    timestamp:     e.timestamp ?? 0,
    message:       e.message?.trim() ?? '',
    logStreamName: e.logStreamName ?? '',
  }));

  return ok({ fn, logGroup, hours, filter, events });
}
