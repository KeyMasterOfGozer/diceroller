import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { docClient, TABLE_NAME, getUserId,
         GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand,
         TransactWriteCommand } from '../lib/db.js';
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
  const queryInput: Parameters<typeof docClient.send>[0] extends { input: infer I } ? never : Parameters<typeof QueryCommand>[0] = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}#CHAR#${charId}`, ':prefix': 'MACRO#' },
  };
  if (category) {
    (queryInput as Record<string, unknown>)['FilterExpression'] = 'category = :cat';
    ((queryInput as Record<string, unknown>)['ExpressionAttributeValues'] as Record<string, unknown>)[':cat'] = category;
  }
  const result = await docClient.send(new QueryCommand(queryInput as Parameters<typeof QueryCommand>[0]));
  const items = (result.Items ?? []).map(stripKeys).sort((a, b) => ((a as Record<string, number>)['sortOrder'] ?? 0) - ((b as Record<string, number>)['sortOrder'] ?? 0));
  return ok(items);
}

async function createMacro(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id: charId } = event.pathParameters ?? {};
  const body = JSON.parse(event.body ?? '{}') as {
    name?: string; notation?: string; category?: string;
    description?: string; sortOrder?: number;
  };
  if (!body.name?.trim()) return badRequest('name is required');
  if (!body.notation?.trim()) return badRequest('notation is required');
  if (body.category && !VALID_CATEGORIES.includes(body.category as never)) {
    return badRequest(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }
  // TODO: validate notation via dice-engine validate() before saving
  const macroId = randomUUID();
  const now = new Date().toISOString();
  const item = {
    pk: `USER#${userId}#CHAR#${charId}`, sk: `MACRO#${macroId}`,
    macroId, characterId: charId, userId,
    name: body.name.trim(), notation: body.notation.trim(),
    category: body.category ?? 'Utility', description: body.description ?? '',
    isShared: false, shareToken: null,
    sortOrder: body.sortOrder ?? 0, createdAt: now, updatedAt: now,
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
  };
  if (body.category && !VALID_CATEGORIES.includes(body.category as never)) {
    return badRequest(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: macroKey(userId, charId!, macroId!),
    UpdateExpression: 'SET #n = :name, notation = :notation, category = :cat, description = :desc, sortOrder = :order, updatedAt = :now',
    ExpressionAttributeNames: { '#n': 'name' },
    ExpressionAttributeValues: {
      ':name': body.name, ':notation': body.notation, ':cat': body.category,
      ':desc': body.description, ':order': body.sortOrder, ':now': new Date().toISOString(),
    },
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
