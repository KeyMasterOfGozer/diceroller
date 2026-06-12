import * as path from 'path';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, BundlingOptions } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';

interface ApiProps {
  table: dynamodb.Table;
  userPool: cognito.UserPool;
  webClient: cognito.UserPoolClient;
}

// Path to the backend handlers from this file
const HANDLERS_DIR = path.join(__dirname, '../../../packages/backend/src/handlers');

export class DiceRollerApi extends Construct {
  public readonly api: apigw.HttpApi;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    const { table, userPool, webClient } = props;

    // ── Secrets Manager: D&D Beyond credentials ───────────────────────────
    // Placeholder secret — populate via console or CLI before Phase 2.
    const dndBeyondSecret = new secretsmanager.Secret(this, 'DndBeyondSecret', {
      secretName: 'dice-roller/dndbeyond-credentials',
      description: 'D&D Beyond OAuth2 client credentials (clientId + clientSecret)',
      // Initial value — replace with real credentials before enabling the feature
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({ clientId: 'PLACEHOLDER', clientSecret: 'PLACEHOLDER' })
      ),
    });

    // ── Shared Lambda config ──────────────────────────────────────────────
    const sharedEnv = {
      TABLE_NAME: table.tableName,
      NODE_OPTIONS: '--enable-source-maps',
    };

    const sharedBundling: BundlingOptions = {
      minify: true,
      sourceMap: true,
      target: 'node20',
    };

    function makeFn(
      ctx: Construct,
      fnId: string,
      entryFile: string,
      extraEnv?: Record<string, string>
    ) {
      return new NodejsFunction(ctx, fnId, {
        entry: path.join(HANDLERS_DIR, entryFile),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        environment: { ...sharedEnv, ...extraEnv },
        bundling: sharedBundling,
      });
    }

    // ── Lambda functions ──────────────────────────────────────────────────
    const meFn          = makeFn(this, 'MeFn',          'me.ts');
    const charactersFn  = makeFn(this, 'CharactersFn',  'characters.ts');
    const macrosFn      = makeFn(this, 'MacrosFn',      'macros.ts');
    const sharingFn     = makeFn(this, 'SharingFn',     'sharing.ts');
    const dndBeyondFn   = makeFn(this, 'DndBeyondFn',   'dndbeyond.ts', {
      DNDBEYOND_SECRET_ARN: dndBeyondSecret.secretArn,
    });

    // ── IAM: DynamoDB access ──────────────────────────────────────────────
    table.grantReadWriteData(meFn);
    table.grantReadWriteData(charactersFn);
    table.grantReadWriteData(macrosFn);
    table.grantReadWriteData(sharingFn);
    table.grantReadWriteData(dndBeyondFn);

    // ── IAM: Secrets Manager (dndbeyond Lambda only) ──────────────────────
    dndBeyondSecret.grantRead(dndBeyondFn);

    // ── JWT Authorizer (Cognito) ──────────────────────────────────────────
    const jwtAuthorizer = new HttpJwtAuthorizer('CognitoAuthorizer', userPool.userPoolProviderUrl, {
      jwtAudience: [webClient.userPoolClientId],
    });

    // ── HTTP API ──────────────────────────────────────────────────────────
    this.api = new apigw.HttpApi(this, 'HttpApi', {
      apiName: 'DiceRollerApi',
      description: 'D&D Dice Roller REST API',
      corsPreflight: {
        allowOrigins: [
          'http://localhost:5173',   // Vite dev server
          'http://localhost:4173',   // Vite preview
          'https://diceroller.oldforest.net',
        ],
        allowMethods: [
          apigw.CorsHttpMethod.GET,
          apigw.CorsHttpMethod.POST,
          apigw.CorsHttpMethod.PUT,
          apigw.CorsHttpMethod.DELETE,
          apigw.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Authorization', 'Content-Type'],
        maxAge: cdk.Duration.days(1),
      },
    });

    // Helper: add a route with the default JWT authorizer
    const auth = { authorizer: jwtAuthorizer };

    const meInt         = new HttpLambdaIntegration('MeInt',         meFn);
    const charsInt      = new HttpLambdaIntegration('CharsInt',      charactersFn);
    const macrosInt     = new HttpLambdaIntegration('MacrosInt',     macrosFn);
    const sharingInt    = new HttpLambdaIntegration('SharingInt',    sharingFn);
    const dndInt        = new HttpLambdaIntegration('DndInt',        dndBeyondFn);

    // ── /me ───────────────────────────────────────────────────────────────
    this.api.addRoutes({ path: '/me',    methods: [apigw.HttpMethod.GET, apigw.HttpMethod.PUT], integration: meInt, ...auth });

    // ── /characters ───────────────────────────────────────────────────────
    this.api.addRoutes({ path: '/characters',                                      methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST],          integration: charsInt, ...auth });
    this.api.addRoutes({ path: '/characters/{id}',                                 methods: [apigw.HttpMethod.GET, apigw.HttpMethod.PUT, apigw.HttpMethod.DELETE], integration: charsInt, ...auth });
    this.api.addRoutes({ path: '/characters/{id}/vars',                            methods: [apigw.HttpMethod.GET, apigw.HttpMethod.PUT],           integration: charsInt, ...auth });

    // ── /characters/{id}/macros ───────────────────────────────────────────
    this.api.addRoutes({ path: '/characters/{id}/macros',                          methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST],          integration: macrosInt, ...auth });
    this.api.addRoutes({ path: '/characters/{id}/macros/order',                    methods: [apigw.HttpMethod.PUT],                                 integration: macrosInt, ...auth });
    this.api.addRoutes({ path: '/characters/{id}/macros/{macroId}',               methods: [apigw.HttpMethod.GET, apigw.HttpMethod.PUT, apigw.HttpMethod.DELETE], integration: macrosInt, ...auth });

    // ── Sharing ───────────────────────────────────────────────────────────
    this.api.addRoutes({ path: '/characters/{id}/macros/{macroId}/share',          methods: [apigw.HttpMethod.POST, apigw.HttpMethod.DELETE],       integration: sharingInt, ...auth });
    this.api.addRoutes({ path: '/characters/{id}/macros/import/{token}',           methods: [apigw.HttpMethod.POST],                                integration: sharingInt, ...auth });
    // GET /shared/{token} is public — no authorizer
    this.api.addRoutes({ path: '/shared/{token}',                                  methods: [apigw.HttpMethod.GET],                                 integration: sharingInt });

    // ── D&D Beyond OAuth + import ─────────────────────────────────────────
    this.api.addRoutes({ path: '/dndbeyond/token',                                 methods: [apigw.HttpMethod.POST],                                integration: dndInt, ...auth });
    this.api.addRoutes({ path: '/dndbeyond/characters',                            methods: [apigw.HttpMethod.GET],                                 integration: dndInt, ...auth });
    this.api.addRoutes({ path: '/characters/{id}/import/dndbeyond/{ddbCharId}',   methods: [apigw.HttpMethod.POST],                                integration: dndInt, ...auth });

    // ── Output ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(scope, 'ApiUrl', {
      value: this.api.apiEndpoint,
      description: 'API Gateway HTTP API endpoint URL',
      exportName: 'DiceRollerApiUrl',
    });

    new cdk.CfnOutput(scope, 'DndBeyondSecretArn', {
      value: dndBeyondSecret.secretArn,
      description: 'ARN of the D&D Beyond credentials secret (populate before Phase 2)',
    });
  }
}
