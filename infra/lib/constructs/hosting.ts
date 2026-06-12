import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';

const DOMAIN      = 'diceroller.oldforest.net';
const ROOT_DOMAIN = 'oldforest.net';

export class DiceRollerHosting extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // ── Hosted zone lookup ────────────────────────────────────────────────
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: ROOT_DOMAIN,
    });

    // ── ACM certificate (must be us-east-1 for CloudFront) ────────────────
    // If your stack is NOT in us-east-1, move this to a separate us-east-1 stack
    // and pass the certificateArn in as a prop.
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: DOMAIN,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ── S3 bucket (private, versioned) ────────────────────────────────────
    this.bucket = new s3.Bucket(this, 'AssetsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // ── CloudFront distribution with OAC + custom domain ─────────────────
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: [DOMAIN],
      certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      defaultRootObject: 'index.html',
      // SPA routing: any 403/404 from S3 → serve index.html with 200
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.seconds(0) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.seconds(0) },
      ],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // ── Route53 A record → CloudFront ────────────────────────────────────
    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: 'diceroller',
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(this.distribution),
      ),
    });

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(scope, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket for SPA assets',
    });

    new cdk.CfnOutput(scope, 'CloudFrontUrl', {
      value: `https://${DOMAIN}`,
      description: 'Custom domain URL',
      exportName: 'DiceRollerCloudFrontUrl',
    });

    new cdk.CfnOutput(scope, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID (needed for cache invalidation on deploy)',
    });
  }
}
