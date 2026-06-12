import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class DiceRollerUserPool extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly webClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // ── User Pool ─────────────────────────────────────────────────────────
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'DiceRollerUsers',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // Email verification message
      userVerification: {
        emailSubject: 'Verify your D&D Dice Roller account',
        emailBody: 'Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── SPA Client (no secret, SRP auth) ─────────────────────────────────
    this.webClient = this.userPool.addClient('WebClient', {
      userPoolClientName: 'dice-roller-web',
      authFlows: {
        userSrp: true,         // Secure Remote Password — standard for SPAs
        userPassword: false,    // Do not enable plain-text password auth
      },
      generateSecret: false,   // SPA cannot keep a secret
      preventUserExistenceErrors: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          'http://localhost:5173',
          'http://localhost:4173',
          'https://diceroller.oldforest.net',
        ],
        logoutUrls: [
          'http://localhost:5173',
          'http://localhost:4173',
          'https://diceroller.oldforest.net',
        ],
      },
      // Token validity
      idTokenValidity: cdk.Duration.hours(1),
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      enableTokenRevocation: true,
    });

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(scope, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'DiceRollerUserPoolId',
    });

    new cdk.CfnOutput(scope, 'UserPoolClientId', {
      value: this.webClient.userPoolClientId,
      description: 'Cognito User Pool Web Client ID',
      exportName: 'DiceRollerUserPoolClientId',
    });

    new cdk.CfnOutput(scope, 'UserPoolProviderUrl', {
      value: this.userPool.userPoolProviderUrl,
      description: 'Cognito User Pool provider URL (issuer for JWT validation)',
    });
  }
}
