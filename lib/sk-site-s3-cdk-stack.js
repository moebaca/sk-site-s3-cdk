#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkSiteS3CdkStack = void 0;
const route53 = require("aws-cdk-lib/aws-route53");
const lambda = require("aws-cdk-lib/aws-lambda");
const aws_s3_1 = require("aws-cdk-lib/aws-s3");
const ssm = require("aws-cdk-lib/aws-ssm");
const sns = require("aws-cdk-lib/aws-sns");
const subs = require("aws-cdk-lib/aws-sns-subscriptions");
const acm = require("aws-cdk-lib/aws-certificatemanager");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const s3deploy = require("aws-cdk-lib/aws-s3-deployment");
const targets = require("aws-cdk-lib/aws-route53-targets");
const aws_cloudfront_origins_1 = require("aws-cdk-lib/aws-cloudfront-origins");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const iam = require("aws-cdk-lib/aws-iam");
const customResources = require("aws-cdk-lib/custom-resources");
const constructs_1 = require("constructs");
const aws_iam_1 = require("aws-cdk-lib/aws-iam");
var shell = require('shelljs');
/**
 * Static site infrastructure, which deploys site content to an S3 bucket origin fronted by CloudFront.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution, Route53 alias record,
 * and ACM certificate. Contact form logic infrastrucure is also provided using SNS, Lambda&Edge and SSM.
 */
