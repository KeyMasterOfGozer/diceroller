import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StatefulStack } from './stateful-stack';
import { DiceRollerHosting } from '../constructs/hosting';
import { DiceRollerApi } from '../constructs/api';

interface AppStackProps extends cdk.StackProps {
  stateful: StatefulStack;
}

/**
 * App stack — stateless application tier.
 * Can be destroyed and redeployed without data loss.
 *
 * Contains:
 *  - S3 bucket + CloudFront distribution (SPA hosting)
 *  - Lambda functions
 *  - API Gateway HTTP API
 *  - Secrets Manager (D&D Beyond credentials placeholder)
 */
export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { stateful } = props;

    new DiceRollerHosting(this, 'Hosting');

    new DiceRollerApi(this, 'Api', {
      table:     stateful.table.table,
      userPool:  stateful.auth.userPool,
      webClient: stateful.auth.webClient,
    });
  }
}
