#!/usr/bin/env node
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as customResources from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

var shell = require('shelljs');

export interface SkSiteS3CdkProps {
  domainName: string;
  emailAddr: string;
  captchaSecret: string;
}

/**
 * Static site infrastructure, which deploys site content to an S3 bucket origin fronted by CloudFront.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution, Route53 alias record, 
 * and ACM certificate. Contact form logic infrastrucure is also provided using SNS, Lambda&Edge and SSM.
 */
export class SkSiteS3CdkStack extends Construct {
  constructor(parent: Stack, name: string, props: SkSiteS3CdkProps) {
    super(parent, name);

    const domainName: string = props.domainName;
    const emailAddr: string = props.emailAddr;
    const captchaSecret: string = props.captchaSecret;

    // Current hack - I want to be able to use stephen-krawczyk-site in multiple CDK applications for fun
    // and therefore I am not bundling the assets into this CDK project. The code below clones the stephen-krawczyk-site
    // HTML assets for upload to S3.
    if (!shell.which('git')) {
        shell.echo('Sorry, this deployment requires git installed on the local machine.');
        shell.exit(1);
    }

    if (shell.ls('stephen-krawczyk-site').code !== 0) {
        shell.exec('git clone https://github.com/moebaca/stephen-krawczyk-site.git');
    }

    // Requires you own the domain name passed as param and hosted zone exists in R53
    const zone: route53.IHostedZone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: domainName });

    // Create Origin Access Identity
    const cloudfrontOAI: cloudfront.OriginAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'cloudfront-OAI', {
      comment: `OAI for ${name}`
    });
    new CfnOutput(this, 'Site', { value: 'https://' + domainName });

    // S3 site content bucket
    const siteBucket: Bucket = new Bucket(this, 'SiteBucket', {
      bucketName: domainName,
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Grant S3 bucket access to CloudFront
    siteBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [siteBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
    }));
    new CfnOutput(this, 'Bucket', { value: siteBucket.bucketName });

    // TLS certificate for use with website
    const certificate: acm.DnsValidatedCertificate = new acm.DnsValidatedCertificate(this, 'SiteCertificate', {
      domainName: domainName,
      subjectAlternativeNames: [
        '*.' + domainName
      ],
      hostedZone: zone,
      region: 'us-east-1', 
    });
    new CfnOutput(this, 'Certificate', { value: certificate.certificateArn });    
    
    // Create new SNS Topic
    const topic: sns.Topic = new sns.Topic(this, `ContactSNSTopic`, {displayName: 'SK Website Contact Form Entry'});

    // Creates a parameter in SSM Parameter Store which is required in the Lambda JS code
    const ssmTopicParam: ssm.StringParameter = new ssm.StringParameter(this, 'SKSiteSNSTopicARN', {
      parameterName: '/sksite/sns/contact-form-topic-arn',
      description: 'SNS Topic ARN for contact form SNS Topic',
      stringValue: topic.topicArn,
      type: ssm.ParameterType.STRING
    });

    // Creates a parameter in SSM Parameter Store which is required in the Lambda JS code
    const captchaSSMPath: string = '/sksite/captcha-secret-key';
    const ssmCaptchaParam: ssm.StringParameter = new ssm.StringParameter(this, 'SKSiteCAPTCHASecret', {
      parameterName: captchaSSMPath,
      description: 'Captcha Secret Key',
      stringValue: captchaSecret,
      type: ssm.ParameterType.STRING
    });

    // Required for SecureString
    new customResources.AwsCustomResource(this, 'CAPTCHASecureString', {
      policy: customResources.AwsCustomResourcePolicy.fromSdkCalls({
        resources: customResources.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      onCreate: {
        service: 'SSM',
        action: 'putParameter',
        parameters: {
          Name: captchaSSMPath,
          Overwrite: true,
          Type: 'SecureString',
          Value: captchaSecret
        },
        physicalResourceId: customResources.PhysicalResourceId.of(captchaSSMPath),
      }
    });      

    // Add email subscription to SNS Topic
    topic.addSubscription(new subs.EmailSubscription(emailAddr));

    // Policy attached to Lambda Execution Role to allow SSM + SNS interaction in JS code
    const lambdaPolicyStatement: PolicyStatement = new PolicyStatement({
      resources: [topic.topicArn, ssmTopicParam.parameterArn, ssmCaptchaParam.parameterArn],
      actions: ['sns:Publish', 'ssm:GetParameter'] 
    });

    // Lambda@Edge function needed for the Contact Form submission processing
    const edgeFunc: cloudfront.experimental.EdgeFunction = 
      new cloudfront.experimental.EdgeFunction(this, 'ContactFormFunction', {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset('assets'),
        initialPolicy: [lambdaPolicyStatement]
    });

    // CloudFront distribution instantiation with added Lambda&Edge behavior
    const s3Origin: S3Origin = new S3Origin(siteBucket, {originAccessIdentity: cloudfrontOAI});
    const distribution: cloudfront.Distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      certificate: certificate,
      defaultRootObject: "index.html",
      domainNames: [
        domainName, 
        '*.' + domainName // Allow all sub-domains
      ],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      errorResponses:[
        {
          httpStatus: 403,
          responseHttpStatus: 403,
          responsePagePath: '/error.html',
          ttl: Duration.minutes(30),
        }
      ],
      defaultBehavior: {
        origin: s3Origin,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        '/submitForm': {
          origin: s3Origin,
          edgeLambdas: [
            {
              functionVersion: edgeFunc.currentVersion,
              eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
              includeBody: true
            }
          ],                      
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
      geoRestriction: cloudfront.GeoRestriction.denylist('RU', 'SG', 'AE')
    });

    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });

    // Route53 alias record for the CloudFront distribution
    const apexRecord: route53.ARecord = new route53.ARecord(this, 'SiteAliasRecord', {
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone
    });

    // Route53 alias record for the CloudFront distribution
    new route53.ARecord(this, 'WWWApexRecordAlias', {
        recordName: 'www.' + domainName,
        target: route53.RecordTarget.fromAlias(new targets.Route53RecordTarget(apexRecord)),
        zone
    });

    // Deploy site contents to S3 bucket
    new s3deploy.BucketDeployment(this, 'DeployWithInvalidation', {
      sources: [s3deploy.Source.asset('./stephen-krawczyk-site')],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });
  }
}