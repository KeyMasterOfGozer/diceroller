import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

/**
 * Single-table DynamoDB design.
 *
 * Key patterns:
 *   USER#{userId}               / PROFILE
 *   USER#{userId}               / CHAR#{characterId}
 *   USER#{userId}               / VARS#{characterId}
 *   USER#{userId}#CHAR#{charId} / MACRO#{macroId}
 *   SHARE#{shareToken}          / MACRO
 */
export class DiceRollerTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: 'DiceRollerData',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      // Protect against accidental deletion in production
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI: look up all characters/macros for a user regardless of SK prefix
    // (e.g. list all characters: pk=USER#{userId}, sk begins_with CHAR#)
    // The main table already supports this via begins_with on sk.
    // Add a sparse GSI for share token lookups by token only (no pk needed).
    // Actually share tokens use pk=SHARE#{token} so no GSI needed for that.

    new cdk.CfnOutput(scope, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB table name',
      exportName: 'DiceRollerTableName',
    });

    new cdk.CfnOutput(scope, 'TableArn', {
      value: this.table.tableArn,
      description: 'DynamoDB table ARN',
    });
  }
}
