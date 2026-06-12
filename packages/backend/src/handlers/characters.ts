import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { docClient, TABLE_NAME, getUserId,
         GetCommand, PutCommand, QueryCommand, UpdateCommand } from '../lib/db.js';
import { ok, created, noContent, badRequest, notFound, notImplemented, internalError } from '../lib/response.js';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const { routeKey } = event;
    switch (routeKey) {
      case 'GET /characters':             return listCharacters(event);
      case 'POST /characters':            return createCharacter(event);
      case 'GET /characters/{id}':        return getCharacter(event);
      case 'PUT /characters/{id}':        return updateCharacter(event);
      case 'DELETE /characters/{id}':     return archiveCharacter(event);
      case 'GET /characters/{id}/vars':   return getVars(event);
      case 'PUT /characters/{id}/vars':   return putVars(event);
      default:                            return notImplemented();
    }
  } catch (err) {
    return internalError(err);
  }
};

async function listCharacters(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    FilterExpression: 'attribute_not_exists(archived) OR archived = :false',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': 'CHAR#', ':false': false },
  }));
  return ok(result.Items?.map(stripKeys) ?? []);
}

async function createCharacter(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const body = JSON.parse(event.body ?? '{}') as {
    name?: string; class?: string; level?: number; notes?: string;
  };
  if (!body.name?.trim()) return badRequest('name is required');
  const characterId = randomUUID();
  const now = new Date().toISOString();
  const item = {
    pk: `USER#${userId}`, sk: `CHAR#${characterId}`,
    characterId, userId, name: body.name.trim(),
    class: body.class ?? '', level: body.level ?? 1, notes: body.notes ?? '',
    archived: false, createdAt: now, updatedAt: now,
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return created(stripKeys(item));
}

async function getCharacter(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id } = event.pathParameters ?? {};
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME, Key: { pk: `USER#${userId}`, sk: `CHAR#${id}` },
  }));
  if (!result.Item || result.Item['archived']) return notFound('Character');
  return ok(stripKeys(result.Item));
}

async function updateCharacter(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id } = event.pathParameters ?? {};
  const body = JSON.parse(event.body ?? '{}') as {
    name?: string; class?: string; level?: number; notes?: string;
  };
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}`, sk: `CHAR#${id}` },
    UpdateExpression: 'SET #n = :name, #cl = :class, #lv = :level, notes = :notes, updatedAt = :now',
    ExpressionAttributeNames: { '#n': 'name', '#cl': 'class', '#lv': 'level' },
    ExpressionAttributeValues: {
      ':name': body.name, ':class': body.class, ':level': body.level,
      ':notes': body.notes, ':now': new Date().toISOString(),
    },
    ConditionExpression: 'attribute_exists(pk)',
  }));
  return ok({ characterId: id, ...body });
}

async function archiveCharacter(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id } = event.pathParameters ?? {};
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}`, sk: `CHAR#${id}` },
    UpdateExpression: 'SET archived = :true, updatedAt = :now',
    ExpressionAttributeValues: { ':true': true, ':now': new Date().toISOString() },
    ConditionExpression: 'attribute_exists(pk)',
  }));
  return noContent();
}

async function getVars(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id } = event.pathParameters ?? {};
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME, Key: { pk: `USER#${userId}`, sk: `VARS#${id}` },
  }));
  return ok(result.Item?.['vars'] ?? {});
}

async function putVars(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const { id } = event.pathParameters ?? {};
  const vars = JSON.parse(event.body ?? '{}') as Record<string, number>;
  // Validate: values must be numbers
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      return badRequest(`Variable '${k}' must be an integer`);
    }
  }
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: { pk: `USER#${userId}`, sk: `VARS#${id}`, vars, updatedAt: new Date().toISOString() },
  }));
  return ok(vars);
}

/** Remove DynamoDB pk/sk before returning to client */
function stripKeys(item: Record<string, unknown>) {
  const { pk, sk, ...rest } = item;
  return rest;
}
