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
        const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: domainName });
        // Create Origin Access Identity
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
        // Route53 alias record for site apex
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2stc2l0ZS1zMy1jZGstc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzay1zaXRlLXMzLWNkay1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7O0FBQ0EsbURBQW1EO0FBQ25ELGlEQUFpRDtBQUNqRCwrQ0FBK0Q7QUFDL0QsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQywwREFBMEQ7QUFDMUQsMERBQTBEO0FBQzFELHlEQUF5RDtBQUN6RCwwREFBMEQ7QUFDMUQsMkRBQTJEO0FBQzNELCtFQUE4RDtBQUM5RCw2Q0FBd0U7QUFDeEUsMkNBQTJDO0FBQzNDLGdFQUFnRTtBQUNoRSwyQ0FBdUM7QUFDdkMsaURBQXNEO0FBRXRELElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztBQVEvQjs7Ozs7R0FLRztBQUNILE1BQWEsZ0JBQWlCLFNBQVEsc0JBQVM7SUFDN0MsWUFBWSxNQUFhLEVBQUUsSUFBWSxFQUFFLEtBQXVCO1FBQzlELEtBQUssQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFcEIsTUFBTSxVQUFVLEdBQVcsS0FBSyxDQUFDLFVBQVUsQ0FBQztRQUM1QyxNQUFNLFNBQVMsR0FBVyxLQUFLLENBQUMsU0FBUyxDQUFDO1FBQzFDLE1BQU0sYUFBYSxHQUFXLEtBQUssQ0FBQyxhQUFhLENBQUM7UUFFbEQscUdBQXFHO1FBQ3JHLG9IQUFvSDtRQUNwSCxnQ0FBZ0M7UUFDaEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDckIsS0FBSyxDQUFDLElBQUksQ0FBQyxxRUFBcUUsQ0FBQyxDQUFDO1lBQ2xGLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDakI7UUFFRCxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxFQUFFO1lBQzlDLEtBQUssQ0FBQyxJQUFJLENBQUMsZ0VB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b250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIHJvdXRlNTMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJvdXRlNTMnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgQnVja2V0LCBCbG9ja1B1YmxpY0FjY2VzcyB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgKiBhcyBzdWJzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMtc3Vic2NyaXB0aW9ucyc7XG5pbXBvcnQgKiBhcyBhY20gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcbmltcG9ydCAqIGFzIHMzZGVwbG95IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMy1kZXBsb3ltZW50JztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJvdXRlNTMtdGFyZ2V0cyc7XG5pbXBvcnQgeyBTM09yaWdpbiB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xuaW1wb3J0IHsgQ2ZuT3V0cHV0LCBEdXJhdGlvbiwgUmVtb3ZhbFBvbGljeSwgU3RhY2sgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBjdXN0b21SZXNvdXJjZXMgZnJvbSAnYXdzLWNkay1saWIvY3VzdG9tLXJlc291cmNlcyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IFBvbGljeVN0YXRlbWVudCB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuXG52YXIgc2hlbGwgPSByZXF1aXJlKCdzaGVsbGpzJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2tTaXRlUzNDZGtQcm9wcyB7XG4gIGRvbWFpbk5hbWU6IHN0cmluZztcbiAgZW1haWxBZGRyOiBzdHJpbmc7XG4gIGNhcHRjaGFTZWNyZXQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBTdGF0aWMgc2l0ZSBpbmZyYXN0cnVjdHVyZSwgd2hpY2ggZGVwbG95cyBzaXRlIGNvbnRlbnQgdG8gYW4gUzMgYnVja2V0IG9yaWdpbiBmcm9udGVkIGJ5IENsb3VkRnJvbnQuXG4gKlxuICogVGhlIHNpdGUgcmVkaXJlY3RzIGZyb20gSFRUUCB0byBIVFRQUywgdXNpbmcgYSBDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiwgUm91dGU1MyBhbGlhcyByZWNvcmQsIFxuICogYW5kIEFDTSBjZXJ0aWZpY2F0ZS4gQ29udGFjdCBmb3JtIGxvZ2ljIGluZnJhc3RydWN1cmUgaXMgYWxzbyBwcm92aWRlZCB1c2luZyBTTlMsIExhbWJkYSZFZGdlIGFuZCBTU00uXG4gKi9cbmV4cG9ydCBjbGFzcyBTa1NpdGVTM0Nka1N0YWNrIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgY29uc3RydWN0b3IocGFyZW50OiBTdGFjaywgbmFtZTogc3RyaW5nLCBwcm9wczogU2tTaXRlUzNDZGtQcm9wcykge1xuICAgIHN1cGVyKHBhcmVudCwgbmFtZSk7XG5cbiAgICBjb25zdCBkb21haW5OYW1lOiBzdHJpbmcgPSBwcm9wcy5kb21haW5OYW1lO1xuICAgIGNvbnN0IGVtYWlsQWRkcjogc3RyaW5nID0gcHJvcHMuZW1haWxBZGRyO1xuICAgIGNvbnN0IGNhcHRjaGFTZWNyZXQ6IHN0cmluZyA9IHByb3BzLmNhcHRjaGFTZWNyZXQ7XG5cbiAgICAvLyBDdXJyZW50IGhhY2sgLSBJIHdhbnQgdG8gYmUgYWJsZSB0byB1c2Ugc3RlcGhlbi1rcmF3Y3p5ay1zaXRlIGluIG11bHRpcGxlIENESyBhcHBsaWNhdGlvbnMgZm9yIGZ1blxuICAgIC8vIGFuZCB0aGVyZWZvcmUgSSBhbSBub3QgYnVuZGxpbmcgdGhlIGFzc2V0cyBpbnRvIHRoaXMgQ0RLIHByb2plY3QuIFRoZSBjb2RlIGJlbG93IGNsb25lcyB0aGUgc3RlcGhlbi1rcmF3Y3p5ay1zaXRlXG4gICAgLy8gSFRNTCBhc3NldHMgZm9yIHVwbG9hZCB0byBTMy5cbiAgICBpZiAoIXNoZWxsLndoaWNoKCdnaXQnKSkge1xuICAgICAgICBzaGVsbC5lY2hvKCdTb3JyeSwgdGhpcyBkZXBsb3ltZW50IHJlcXVpcmVzIGdpdCBpbnN0YWxsZWQgb24gdGhlIGxvY2FsIG1hY2hpbmUuJyk7XG4gICAgICAgIHNoZWxsLmV4aXQoMSk7XG4gICAgfVxuXG4gICAgaWYgKHNoZWxsLmxzKCdzdGVwaGVuLWtyYXdjenlrLXNpdGUnKS5jb2RlICE9PSAwKSB7XG4gICAgICAgIHNoZWxsLmV4ZWMoJ2dpdCBjbG9uZSBodHRwczovL2dpdGh1Yi5jb20vbW9lYmFjYS9zdGVwaGVuLWtyYXdjenlrLXNpdGUuZ2l0Jyk7XG4gICAgfVxuXG4gICAgLy8gUmVxdWlyZXMgeW91IG93biB0aGUgZG9tYWluIG5hbWUgcGFzc2VkIGFzIHBhcmFtIGFuZCBob3N0ZWQgem9uZSBleGlzdHMgaW4gUjUzXG4gICAgY29uc3Qgem9uZTogcm91dGU1My5JSG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tTG9va3VwKHRoaXMsICdab25lJywgeyBkb21haW5OYW1lOiBkb21haW5OYW1lIH0pO1xuXG4gICAgLy8gQ3JlYXRlIE9yaWdpbiBBY2Nlc3MgSWRlbnRpdHlcbiAgICBjb25zdCBjbG91ZGZyb250T0FJOiBjbG91ZGZyb250Lk9yaWdpbkFjY2Vzc0lkZW50aXR5ID0gbmV3IGNsb3VkZnJvbnQuT3JpZ2luQWNjZXNzSWRlbnRpdHkodGhpcywgJ2Nsb3VkZnJvbnQtT0FJJywge1xuICAgICAgY29tbWVudDogYE9BSSBmb3IgJHtuYW1lfWBcbiAgICB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdTaXRlJywgeyB2YWx1ZTogJ2h0dHBzOi8vJyArIGRvbWFpbk5hbWUgfSk7XG5cbiAgICAvLyBTMyBzaXRlIGNvbnRlbnQgYnVja2V0XG4gICAgY29uc3Qgc2l0ZUJ1Y2tldDogQnVja2V0ID0gbmV3IEJ1Y2tldCh0aGlzLCAnU2l0ZUJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGRvbWFpbk5hbWUsXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiBmYWxzZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBCbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IFMzIGJ1Y2tldCBhY2Nlc3MgdG8gQ2xvdWRGcm9udFxuICAgIHNpdGVCdWNrZXQuYWRkVG9SZXNvdXJjZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ3MzOkdldE9iamVjdCddLFxuICAgICAgcmVzb3VyY2VzOiBbc2l0ZUJ1Y2tldC5hcm5Gb3JPYmplY3RzKCcqJyldLFxuICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQ2Fub25pY2FsVXNlclByaW5jaXBhbChjbG91ZGZyb250T0FJLmNsb3VkRnJvbnRPcmlnaW5BY2Nlc3NJZGVudGl0eVMzQ2Fub25pY2FsVXNlcklkKV1cbiAgICB9KSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnQnVja2V0JywgeyB2YWx1ZTogc2l0ZUJ1Y2tldC5idWNrZXROYW1lIH0pO1xuXG4gICAgLy8gVExTIGNlcnRpZmljYXRlIGZvciB1c2Ugd2l0aCB3ZWJzaXRlXG4gICAgY29uc3QgY2VydGlmaWNhdGU6IGFjbS5EbnNWYWxpZGF0ZWRDZXJ0aWZpY2F0ZSA9IG5ldyBhY20uRG5zVmFsaWRhdGVkQ2VydGlmaWNhdGUodGhpcywgJ1NpdGVDZXJ0aWZpY2F0ZScsIHtcbiAgICAgIGRvbWFpbk5hbWU6IGRvbWFpbk5hbWUsXG4gICAgICBzdWJqZWN0QWx0ZXJuYXRpdmVOYW1lczogW1xuICAgICAgICAnKi4nICsgZG9tYWluTmFtZVxuICAgICAgXSxcbiAgICAgIGhvc3RlZFpvbmU6IHpvbmUsXG4gICAgICByZWdpb246ICd1cy1lYXN0LTEnLCBcbiAgICB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdDZXJ0aWZpY2F0ZScsIHsgdmFsdWU6IGNlcnRpZmljYXRlLmNlcnRpZmljYXRlQXJuIH0pOyAgICBcbiAgICBcbiAgICAvLyBDcmVhdGUgbmV3IFNOUyBUb3BpY1xuICAgIGNvbnN0IHRvcGljOiBzbnMuVG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsIGBDb250YWN0U05TVG9waWNgLCB7ZGlzcGxheU5hbWU6ICdTSyBXZWJzaXRlIENvbnRhY3QgRm9ybSBFbnRyeSd9KTtcblxuICAgIC8vIENyZWF0ZXMgYSBwYXJhbWV0ZXIgaW4gU1NNIFBhcmFtZXRlciBTdG9yZSB3aGljaCBpcyByZXF1aXJlZCBpbiB0aGUgTGFtYmRhIEpTIGNvZGVcbiAgICBjb25zdCBzc21Ub3BpY1BhcmFtOiBzc20uU3RyaW5nUGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1NLU2l0ZVNOU1RvcGljQVJOJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogJy9za3NpdGUvc25zL2NvbnRhY3QtZm9ybS10b3BpYy1hcm4nLFxuICAgICAgZGVzY3JpcHRpb246ICdTTlMgVG9waWMgQVJOIGZvciBjb250YWN0IGZvcm0gU05TIFRvcGljJyxcbiAgICAgIHN0cmluZ1ZhbHVlOiB0b3BpYy50b3BpY0FybixcbiAgICAgIHR5cGU6IHNzbS5QYXJhbWV0ZXJUeXBlLlNUUklOR1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlcyBhIHBhcmFtZXRlciBpbiBTU00gUGFyYW1ldGVyIFN0b3JlIHdoaWNoIGlzIHJlcXVpcmVkIGluIHRoZSBMYW1iZGEgSlMgY29kZVxuICAgIGNvbnN0IGNhcHRjaGFTU01QYXRoOiBzdHJpbmcgPSAnL3Nrc2l0ZS9jYXB0Y2hhLXNlY3JldC1rZXknO1xuICAgIGNvbnN0IHNzbUNhcHRjaGFQYXJhbTogc3NtLlN0cmluZ1BhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdTS1NpdGVDQVBUQ0hBU2VjcmV0Jywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogY2FwdGNoYVNTTVBhdGgsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NhcHRjaGEgU2VjcmV0IEtleScsXG4gICAgICBzdHJpbmdWYWx1ZTogY2FwdGNoYVNlY3JldCxcbiAgICAgIHR5cGU6IHNzbS5QYXJhbWV0ZXJUeXBlLlNUUklOR1xuICAgIH0pO1xuXG4gICAgLy8gUmVxdWlyZWQgZm9yIFNlY3VyZVN0cmluZ1xuICAgIG5ldyBjdXN0b21SZXNvdXJjZXMuQXdzQ3VzdG9tUmVzb3VyY2UodGhpcywgJ0NBUFRDSEFTZWN1cmVTdHJpbmcnLCB7XG4gICAgICBwb2xpY3k6IGN1c3RvbVJlc291cmNlcy5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5mcm9tU2RrQ2FsbHMoe1xuICAgICAgICByZXNvdXJjZXM6IGN1c3RvbVJlc291cmNlcy5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5BTllfUkVTT1VSQ0UsXG4gICAgICB9KSxcbiAgICAgIG9uQ3JlYXRlOiB7XG4gICAgICAgIHNlcnZpY2U6ICdTU00nLFxuICAgICAgICBhY3Rpb246ICdwdXRQYXJhbWV0ZXInLFxuICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgTmFtZTogY2FwdGNoYVNTTVBhdGgsXG4gICAgICAgICAgT3ZlcndyaXRlOiB0cnVlLFxuICAgICAgICAgIFR5cGU6ICdTZWN1cmVTdHJpbmcnLFxuICAgICAgICAgIFZhbHVlOiBjYXB0Y2hhU2VjcmV0XG4gICAgICAgIH0sXG4gICAgICAgIHBoeXNpY2FsUmVzb3VyY2VJZDogY3VzdG9tUmVzb3VyY2VzLlBoeXNpY2FsUmVzb3VyY2VJZC5vZihjYXB0Y2hhU1NNUGF0aCksXG4gICAgICB9XG4gICAgfSk7ICAgICAgXG5cbiAgICAvLyBBZGQgZW1haWwgc3Vic2NyaXB0aW9uIHRvIFNOUyBUb3BpY1xuICAgIHRvcGljLmFkZFN1YnNjcmlwdGlvbihuZXcgc3Vicy5FbWFpbFN1YnNjcmlwdGlvbihlbWFpbEFkZHIpKTtcblxuICAgIC8vIFBvbGljeSBhdHRhY2hlZCB0byBMYW1iZGEgRXhlY3V0aW9uIFJvbGUgdG8gYWxsb3cgU1NNICsgU05TIGludGVyYWN0aW9uIGluIEpTIGNvZGVcbiAgICBjb25zdCBsYW1iZGFQb2xpY3lTdGF0ZW1lbnQ6IFBvbGljeVN0YXRlbWVudCA9IG5ldyBQb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgcmVzb3VyY2VzOiBbdG9waWMudG9waWNBcm4sIHNzbVRvcGljUGFyYW0ucGFyYW1ldGVyQXJuLCBzc21DYXB0Y2hhUGFyYW0ucGFyYW1ldGVyQXJuXSxcbiAgICAgIGFjdGlvbnM6IFsnc25zOlB1Ymxpc2gnLCAnc3NtOkdldFBhcmFtZXRlciddIFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhQEVkZ2UgZnVuY3Rpb24gbmVlZGVkIGZvciB0aGUgQ29udGFjdCBGb3JtIHN1Ym1pc3Npb24gcHJvY2Vzc2luZ1xuICAgIGNvbnN0IGVkZ2VGdW5jOiBjbG91ZGZyb250LmV4cGVyaW1lbnRhbC5FZGdlRnVuY3Rpb24gPSBcbiAgICAgIG5ldyBjbG91ZGZyb250LmV4cGVyaW1lbnRhbC5FZGdlRnVuY3Rpb24odGhpcywgJ0NvbnRhY3RGb3JtRnVuY3Rpb24nLCB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnYXNzZXRzJyksXG4gICAgICAgIGluaXRpYWxQb2xpY3k6IFtsYW1iZGFQb2xpY3lTdGF0ZW1lbnRdXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBpbnN0YW50aWF0aW9uIHdpdGggYWRkZWQgTGFtYmRhJkVkZ2UgYmVoYXZpb3JcbiAgICBjb25zdCBzM09yaWdpbjogUzNPcmlnaW4gPSBuZXcgUzNPcmlnaW4oc2l0ZUJ1Y2tldCwge29yaWdpbkFjY2Vzc0lkZW50aXR5OiBjbG91ZGZyb250T0FJfSk7XG4gICAgY29uc3QgZGlzdHJpYnV0aW9uOiBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCAnU2l0ZURpc3RyaWJ1dGlvbicsIHtcbiAgICAgIGNlcnRpZmljYXRlOiBjZXJ0aWZpY2F0ZSxcbiAgICAgIGRlZmF1bHRSb290T2JqZWN0OiBcImluZGV4Lmh0bWxcIixcbiAgICAgIGRvbWFpbk5hbWVzOiBbXG4gICAgICAgIGRvbWFpbk5hbWUsIFxuICAgICAgICAnKi4nICsgZG9tYWluTmFtZSAvLyBBbGxvdyBhbGwgc3ViLWRvbWFpbnNcbiAgICAgIF0sXG4gICAgICBtaW5pbXVtUHJvdG9jb2xWZXJzaW9uOiBjbG91ZGZyb250LlNlY3VyaXR5UG9saWN5UHJvdG9jb2wuVExTX1YxXzJfMjAyMSxcbiAgICAgIGVycm9yUmVzcG9uc2VzOltcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwMyxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDQwMyxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2Vycm9yLmh0bWwnLFxuICAgICAgICAgIHR0bDogRHVyYXRpb24ubWludXRlcygzMCksXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgb3JpZ2luOiBzM09yaWdpbixcbiAgICAgICAgY29tcHJlc3M6IHRydWUsXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgfSxcbiAgICAgIGFkZGl0aW9uYWxCZWhhdmlvcnM6IHtcbiAgICAgICAgJy9zdWJtaXRGb3JtJzoge1xuICAgICAgICAgIG9yaWdpbjogczNPcmlnaW4sXG4gICAgICAgICAgZWRnZUxhbWJkYXM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgZnVuY3Rpb25WZXJzaW9uOiBlZGdlRnVuYy5jdXJyZW50VmVyc2lvbixcbiAgICAgICAgICAgICAgZXZlbnRUeXBlOiBjbG91ZGZyb250LkxhbWJkYUVkZ2VFdmVudFR5cGUuVklFV0VSX1JFUVVFU1QsXG4gICAgICAgICAgICAgIGluY2x1ZGVCb2R5OiB0cnVlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgXSwgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfQUxMLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGdlb1Jlc3RyaWN0aW9uOiBjbG91ZGZyb250Lkdlb1Jlc3RyaWN0aW9uLmRlbnlsaXN0KCdSVScsICdTRycsICdBRScpXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdEaXN0cmlidXRpb25JZCcsIHsgdmFsdWU6IGRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZCB9KTtcblxuICAgIC8vIFJvdXRlNTMgYWxpYXMgcmVjb3JkIGZvciB0aGUgQ2xvdWRGcm9udCBkaXN0cmlidXRpb25cbiAgICBjb25zdCBhcGV4UmVjb3JkOiByb3V0ZTUzLkFSZWNvcmQgPSBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdTaXRlQWxpYXNSZWNvcmQnLCB7XG4gICAgICByZWNvcmROYW1lOiBkb21haW5OYW1lLFxuICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMobmV3IHRhcmdldHMuQ2xvdWRGcm9udFRhcmdldChkaXN0cmlidXRpb24pKSxcbiAgICAgIHpvbmVcbiAgICB9KTtcblxuICAgIC8vIFJvdXRlNTMgYWxpYXMgcmVjb3JkIGZvciBzaXRlIGFwZXhcbiAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdXV1dBcGV4UmVjb3JkQWxpYXMnLCB7XG4gICAgICAgIHJlY29yZE5hbWU6ICd3d3cuJyArIGRvbWFpbk5hbWUsXG4gICAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKG5ldyB0YXJnZXRzLlJvdXRlNTNSZWNvcmRUYXJnZXQoYXBleFJlY29yZCkpLFxuICAgICAgICB6b25lXG4gICAgfSk7XG5cbiAgICAvLyBEZXBsb3kgc2l0ZSBjb250ZW50cyB0byBTMyBidWNrZXRcbiAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCAnRGVwbG95V2l0aEludmFsaWRhdGlvbicsIHtcbiAgICAgIHNvdXJjZXM6IFtzM2RlcGxveS5Tb3VyY2UuYXNzZXQoJy4vc3RlcGhlbi1rcmF3Y3p5ay1zaXRlJyldLFxuICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IHNpdGVCdWNrZXQsXG4gICAgICBkaXN0cmlidXRpb24sXG4gICAgICBkaXN0cmlidXRpb25QYXRoczogWycvKiddLFxuICAgIH0pO1xuICB9XG59Il19