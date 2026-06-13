import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { docClient, TABLE_NAME, getUserId,
         GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand,
         TransactWriteCommand, type QueryCommandInput } from '../lib/db.js';
import { ok, created, noContent, badRequest, notFound, notImplemented, internalError } from '../lib/response.js';

const VALID_CATEGORIES = ['Attack','Damage','Spell','Skill','Save','Utility','Other'] as const;

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const { routeKey } = event;
    switch (routeKey) {
      case 'GET /characters/{id}/macros':                          return listMacros(event);
      case 'POST /characters/{id}/macros':                         return createMacro(event);
      case 'GET /characters/{id}/macros/{macroId}':                return getMacro(event);
      case 'PUT /characters/{id}/macros/{macroId}':                return updateMacro(event);
      case 'DELETE /characters/{id}/macros/{macroId}':             return deleteMacro(event);
      case 'PUT /characters/{id}/macros/order':                    return reorderMacros(event);
      default:                                                     return notImplemented();
    }
  } catch (err) {
    return internalError(err);
  }
};

function macroKey(userId: string, charId: string, macroId: string) {
  return { pk: `USER#${userId}#CHAR#${charId}`, sk: `MACRO#${macroId}` };
}

async function listMacros(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id: charId } = event.pathParameters ?? {};
  const category = event.queryStringParameters?.['category'];
  const queryInput: QueryCommandInput = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}#CHAR#${charId}`, ':prefix': 'MACRO#' },
  };
  if (category) {
    queryInput['FilterExpression'] = 'category = :cat';
    (queryInput['ExpressionAttributeValues'] as Record<string, unknown>)[':cat'] = category;
  }
  const result = await docClient.send(new QueryCommand(queryInput));
  const items = (result.Items ?? []).map(stripKeys).sort((a, b) => ((a as Record<string, number>)['sortOrder'] ?? 0) - ((b as Record<string, number>)['sortOrder'] ?? 0));
  return ok(items);
}

async function createMacro(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id: charId } = event.pathParameters ?? {};
  const body = JSON.parse(event.body ?? '{}') as {
    name?: string; notation?: string; category?: string;
    description?: string; sortOrder?: number;
    type?: 'standard' | 'combo'; macroIds?: string[];
  };

  if (!body.name?.trim()) return badRequest('name is required');
  if (body.category && !VALID_CATEGORIES.includes(body.category as never)) {
    return badRequest(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }

  const macroType = body.type ?? 'standard';
  if (macroType === 'combo') {
    if (!body.macroIds?.length) return badRequest('macroIds (non-empty array) is required for combo macros');
  } else {
    if (!body.notation?.trim()) return badRequest('notation is required');
  }

  const macroId = randomUUID();
  const now = new Date().toISOString();
  const item = {
    pk: `USER#${userId}#CHAR#${charId}`, sk: `MACRO#${macroId}`,
    macroId, characterId: charId, userId,
    name: body.name.trim(),
    notation: macroType === 'combo' ? '' : (body.notation?.trim() ?? ''),
    category: body.category ?? 'Utility', description: body.description ?? '',
    isShared: false, shareToken: null,
    sortOrder: body.sortOrder ?? 0,
    type: macroType,
    macroIds: macroType === 'combo' ? (body.macroIds ?? []) : [],
    createdAt: now, updatedAt: now,
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return created(stripKeys(item));
}

async function getMacro(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id: charId, macroId } = event.pathParameters ?? {};
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME, Key: macroKey(userId, charId!, macroId!),
  }));
  if (!result.Item) return notFound('Macro');
  return ok(stripKeys(result.Item));
}

async function updateMacro(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id: charId, macroId } = event.pathParameters ?? {};
  const body = JSON.parse(event.body ?? '{}') as {
    name?: string; notation?: string; category?: string; description?: string; sortOrder?: number;
    macroIds?: string[];
  };
  if (body.category && !VALID_CATEGORIES.includes(body.category as never)) {
    return badRequest(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }

  // Build update expression only for fields that were actually provided
  const setClauses: string[] = ['updatedAt = :now'];
  const exprNames: Record<string, string> = {};
  const exprValues: Record<string, unknown> = { ':now': new Date().toISOString() };

  if (body.name        !== undefined) { setClauses.push('#n = :name');            exprNames['#n'] = 'name'; exprValues[':name']     = body.name; }
  if (body.notation    !== undefined) { setClauses.push('notation = :notation');  exprValues[':notation']  = body.notation; }
  if (body.category    !== undefined) { setClauses.push('category = :cat');       exprValues[':cat']       = body.category; }
  if (body.description !== undefined) { setClauses.push('description = :desc');   exprValues[':desc']      = body.description; }
  if (body.sortOrder   !== undefined) { setClauses.push('sortOrder = :order');    exprValues[':order']     = body.sortOrder; }
  if (body.macroIds    !== undefined) { setClauses.push('macroIds = :ids');       exprValues[':ids']       = body.macroIds; }

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: macroKey(userId, charId!, macroId!),
    UpdateExpression: `SET ${setClauses.join(', ')}`,
    ...(Object.keys(exprNames).length ? { ExpressionAttributeNames: exprNames } : {}),
    ExpressionAttributeValues: exprValues,
    ConditionExpression: 'attribute_exists(pk)',
  }));
  return ok({ macroId, ...body });
}

async function deleteMacro(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id: charId, macroId } = event.pathParameters ?? {};
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME, Key: macroKey(userId, charId!, macroId!),
  }));
  return noContent();
}

async function reorderMacros(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id: charId } = event.pathParameters ?? {};
  const body = JSON.parse(event.body ?? '[]') as Array<{ macroId: string; sortOrder: number }>;
  if (!Array.isArray(body)) return badRequest('Body must be an array of {macroId, sortOrder}');
  // Update each macro's sortOrder in a transaction (max 100 items per transaction)
  const chunks = chunkArray(body, 25);
  for (const chunk of chunks) {
    await docClient.send(new TransactWriteCommand({
      TransactItems: chunk.map(({ macroId, sortOrder }) => ({
        Update: {
          TableName: TABLE_NAME,
          Key: macroKey(userId, charId!, macroId),
          UpdateExpression: 'SET sortOrder = :order',
          ExpressionAttributeValues: { ':order': sortOrder },
        },
      })),
    }));
  }
  return noContent();
}

function stripKeys(item: Record<string, unknown>) {
  const { pk, sk, ...rest } = item;
  return rest;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}
