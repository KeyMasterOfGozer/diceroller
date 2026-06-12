import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { docClient, TABLE_NAME, getUserId,
         GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '../lib/db.js';
import { ok, created, noContent, badRequest, notFound, notImplemented, internalError } from '../lib/response.js';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const { routeKey } = event;
    switch (routeKey) {
      // Authenticated routes
      case 'POST /characters/{id}/macros/{macroId}/share':          return shareMacro(event);
      case 'DELETE /characters/{id}/macros/{macroId}/share':        return unshareMacro(event);
      case 'POST /characters/{id}/macros/{macroId}/import-share':   return importFromShare(event);
      // Public route (no authorizer)
      case 'GET /shared/{token}':                                    return getShared(event);
      default:                                                       return notImplemented();
    }
  } catch (err) {
    return internalError(err);
  }
};

/** POST /characters/{id}/macros/{macroId}/share
 *  Creates a share token for a macro, or returns the existing one.
 */
async function shareMacro(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id: charId, macroId } = event.pathParameters ?? {};

  // Fetch the macro to verify ownership
  const macroResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}#CHAR#${charId}`, sk: `MACRO#${macroId}` },
  }));
  if (!macroResult.Item) return notFound('Macro');

  const macro = macroResult.Item as Record<string, unknown>;

  // If already shared, return existing token
  if (macro['isShared'] && macro['shareToken']) {
    return ok({ shareToken: macro['shareToken'], shared: true });
  }

  const token = randomUUID().replace(/-/g, '');

  // Create the public SHARE item
  const shareItem = {
    pk: `SHARE#${token}`, sk: 'META',
    token, macroId, characterId: charId, userId,
    name: macro['name'], notation: macro['notation'],
    category: macro['category'], description: macro['description'],
    createdAt: new Date().toISOString(),
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: shareItem }));

  // Update the macro to mark as shared
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}#CHAR#${charId}`, sk: `MACRO#${macroId}` },
    UpdateExpression: 'SET isShared = :true, shareToken = :token, updatedAt = :now',
    ExpressionAttributeValues: { ':true': true, ':token': token, ':now': new Date().toISOString() },
  }));

  return created({ shareToken: token, shared: true });
}

/** DELETE /characters/{id}/macros/{macroId}/share
 *  Revokes the share link for a macro.
 */
async function unshareMacro(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id: charId, macroId } = event.pathParameters ?? {};

  // Fetch current macro to get token
  const macroResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}#CHAR#${charId}`, sk: `MACRO#${macroId}` },
  }));
  if (!macroResult.Item) return notFound('Macro');

  const macro = macroResult.Item as Record<string, unknown>;
  const token = macro['shareToken'] as string | undefined;

  if (token) {
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk: `SHARE#${token}`, sk: 'META' },
    }));
  }

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}#CHAR#${charId}`, sk: `MACRO#${macroId}` },
    UpdateExpression: 'SET isShared = :false, shareToken = :null, updatedAt = :now',
    ExpressionAttributeValues: { ':false': false, ':null': null, ':now': new Date().toISOString() },
  }));

  return noContent();
}

/** GET /shared/{token}  (public — no authorizer)
 *  Returns a shared macro by token.
 */
async function getShared(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { token } = event.pathParameters ?? {};
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: `SHARE#${token}`, sk: 'META' },
  }));
  if (!result.Item) return notFound('Shared macro');
  const { pk, sk, userId, ...publicFields } = result.Item as Record<string, unknown>;
  return ok(publicFields);
}

/** POST /characters/{id}/macros/{macroId}/import-share
 *  Copies a shared macro (by token) into the authenticated user's character.
 *  Body: { shareToken: string }
 */
async function importFromShare(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id: charId } = event.pathParameters ?? {};
  const body = JSON.parse(event.body ?? '{}') as { shareToken?: string };
  if (!body.shareToken) return badRequest('shareToken is required');

  // Fetch the shared macro
  const sharedResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: `SHARE#${body.shareToken}`, sk: 'META' },
  }));
  if (!sharedResult.Item) return notFound('Shared macro');

  const shared = sharedResult.Item as Record<string, unknown>;
  const macroId = randomUUID();
  const now = new Date().toISOString();
  const item = {
    pk: `USER#${userId}#CHAR#${charId}`, sk: `MACRO#${macroId}`,
    macroId, characterId: charId, userId,
    name: shared['name'], notation: shared['notation'],
    category: shared['category'], description: shared['description'],
    isShared: false, shareToken: null,
    sortOrder: 0, createdAt: now, updatedAt: now,
    importedFrom: body.shareToken,
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  const { pk, sk, ...rest } = item;
  return created(rest);
}