class SkSiteS3CdkStack extends constructs_1.Construct {
    constructor(parent, name, props) {
        super(parent, name);
        const domainName = props.domainName;
        const emailAddr = props.emailAddr;
        const captchaSecret = props.captchaSecret;
        if (!shell.which('git')) {
            shell.echo('Sorry, this deployment requires git installed on the local machine.');
            shell.exit(1);
        }
        if (shell.ls('stephen-krawczyk-site').code !== 0) {
            shell.exec('git clone https://github.com/moebaca/stephen-krawczyk-site.git');
        }
        // Requires you own the domain name passed as param and hosted zone exists in R53
        const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: domainName });
        const cloudfrontOAI = new cloudfront.OriginAccessIdentity(this, 'cloudfront-OAI', {
            comment: `OAI for ${name}`
        });
        new aws_cdk_lib_1.CfnOutput(this, 'Site', { value: 'https://' + domainName });
        // S3 site content bucket
        const siteBucket = new aws_s3_1.Bucket(this, 'SiteBucket', {
            bucketName: domainName,
            publicReadAccess: false,
            blockPublicAccess: aws_s3_1.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });
        // Grant S3 bucket access to CloudFront
        siteBucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: ['s3:GetObject'],
            resources: [siteBucket.arnForObjects('*')],
            principals: [new iam.CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
        }));
        new aws_cdk_lib_1.CfnOutput(this, 'Bucket', { value: siteBucket.bucketName });
        // TLS certificate for use with website
        const certificate = new acm.DnsValidatedCertificate(this, 'SiteCertificate', {
            domainName: domainName,
            subjectAlternativeNames: [
                '*.' + domainName
            ],
            hostedZone: zone,
            region: 'us-east-1',
        });
        new aws_cdk_lib_1.CfnOutput(this, 'Certificate', { value: certificate.certificateArn });
        // Create new SNS Topic
        const topic = new sns.Topic(this, `ContactSNSTopic`, { displayName: 'SK Website Contact Form Entry' });
        // Creates a parameter in SSM Parameter Store which is required in the Lambda JS code
        const ssmTopicParam = new ssm.StringParameter(this, 'SKSiteSNSTopicARN', {
            parameterName: '/sksite/sns/contact-form-topic-arn',
            description: 'SNS Topic ARN for contact form SNS Topic',
            stringValue: topic.topicArn,
            type: ssm.ParameterType.STRING
        });
        // Creates a parameter in SSM Parameter Store which is required in the Lambda JS code
        const captchaSSMPath = '/sksite/captcha-secret-key';
        const ssmCaptchaParam = new ssm.StringParameter(this, 'SKSiteCAPTCHASecret', {
            parameterName: '/sksite/captcha-secret-key',
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
                    Name: '/sksite/captcha-secret-key',
                    Overwrite: true,
                    Type: 'SecureString',
                    Value: captchaSecret
                },
                physicalResourceId: customResources.PhysicalResourceId.of('/sksite/captcha-secret-key'),
            }
        });
        // Add email subscription to SNS Topic
        topic.addSubscription(new subs.EmailSubscription(emailAddr));
        // Policy attached to Lambda Execution Role to allow SSM + SNS interaction in JS code
        const lambdaPolicyStatement = new aws_iam_1.PolicyStatement({
            resources: [topic.topicArn, ssmTopicParam.parameterArn, ssmCaptchaParam.parameterArn],
            actions: ['sns:Publish', 'ssm:GetParameter']
        });
        // Lambda@Edge function needed for the Contact Form submission processing
        const edgeFunc = new cloudfront.experimental.EdgeFunction(this, 'ContactFormFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('assets'),
            initialPolicy: [lambdaPolicyStatement]
        });
        // CloudFront distribution instantiation with added Lambda&Edge behavior
        const s3Origin = new aws_cloudfront_origins_1.S3Origin(siteBucket, { originAccessIdentity: cloudfrontOAI });
        const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
            certificate: certificate,
            defaultRootObject: "index.html",
            domainNames: [
                domainName,
                '*.' + domainName // Allow all sub-domains
            ],
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
            errorResponses: [
                {
                    httpStatus: 403,
                    responseHttpStatus: 403,
                    responsePagePath: '/error.html',
                    ttl: aws_cdk_lib_1.Duration.minutes(30),
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
        new aws_cdk_lib_1.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
        // Route53 alias record for the CloudFront distribution
        const apexRecord = new route53.ARecord(this, 'SiteAliasRecord', {
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
exports.SkSiteS3CdkStack = SkSiteS3CdkStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2stc2l0ZS1zMy1jZGstc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzay1zaXRlLXMzLWNkay1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7O0FBQ0EsbURBQW1EO0FBQ25ELGlEQUFpRDtBQUNqRCwrQ0FBK0Q7QUFDL0QsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQywwREFBMEQ7QUFDMUQsMERBQTBEO0FBQzFELHlEQUF5RDtBQUN6RCwwREFBMEQ7QUFDMUQsMkRBQTJEO0FBQzNELCtFQUE4RDtBQUM5RCw2Q0FBd0U7QUFDeEUsMkNBQTJDO0FBQzNDLGdFQUFnRTtBQUNoRSwyQ0FBdUM7QUFDdkMsaURBQXNEO0FBRXRELElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztBQVEvQjs7Ozs7R0FLRztBQUNILE1BQWEsZ0JBQWlCLFNBQVEsc0JBQVM7SUFDN0MsWUFBWSxNQUFhLEVBQUUsSUFBWSxFQUFFLEtBQXVCO1FBQzlELEtBQUssQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFcEIsTUFBTSxVQUFVLEdBQVcsS0FBSyxDQUFDLFVBQVUsQ0FBQztRQUM1QyxNQUFNLFNBQVMsR0FBVyxLQUFLLENBQUMsU0FBUyxDQUFDO1FBQzFDLE1BQU0sYUFBYSxHQUFXLEtBQUssQ0FBQyxhQUFhLENBQUM7UUFFbEQsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDckIsS0FBSyxDQUFDLElBQUksQ0FBQyxxRUFBcUUsQ0FBQyxDQUFDO1lBQ2xGLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDakI7UUFFRCxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxFQUFFO1lBQzlDLEtBQUssQ0FBQyxJQUFJLENBQUMsZ0VBQWdFLENBQUMsQ0FBQztTQUNoRjtRQUVELGlGQUFpRjtRQUNqRixN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dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBCdWNrZXQsIEJsb2NrUHVibGljQWNjZXNzIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIHNzbSBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3NtJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIHN1YnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucy1zdWJzY3JpcHRpb25zJztcbmltcG9ydCAqIGFzIGFjbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2VydGlmaWNhdGVtYW5hZ2VyJztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xuaW1wb3J0ICogYXMgczNkZXBsb3kgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLWRlcGxveW1lbnQnO1xuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1My10YXJnZXRzJztcbmltcG9ydCB7IFMzT3JpZ2luIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XG5pbXBvcnQgeyBDZm5PdXRwdXQsIER1cmF0aW9uLCBSZW1vdmFsUG9saWN5LCBTdGFjayB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGN1c3RvbVJlc291cmNlcyBmcm9tICdhd3MtY2RrLWxpYi9jdXN0b20tcmVzb3VyY2VzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgUG9saWN5U3RhdGVtZW50IH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5cbnZhciBzaGVsbCA9IHJlcXVpcmUoJ3NoZWxsanMnKTtcblxuZXhwb3J0IGludGVyZmFjZSBTa1NpdGVTM0Nka1Byb3BzIHtcbiAgZG9tYWluTmFtZTogc3RyaW5nO1xuICBlbWFpbEFkZHI6IHN0cmluZztcbiAgY2FwdGNoYVNlY3JldDogc3RyaW5nO1xufVxuXG4vKipcbiAqIFN0YXRpYyBzaXRlIGluZnJhc3RydWN0dXJlLCB3aGljaCBkZXBsb3lzIHNpdGUgY29udGVudCB0byBhbiBTMyBidWNrZXQgb3JpZ2luIGZyb250ZWQgYnkgQ2xvdWRGcm9udC5cbiAqXG4gKiBUaGUgc2l0ZSByZWRpcmVjdHMgZnJvbSBIVFRQIHRvIEhUVFBTLCB1c2luZyBhIENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uLCBSb3V0ZTUzIGFsaWFzIHJlY29yZCwgXG4gKiBhbmQgQUNNIGNlcnRpZmljYXRlLiBDb250YWN0IGZvcm0gbG9naWMgaW5mcmFzdHJ1Y3VyZSBpcyBhbHNvIHByb3ZpZGVkIHVzaW5nIFNOUywgTGFtYmRhJkVkZ2UgYW5kIFNTTS5cbiAqL1xuZXhwb3J0IGNsYXNzIFNrU2l0ZVMzQ2RrU3RhY2sgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBjb25zdHJ1Y3RvcihwYXJlbnQ6IFN0YWNrLCBuYW1lOiBzdHJpbmcsIHByb3BzOiBTa1NpdGVTM0Nka1Byb3BzKSB7XG4gICAgc3VwZXIocGFyZW50LCBuYW1lKTtcblxuICAgIGNvbnN0IGRvbWFpbk5hbWU6IHN0cmluZyA9IHByb3BzLmRvbWFpbk5hbWU7XG4gICAgY29uc3QgZW1haWxBZGRyOiBzdHJpbmcgPSBwcm9wcy5lbWFpbEFkZHI7XG4gICAgY29uc3QgY2FwdGNoYVNlY3JldDogc3RyaW5nID0gcHJvcHMuY2FwdGNoYVNlY3JldDtcblxuICAgIGlmICghc2hlbGwud2hpY2goJ2dpdCcpKSB7XG4gICAgICAgIHNoZWxsLmVjaG8oJ1NvcnJ5LCB0aGlzIGRlcGxveW1lbnQgcmVxdWlyZXMgZ2l0IGluc3RhbGxlZCBvbiB0aGUgbG9jYWwgbWFjaGluZS4nKTtcbiAgICAgICAgc2hlbGwuZXhpdCgxKTtcbiAgICB9XG5cbiAgICBpZiAoc2hlbGwubHMoJ3N0ZXBoZW4ta3Jhd2N6eWstc2l0ZScpLmNvZGUgIT09IDApIHtcbiAgICAgICAgc2hlbGwuZXhlYygnZ2l0IGNsb25lIGh0dHBzOi8vZ2l0aHViLmNvbS9tb2ViYWNhL3N0ZXBoZW4ta3Jhd2N6eWstc2l0ZS5naXQnKTtcbiAgICB9XG5cbiAgICAvLyBSZXF1aXJlcyB5b3Ugb3duIHRoZSBkb21haW4gbmFtZSBwYXNzZWQgYXMgcGFyYW0gYW5kIGhvc3RlZCB6b25lIGV4aXN0cyBpbiBSNTNcbiAgICBjb25zdCB6b25lOiByb3V0ZTUzLklIb3N0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Mb29rdXAodGhpcywgJ1pvbmUnLCB7IGRvbWFpbk5hbWU6IGRvbWFpbk5hbWUgfSk7XG4gICAgY29uc3QgY2xvdWRmcm9udE9BSTogY2xvdWRmcm9udC5PcmlnaW5BY2Nlc3NJZGVudGl0eSA9IG5ldyBjbG91ZGZyb250Lk9yaWdpbkFjY2Vzc0lkZW50aXR5KHRoaXMsICdjbG91ZGZyb250LU9BSScsIHtcbiAgICAgIGNvbW1lbnQ6IGBPQUkgZm9yICR7bmFtZX1gXG4gICAgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnU2l0ZScsIHsgdmFsdWU6ICdodHRwczovLycgKyBkb21haW5OYW1lIH0pO1xuXG4gICAgLy8gUzMgc2l0ZSBjb250ZW50IGJ1Y2tldFxuICAgIGNvbnN0IHNpdGVCdWNrZXQ6IEJ1Y2tldCA9IG5ldyBCdWNrZXQodGhpcywgJ1NpdGVCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBkb21haW5OYW1lLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBTMyBidWNrZXQgYWNjZXNzIHRvIENsb3VkRnJvbnRcbiAgICBzaXRlQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydzMzpHZXRPYmplY3QnXSxcbiAgICAgIHJlc291cmNlczogW3NpdGVCdWNrZXQuYXJuRm9yT2JqZWN0cygnKicpXSxcbiAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkNhbm9uaWNhbFVzZXJQcmluY2lwYWwoY2xvdWRmcm9udE9BSS5jbG91ZEZyb250T3JpZ2luQWNjZXNzSWRlbnRpdHlTM0Nhbm9uaWNhbFVzZXJJZCldXG4gICAgfSkpO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0J1Y2tldCcsIHsgdmFsdWU6IHNpdGVCdWNrZXQuYnVja2V0TmFtZSB9KTtcblxuICAgIC8vIFRMUyBjZXJ0aWZpY2F0ZSBmb3IgdXNlIHdpdGggd2Vic2l0ZVxuICAgIGNvbnN0IGNlcnRpZmljYXRlOiBhY20uRG5zVmFsaWRhdGVkQ2VydGlmaWNhdGUgPSBuZXcgYWNtLkRuc1ZhbGlkYXRlZENlcnRpZmljYXRlKHRoaXMsICdTaXRlQ2VydGlmaWNhdGUnLCB7XG4gICAgICBkb21haW5OYW1lOiBkb21haW5OYW1lLFxuICAgICAgc3ViamVjdEFsdGVybmF0aXZlTmFtZXM6IFtcbiAgICAgICAgJyouJyArIGRvbWFpbk5hbWVcbiAgICAgIF0sXG4gICAgICBob3N0ZWRab25lOiB6b25lLFxuICAgICAgcmVnaW9uOiAndXMtZWFzdC0xJywgXG4gICAgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnQ2VydGlmaWNhdGUnLCB7IHZhbHVlOiBjZXJ0aWZpY2F0ZS5jZXJ0aWZpY2F0ZUFybiB9KTsgICAgXG4gICAgXG4gICAgLy8gQ3JlYXRlIG5ldyBTTlMgVG9waWNcbiAgICBjb25zdCB0b3BpYzogc25zLlRvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCBgQ29udGFjdFNOU1RvcGljYCwge2Rpc3BsYXlOYW1lOiAnU0sgV2Vic2l0ZSBDb250YWN0IEZvcm0gRW50cnknfSk7XG5cbiAgICAvLyBDcmVhdGVzIGEgcGFyYW1ldGVyIGluIFNTTSBQYXJhbWV0ZXIgU3RvcmUgd2hpY2ggaXMgcmVxdWlyZWQgaW4gdGhlIExhbWJkYSBKUyBjb2RlXG4gICAgY29uc3Qgc3NtVG9waWNQYXJhbTogc3NtLlN0cmluZ1BhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdTS1NpdGVTTlNUb3BpY0FSTicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6ICcvc2tzaXRlL3Nucy9jb250YWN0LWZvcm0tdG9waWMtYXJuJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU05TIFRvcGljIEFSTiBmb3IgY29udGFjdCBmb3JtIFNOUyBUb3BpYycsXG4gICAgICBzdHJpbmdWYWx1ZTogdG9waWMudG9waWNBcm4sXG4gICAgICB0eXBlOiBzc20uUGFyYW1ldGVyVHlwZS5TVFJJTkdcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZXMgYSBwYXJhbWV0ZXIgaW4gU1NNIFBhcmFtZXRlciBTdG9yZSB3aGljaCBpcyByZXF1aXJlZCBpbiB0aGUgTGFtYmRhIEpTIGNvZGVcbiAgICBjb25zdCBjYXB0Y2hhU1NNUGF0aDogc3RyaW5nID0gJy9za3NpdGUvY2FwdGNoYS1zZWNyZXQta2V5JztcbiAgICBjb25zdCBzc21DYXB0Y2hhUGFyYW06IHNzbS5TdHJpbmdQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnU0tTaXRlQ0FQVENIQVNlY3JldCcsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6ICcvc2tzaXRlL2NhcHRjaGEtc2VjcmV0LWtleScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NhcHRjaGEgU2VjcmV0IEtleScsXG4gICAgICBzdHJpbmdWYWx1ZTogY2FwdGNoYVNlY3JldCxcbiAgICAgIHR5cGU6IHNzbS5QYXJhbWV0ZXJUeXBlLlNUUklOR1xuICAgIH0pO1xuXG4gICAgLy8gUmVxdWlyZWQgZm9yIFNlY3VyZVN0cmluZ1xuICAgIG5ldyBjdXN0b21SZXNvdXJjZXMuQXdzQ3VzdG9tUmVzb3VyY2UodGhpcywgJ0NBUFRDSEFTZWN1cmVTdHJpbmcnLCB7XG4gICAgICBwb2xpY3k6IGN1c3RvbVJlc291cmNlcy5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5mcm9tU2RrQ2FsbHMoe1xuICAgICAgICByZXNvdXJjZXM6IGN1c3RvbVJlc291cmNlcy5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5BTllfUkVTT1VSQ0UsXG4gICAgICB9KSxcbiAgICAgIG9uQ3JlYXRlOiB7XG4gICAgICAgIHNlcnZpY2U6ICdTU00nLFxuICAgICAgICBhY3Rpb246ICdwdXRQYXJhbWV0ZXInLFxuICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgTmFtZTogJy9za3NpdGUvY2FwdGNoYS1zZWNyZXQta2V5JyxcbiAgICAgICAgICBPdmVyd3JpdGU6IHRydWUsXG4gICAgICAgICAgVHlwZTogJ1NlY3VyZVN0cmluZycsXG4gICAgICAgICAgVmFsdWU6IGNhcHRjaGFTZWNyZXRcbiAgICAgICAgfSxcbiAgICAgICAgcGh5c2ljYWxSZXNvdXJjZUlkOiBjdXN0b21SZXNvdXJjZXMuUGh5c2ljYWxSZXNvdXJjZUlkLm9mKCcvc2tzaXRlL2NhcHRjaGEtc2VjcmV0LWtleScpLFxuICAgICAgfVxuICAgIH0pOyAgICAgIFxuXG4gICAgLy8gQWRkIGVtYWlsIHN1YnNjcmlwdGlvbiB0byBTTlMgVG9waWNcbiAgICB0b3BpYy5hZGRTdWJzY3JpcHRpb24obmV3IHN1YnMuRW1haWxTdWJzY3JpcHRpb24oZW1haWxBZGRyKSk7XG5cbiAgICAvLyBQb2xpY3kgYXR0YWNoZWQgdG8gTGFtYmRhIEV4ZWN1dGlvbiBSb2xlIHRvIGFsbG93IFNTTSArIFNOUyBpbnRlcmFjdGlvbiBpbiBKUyBjb2RlXG4gICAgY29uc3QgbGFtYmRhUG9saWN5U3RhdGVtZW50OiBQb2xpY3lTdGF0ZW1lbnQgPSBuZXcgUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIHJlc291cmNlczogW3RvcGljLnRvcGljQXJuLCBzc21Ub3BpY1BhcmFtLnBhcmFtZXRlckFybiwgc3NtQ2FwdGNoYVBhcmFtLnBhcmFtZXRlckFybl0sXG4gICAgICBhY3Rpb25zOiBbJ3NuczpQdWJsaXNoJywgJ3NzbTpHZXRQYXJhbWV0ZXInXSBcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYUBFZGdlIGZ1bmN0aW9uIG5lZWRlZCBmb3IgdGhlIENvbnRhY3QgRm9ybSBzdWJtaXNzaW9uIHByb2Nlc3NpbmdcbiAgICBjb25zdCBlZGdlRnVuYzogY2xvdWRmcm9udC5leHBlcmltZW50YWwuRWRnZUZ1bmN0aW9uID0gXG4gICAgICBuZXcgY2xvdWRmcm9udC5leHBlcmltZW50YWwuRWRnZUZ1bmN0aW9uKHRoaXMsICdDb250YWN0Rm9ybUZ1bmN0aW9uJywge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2Fzc2V0cycpLFxuICAgICAgICBpbml0aWFsUG9saWN5OiBbbGFtYmRhUG9saWN5U3RhdGVtZW50XVxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRGcm9udCBkaXN0cmlidXRpb24gaW5zdGFudGlhdGlvbiB3aXRoIGFkZGVkIExhbWJkYSZFZGdlIGJlaGF2aW9yXG4gICAgY29uc3QgczNPcmlnaW46IFMzT3JpZ2luID0gbmV3IFMzT3JpZ2luKHNpdGVCdWNrZXQsIHtvcmlnaW5BY2Nlc3NJZGVudGl0eTogY2xvdWRmcm9udE9BSX0pO1xuICAgIGNvbnN0IGRpc3RyaWJ1dGlvbjogY2xvdWRmcm9udC5EaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ1NpdGVEaXN0cmlidXRpb24nLCB7XG4gICAgICBjZXJ0aWZpY2F0ZTogY2VydGlmaWNhdGUsXG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogXCJpbmRleC5odG1sXCIsXG4gICAgICBkb21haW5OYW1lczogW1xuICAgICAgICBkb21haW5OYW1lLCBcbiAgICAgICAgJyouJyArIGRvbWFpbk5hbWUgLy8gQWxsb3cgYWxsIHN1Yi1kb21haW5zXG4gICAgICBdLFxuICAgICAgbWluaW11bVByb3RvY29sVmVyc2lvbjogY2xvdWRmcm9udC5TZWN1cml0eVBvbGljeVByb3RvY29sLlRMU19WMV8yXzIwMjEsXG4gICAgICBlcnJvclJlc3BvbnNlczpbXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDMsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiA0MDMsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9lcnJvci5odG1sJyxcbiAgICAgICAgICB0dGw6IER1cmF0aW9uLm1pbnV0ZXMoMzApLFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogczNPcmlnaW4sXG4gICAgICAgIGNvbXByZXNzOiB0cnVlLFxuICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19HRVRfSEVBRF9PUFRJT05TLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgIH0sXG4gICAgICBhZGRpdGlvbmFsQmVoYXZpb3JzOiB7XG4gICAgICAgICcvc3VibWl0Rm9ybSc6IHtcbiAgICAgICAgICBvcmlnaW46IHMzT3JpZ2luLFxuICAgICAgICAgIGVkZ2VMYW1iZGFzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGZ1bmN0aW9uVmVyc2lvbjogZWRnZUZ1bmMuY3VycmVudFZlcnNpb24sXG4gICAgICAgICAgICAgIGV2ZW50VHlwZTogY2xvdWRmcm9udC5MYW1iZGFFZGdlRXZlbnRUeXBlLlZJRVdFUl9SRVFVRVNULFxuICAgICAgICAgICAgICBpbmNsdWRlQm9keTogdHJ1ZVxuICAgICAgICAgICAgfVxuICAgICAgICAgIF0sICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0FMTCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBnZW9SZXN0cmljdGlvbjogY2xvdWRmcm9udC5HZW9SZXN0cmljdGlvbi5kZW55bGlzdCgnUlUnLCAnU0cnLCAnQUUnKVxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRGlzdHJpYnV0aW9uSWQnLCB7IHZhbHVlOiBkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uSWQgfSk7XG5cbiAgICAvLyBSb3V0ZTUzIGFsaWFzIHJlY29yZCBmb3IgdGhlIENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uXG4gICAgY29uc3QgYXBleFJlY29yZDogcm91dGU1My5BUmVjb3JkID0gbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnU2l0ZUFsaWFzUmVjb3JkJywge1xuICAgICAgcmVjb3JkTmFtZTogZG9tYWluTmFtZSxcbiAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKG5ldyB0YXJnZXRzLkNsb3VkRnJvbnRUYXJnZXQoZGlzdHJpYnV0aW9uKSksXG4gICAgICB6b25lXG4gICAgfSk7XG5cbiAgICAvLyBSb3V0ZTUzIGFsaWFzIHJlY29yZCBmb3IgdGhlIENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uXG4gICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnV1dXQXBleFJlY29yZEFsaWFzJywge1xuICAgICAgICByZWNvcmROYW1lOiAnd3d3LicgKyBkb21haW5OYW1lLFxuICAgICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhuZXcgdGFyZ2V0cy5Sb3V0ZTUzUmVjb3JkVGFyZ2V0KGFwZXhSZWNvcmQpKSxcbiAgICAgICAgem9uZVxuICAgIH0pO1xuXG4gICAgLy8gRGVwbG95IHNpdGUgY29udGVudHMgdG8gUzMgYnVja2V0XG4gICAgbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcywgJ0RlcGxveVdpdGhJbnZhbGlkYXRpb24nLCB7XG4gICAgICBzb3VyY2VzOiBbczNkZXBsb3kuU291cmNlLmFzc2V0KCcuL3N0ZXBoZW4ta3Jhd2N6eWstc2l0ZScpXSxcbiAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiBzaXRlQnVja2V0LFxuICAgICAgZGlzdHJpYnV0aW9uLFxuICAgICAgZGlzdHJpYnV0aW9uUGF0aHM6IFsnLyonXSxcbiAgICB9KTtcbiAgfVxufSJdfQ==