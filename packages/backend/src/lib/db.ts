import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand,
         DeleteCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { QueryCommandInput } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});

export const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLE_NAME = process.env.TABLE_NAME!;

// Re-export command types for convenience in handlers
export { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, TransactWriteCommand };
export type { QueryCommandInput };

/** Extract the authenticated user's Cognito sub from the JWT claims */
export function getUserId(event: { requestContext?: { authorizer?: { jwt?: { claims?: Record<string, string> } } } }): string {
  const sub = event.requestContext?.authorizer?.jwt?.claims?.['sub'];
  if (!sub) throw new Error('Missing sub claim — request not authenticated');
  return sub;
}
