import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { docClient, TABLE_NAME, getUserId, GetCommand, PutCommand } from '../lib/db.js';
import { ok, notImplemented, internalError } from '../lib/response.js';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const { routeKey } = event;
    switch (routeKey) {
      case 'GET /me':  return getMe(event);
      case 'PUT /me':  return putMe(event);
      default:         return notImplemented();
    }
  } catch (err) {
    return internalError(err);
  }
};

async function getMe(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
  }));
  if (!result.Item) {
    // Auto-create profile on first access
    const profile = { pk: `USER#${userId}`, sk: 'PROFILE', displayName: '', createdAt: new Date().toISOString() };
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: profile }));
    return ok({ displayName: '' });
  }
  return ok({ displayName: result.Item['displayName'] ?? '' });
}

async function putMe(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const body = JSON.parse(event.body ?? '{}') as { displayName?: string };
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: { pk: `USER#${userId}`, sk: 'PROFILE', displayName: body.displayName ?? '', updatedAt: new Date().toISOString() },
  }));
  return ok({ displayName: body.displayName ?? '' });
}
