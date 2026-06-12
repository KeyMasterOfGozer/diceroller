#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StatefulStack } from '../lib/stacks/stateful-stack';
import { AppStack } from '../lib/stacks/app-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

// ── Stateful stack: DynamoDB + Cognito ────────────────────────────────────
// Deploy with termination protection — these resources hold user data.
const stateful = new StatefulStack(app, 'DiceRollerStateful', {
  env,
  terminationProtection: true,
  description: 'D&D Dice Roller — stateful resources (DynamoDB + Cognito)',
});

// ── App stack: API + Lambda + S3 + CloudFront + Secrets ───────────────────
new AppStack(app, 'DiceRollerApp', {
  env,
  description: 'D&D Dice Roller — application tier (API, hosting, secrets)',
  stateful,
});

app.synth();
