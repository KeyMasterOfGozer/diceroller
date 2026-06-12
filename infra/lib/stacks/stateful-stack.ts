import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DiceRollerTable } from '../constructs/table';
import { DiceRollerUserPool } from '../constructs/user-pool';

/**
 * Stateful stack — resources that hold user data.
 * Deployed with termination protection to prevent accidental destruction.
 *
 * Contains:
 *  - DynamoDB single table
 *  - Cognito User Pool + web client
 */
export class StatefulStack extends cdk.Stack {
  public readonly table: DiceRollerTable;
  public readonly auth: DiceRollerUserPool;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.table = new DiceRollerTable(this, 'Table');
    this.auth  = new DiceRollerUserPool(this, 'Auth');
  }
}
