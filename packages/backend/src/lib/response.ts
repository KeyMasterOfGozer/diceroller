import { APIGatewayProxyResultV2 } from 'aws-lambda';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function ok(body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export function created(body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: 201, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export function noContent(): APIGatewayProxyResultV2 {
  return { statusCode: 204, headers: JSON_HEADERS, body: '' };
}

export function badRequest(message: string): APIGatewayProxyResultV2 {
  return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: message }) };
}

export function unauthorized(): APIGatewayProxyResultV2 {
  return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
}

export function forbidden(): APIGatewayProxyResultV2 {
  return { statusCode: 403, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Forbidden' }) };
}

export function notFound(resource = 'Resource'): APIGatewayProxyResultV2 {
  return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: `${resource} not found` }) };
}

export function notImplemented(): APIGatewayProxyResultV2 {
  return { statusCode: 501, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Not implemented' }) };
}

export function internalError(err?: unknown): APIGatewayProxyResultV2 {
  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  console.error('Internal error:', err);
  return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: `Internal error: ${message}` }) };
}
