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
 * Static site infrastructure, which deploys site content to an S3 bucket.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
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
                physicalResourceId: customResources.PhysicalResourceId.of('/sksite/secure-af'),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2stc2l0ZS1zMy1jZGstc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzay1zaXRlLXMzLWNkay1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7O0FBQ0EsbURBQW1EO0FBQ25ELGlEQUFpRDtBQUNqRCwrQ0FBK0Q7QUFDL0QsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQywwREFBMEQ7QUFDMUQsMERBQTBEO0FBQzFELHlEQUF5RDtBQUN6RCwwREFBMEQ7QUFDMUQsMkRBQTJEO0FBQzNELCtFQUE4RDtBQUM5RCw2Q0FBd0U7QUFDeEUsMkNBQTJDO0FBQzNDLGdFQUFnRTtBQUNoRSwyQ0FBdUM7QUFDdkMsaURBQXNEO0FBRXRELElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztBQVEvQjs7Ozs7R0FLRztBQUNILE1BQWEsZ0JBQWlCLFNBQVEsc0JBQVM7SUFDN0MsWUFBWSxNQUFhLEVBQUUsSUFBWSxFQUFFLEtBQXVCO1FBQzlELEtBQUssQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFcEIsTUFBTSxVQUFVLEdBQVcsS0FBSyxDQUFDLFVBQVUsQ0FBQztRQUM1QyxNQUFNLFNBQVMsR0FBVyxLQUFLLENBQUMsU0FBUyxDQUFDO1FBQzFDLE1BQU0sYUFBYSxHQUFXLEtBQUssQ0FBQyxhQUFhLENBQUM7UUFFbEQsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDckIsS0FBSyxDQUFDLElBQUksQ0FBQyxxRUFBcUUsQ0FBQyxDQUFDO1lBQ2xGLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDakI7UUFFRCxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxFQUFFO1lBQzlDLEtBQUssQ0FBQyxJQUFJLENBQUMsZ0VBQWdFLENBQUMsQ0FBQztTQUNoRjtRQUVELGlGQUFpRjtRQUNqRixN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dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBCdWNrZXQsIEJsb2NrUHVibGljQWNjZXNzIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIHNzbSBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3NtJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIHN1YnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucy1zdWJzY3JpcHRpb25zJztcbmltcG9ydCAqIGFzIGFjbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2VydGlmaWNhdGVtYW5hZ2VyJztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xuaW1wb3J0ICogYXMgczNkZXBsb3kgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLWRlcGxveW1lbnQnO1xuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1My10YXJnZXRzJztcbmltcG9ydCB7IFMzT3JpZ2luIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XG5pbXBvcnQgeyBDZm5PdXRwdXQsIER1cmF0aW9uLCBSZW1vdmFsUG9saWN5LCBTdGFjayB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGN1c3RvbVJlc291cmNlcyBmcm9tICdhd3MtY2RrLWxpYi9jdXN0b20tcmVzb3VyY2VzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgUG9saWN5U3RhdGVtZW50IH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5cbnZhciBzaGVsbCA9IHJlcXVpcmUoJ3NoZWxsanMnKTtcblxuZXhwb3J0IGludGVyZmFjZSBTa1NpdGVTM0Nka1Byb3BzIHtcbiAgZG9tYWluTmFtZTogc3RyaW5nO1xuICBlbWFpbEFkZHI6IHN0cmluZztcbiAgY2FwdGNoYVNlY3JldDogc3RyaW5nO1xufVxuXG4vKipcbiAqIFN0YXRpYyBzaXRlIGluZnJhc3RydWN0dXJlLCB3aGljaCBkZXBsb3lzIHNpdGUgY29udGVudCB0byBhbiBTMyBidWNrZXQuXG4gKlxuICogVGhlIHNpdGUgcmVkaXJlY3RzIGZyb20gSFRUUCB0byBIVFRQUywgdXNpbmcgYSBDbG91ZEZyb250IGRpc3RyaWJ1dGlvbixcbiAqIFJvdXRlNTMgYWxpYXMgcmVjb3JkLCBhbmQgQUNNIGNlcnRpZmljYXRlLlxuICovXG5leHBvcnQgY2xhc3MgU2tTaXRlUzNDZGtTdGFjayBleHRlbmRzIENvbnN0cnVjdCB7XG4gIGNvbnN0cnVjdG9yKHBhcmVudDogU3RhY2ssIG5hbWU6IHN0cmluZywgcHJvcHM6IFNrU2l0ZVMzQ2RrUHJvcHMpIHtcbiAgICBzdXBlcihwYXJlbnQsIG5hbWUpO1xuXG4gICAgY29uc3QgZG9tYWluTmFtZTogc3RyaW5nID0gcHJvcHMuZG9tYWluTmFtZTtcbiAgICBjb25zdCBlbWFpbEFkZHI6IHN0cmluZyA9IHByb3BzLmVtYWlsQWRkcjtcbiAgICBjb25zdCBjYXB0Y2hhU2VjcmV0OiBzdHJpbmcgPSBwcm9wcy5jYXB0Y2hhU2VjcmV0O1xuXG4gICAgaWYgKCFzaGVsbC53aGljaCgnZ2l0JykpIHtcbiAgICAgICAgc2hlbGwuZWNobygnU29ycnksIHRoaXMgZGVwbG95bWVudCByZXF1aXJlcyBnaXQgaW5zdGFsbGVkIG9uIHRoZSBsb2NhbCBtYWNoaW5lLicpO1xuICAgICAgICBzaGVsbC5leGl0KDEpO1xuICAgIH1cblxuICAgIGlmIChzaGVsbC5scygnc3RlcGhlbi1rcmF3Y3p5ay1zaXRlJykuY29kZSAhPT0gMCkge1xuICAgICAgICBzaGVsbC5leGVjKCdnaXQgY2xvbmUgaHR0cHM6Ly9naXRodWIuY29tL21vZWJhY2Evc3RlcGhlbi1rcmF3Y3p5ay1zaXRlLmdpdCcpO1xuICAgIH1cblxuICAgIC8vIFJlcXVpcmVzIHlvdSBvd24gdGhlIGRvbWFpbiBuYW1lIHBhc3NlZCBhcyBwYXJhbSBhbmQgaG9zdGVkIHpvbmUgZXhpc3RzIGluIFI1M1xuICAgIGNvbnN0IHpvbmU6IHJvdXRlNTMuSUhvc3RlZFpvbmUgPSByb3V0ZTUzLkhvc3RlZFpvbmUuZnJvbUxvb2t1cCh0aGlzLCAnWm9uZScsIHsgZG9tYWluTmFtZTogZG9tYWluTmFtZSB9KTtcbiAgICBjb25zdCBjbG91ZGZyb250T0FJOiBjbG91ZGZyb250Lk9yaWdpbkFjY2Vzc0lkZW50aXR5ID0gbmV3IGNsb3VkZnJvbnQuT3JpZ2luQWNjZXNzSWRlbnRpdHkodGhpcywgJ2Nsb3VkZnJvbnQtT0FJJywge1xuICAgICAgY29tbWVudDogYE9BSSBmb3IgJHtuYW1lfWBcbiAgICB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdTaXRlJywgeyB2YWx1ZTogJ2h0dHBzOi8vJyArIGRvbWFpbk5hbWUgfSk7XG5cbiAgICAvLyBTMyBzaXRlIGNvbnRlbnQgYnVja2V0XG4gICAgY29uc3Qgc2l0ZUJ1Y2tldDogQnVja2V0ID0gbmV3IEJ1Y2tldCh0aGlzLCAnU2l0ZUJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGRvbWFpbk5hbWUsXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiBmYWxzZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBCbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IFMzIGJ1Y2tldCBhY2Nlc3MgdG8gQ2xvdWRGcm9udFxuICAgIHNpdGVCdWNrZXQuYWRkVG9SZXNvdXJjZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ3MzOkdldE9iamVjdCddLFxuICAgICAgcmVzb3VyY2VzOiBbc2l0ZUJ1Y2tldC5hcm5Gb3JPYmplY3RzKCcqJyldLFxuICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQ2Fub25pY2FsVXNlclByaW5jaXBhbChjbG91ZGZyb250T0FJLmNsb3VkRnJvbnRPcmlnaW5BY2Nlc3NJZGVudGl0eVMzQ2Fub25pY2FsVXNlcklkKV1cbiAgICB9KSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnQnVja2V0JywgeyB2YWx1ZTogc2l0ZUJ1Y2tldC5idWNrZXROYW1lIH0pO1xuXG4gICAgLy8gVExTIGNlcnRpZmljYXRlIGZvciB1c2Ugd2l0aCB3ZWJzaXRlXG4gICAgY29uc3QgY2VydGlmaWNhdGU6IGFjbS5EbnNWYWxpZGF0ZWRDZXJ0aWZpY2F0ZSA9IG5ldyBhY20uRG5zVmFsaWRhdGVkQ2VydGlmaWNhdGUodGhpcywgJ1NpdGVDZXJ0aWZpY2F0ZScsIHtcbiAgICAgIGRvbWFpbk5hbWU6IGRvbWFpbk5hbWUsXG4gICAgICBzdWJqZWN0QWx0ZXJuYXRpdmVOYW1lczogW1xuICAgICAgICAnKi4nICsgZG9tYWluTmFtZVxuICAgICAgXSxcbiAgICAgIGhvc3RlZFpvbmU6IHpvbmUsXG4gICAgICByZWdpb246ICd1cy1lYXN0LTEnLCBcbiAgICB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdDZXJ0aWZpY2F0ZScsIHsgdmFsdWU6IGNlcnRpZmljYXRlLmNlcnRpZmljYXRlQXJuIH0pOyAgICBcbiAgICBcbiAgICAvLyBDcmVhdGUgbmV3IFNOUyBUb3BpY1xuICAgIGNvbnN0IHRvcGljOiBzbnMuVG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsIGBDb250YWN0U05TVG9waWNgLCB7ZGlzcGxheU5hbWU6ICdTSyBXZWJzaXRlIENvbnRhY3QgRm9ybSBFbnRyeSd9KTtcblxuICAgIC8vIENyZWF0ZXMgYSBwYXJhbWV0ZXIgaW4gU1NNIFBhcmFtZXRlciBTdG9yZSB3aGljaCBpcyByZXF1aXJlZCBpbiB0aGUgTGFtYmRhIEpTIGNvZGVcbiAgICBjb25zdCBzc21Ub3BpY1BhcmFtOiBzc20uU3RyaW5nUGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1NLU2l0ZVNOU1RvcGljQVJOJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogJy9za3NpdGUvc25zL2NvbnRhY3QtZm9ybS10b3BpYy1hcm4nLFxuICAgICAgZGVzY3JpcHRpb246ICdTTlMgVG9waWMgQVJOIGZvciBjb250YWN0IGZvcm0gU05TIFRvcGljJyxcbiAgICAgIHN0cmluZ1ZhbHVlOiB0b3BpYy50b3BpY0FybixcbiAgICAgIHR5cGU6IHNzbS5QYXJhbWV0ZXJUeXBlLlNUUklOR1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlcyBhIHBhcmFtZXRlciBpbiBTU00gUGFyYW1ldGVyIFN0b3JlIHdoaWNoIGlzIHJlcXVpcmVkIGluIHRoZSBMYW1iZGEgSlMgY29kZVxuICAgIGNvbnN0IGNhcHRjaGFTU01QYXRoOiBzdHJpbmcgPSAnL3Nrc2l0ZS9jYXB0Y2hhLXNlY3JldC1rZXknO1xuICAgIGNvbnN0IHNzbUNhcHRjaGFQYXJhbTogc3NtLlN0cmluZ1BhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdTS1NpdGVDQVBUQ0hBU2VjcmV0Jywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogJy9za3NpdGUvY2FwdGNoYS1zZWNyZXQta2V5JyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2FwdGNoYSBTZWNyZXQgS2V5JyxcbiAgICAgIHN0cmluZ1ZhbHVlOiBjYXB0Y2hhU2VjcmV0LFxuICAgICAgdHlwZTogc3NtLlBhcmFtZXRlclR5cGUuU1RSSU5HXG4gICAgfSk7XG5cbiAgICAvLyBSZXF1aXJlZCBmb3IgU2VjdXJlU3RyaW5nXG4gICAgbmV3IGN1c3RvbVJlc291cmNlcy5Bd3NDdXN0b21SZXNvdXJjZSh0aGlzLCAnQ0FQVENIQVNlY3VyZVN0cmluZycsIHtcbiAgICAgIHBvbGljeTogY3VzdG9tUmVzb3VyY2VzLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LmZyb21TZGtDYWxscyh7XG4gICAgICAgIHJlc291cmNlczogY3VzdG9tUmVzb3VyY2VzLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LkFOWV9SRVNPVVJDRSxcbiAgICAgIH0pLFxuICAgICAgb25DcmVhdGU6IHtcbiAgICAgICAgc2VydmljZTogJ1NTTScsXG4gICAgICAgIGFjdGlvbjogJ3B1dFBhcmFtZXRlcicsXG4gICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICBOYW1lOiAnL3Nrc2l0ZS9jYXB0Y2hhLXNlY3JldC1rZXknLFxuICAgICAgICAgIE92ZXJ3cml0ZTogdHJ1ZSxcbiAgICAgICAgICBUeXBlOiAnU2VjdXJlU3RyaW5nJyxcbiAgICAgICAgICBWYWx1ZTogY2FwdGNoYVNlY3JldFxuICAgICAgICB9LFxuICAgICAgICBwaHlzaWNhbFJlc291cmNlSWQ6IGN1c3RvbVJlc291cmNlcy5QaHlzaWNhbFJlc291cmNlSWQub2YoJy9za3NpdGUvc2VjdXJlLWFmJyksXG4gICAgICB9XG4gICAgfSk7ICAgICAgXG5cbiAgICAvLyBBZGQgZW1haWwgc3Vic2NyaXB0aW9uIHRvIFNOUyBUb3BpY1xuICAgIHRvcGljLmFkZFN1YnNjcmlwdGlvbihuZXcgc3Vicy5FbWFpbFN1YnNjcmlwdGlvbihlbWFpbEFkZHIpKTtcblxuICAgIC8vIFBvbGljeSBhdHRhY2hlZCB0byBMYW1iZGEgRXhlY3V0aW9uIFJvbGUgdG8gYWxsb3cgU1NNICsgU05TIGludGVyYWN0aW9uIGluIEpTIGNvZGVcbiAgICBjb25zdCBsYW1iZGFQb2xpY3lTdGF0ZW1lbnQ6IFBvbGljeVN0YXRlbWVudCA9IG5ldyBQb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgcmVzb3VyY2VzOiBbdG9waWMudG9waWNBcm4sIHNzbVRvcGljUGFyYW0ucGFyYW1ldGVyQXJuLCBzc21DYXB0Y2hhUGFyYW0ucGFyYW1ldGVyQXJuXSxcbiAgICAgIGFjdGlvbnM6IFsnc25zOlB1Ymxpc2gnLCAnc3NtOkdldFBhcmFtZXRlciddIFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhQEVkZ2UgZnVuY3Rpb24gbmVlZGVkIGZvciB0aGUgQ29udGFjdCBGb3JtIHN1Ym1pc3Npb24gcHJvY2Vzc2luZ1xuICAgIGNvbnN0IGVkZ2VGdW5jOiBjbG91ZGZyb250LmV4cGVyaW1lbnRhbC5FZGdlRnVuY3Rpb24gPSBcbiAgICAgIG5ldyBjbG91ZGZyb250LmV4cGVyaW1lbnRhbC5FZGdlRnVuY3Rpb24odGhpcywgJ0NvbnRhY3RGb3JtRnVuY3Rpb24nLCB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnYXNzZXRzJyksXG4gICAgICAgIGluaXRpYWxQb2xpY3k6IFtsYW1iZGFQb2xpY3lTdGF0ZW1lbnRdXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBpbnN0YW50aWF0aW9uIHdpdGggYWRkZWQgTGFtYmRhJkVkZ2UgYmVoYXZpb3JcbiAgICBjb25zdCBzM09yaWdpbjogUzNPcmlnaW4gPSBuZXcgUzNPcmlnaW4oc2l0ZUJ1Y2tldCwge29yaWdpbkFjY2Vzc0lkZW50aXR5OiBjbG91ZGZyb250T0FJfSk7XG4gICAgY29uc3QgZGlzdHJpYnV0aW9uOiBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCAnU2l0ZURpc3RyaWJ1dGlvbicsIHtcbiAgICAgIGNlcnRpZmljYXRlOiBjZXJ0aWZpY2F0ZSxcbiAgICAgIGRlZmF1bHRSb290T2JqZWN0OiBcImluZGV4Lmh0bWxcIixcbiAgICAgIGRvbWFpbk5hbWVzOiBbXG4gICAgICAgIGRvbWFpbk5hbWUsIFxuICAgICAgICAnKi4nICsgZG9tYWluTmFtZSAvLyBBbGxvdyBhbGwgc3ViLWRvbWFpbnNcbiAgICAgIF0sXG4gICAgICBtaW5pbXVtUHJvdG9jb2xWZXJzaW9uOiBjbG91ZGZyb250LlNlY3VyaXR5UG9saWN5UHJvdG9jb2wuVExTX1YxXzJfMjAyMSxcbiAgICAgIGVycm9yUmVzcG9uc2VzOltcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwMyxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDQwMyxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2Vycm9yLmh0bWwnLFxuICAgICAgICAgIHR0bDogRHVyYXRpb24ubWludXRlcygzMCksXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgb3JpZ2luOiBzM09yaWdpbixcbiAgICAgICAgY29tcHJlc3M6IHRydWUsXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgfSxcbiAgICAgIGFkZGl0aW9uYWxCZWhhdmlvcnM6IHtcbiAgICAgICAgJy9zdWJtaXRGb3JtJzoge1xuICAgICAgICAgIG9yaWdpbjogczNPcmlnaW4sXG4gICAgICAgICAgZWRnZUxhbWJkYXM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgZnVuY3Rpb25WZXJzaW9uOiBlZGdlRnVuYy5jdXJyZW50VmVyc2lvbixcbiAgICAgICAgICAgICAgZXZlbnRUeXBlOiBjbG91ZGZyb250LkxhbWJkYUVkZ2VFdmVudFR5cGUuVklFV0VSX1JFUVVFU1QsXG4gICAgICAgICAgICAgIGluY2x1ZGVCb2R5OiB0cnVlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgXSwgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfQUxMLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGdlb1Jlc3RyaWN0aW9uOiBjbG91ZGZyb250Lkdlb1Jlc3RyaWN0aW9uLmRlbnlsaXN0KCdSVScsICdTRycsICdBRScpXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdEaXN0cmlidXRpb25JZCcsIHsgdmFsdWU6IGRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZCB9KTtcblxuICAgIC8vIFJvdXRlNTMgYWxpYXMgcmVjb3JkIGZvciB0aGUgQ2xvdWRGcm9udCBkaXN0cmlidXRpb25cbiAgICBjb25zdCBhcGV4UmVjb3JkOiByb3V0ZTUzLkFSZWNvcmQgPSBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdTaXRlQWxpYXNSZWNvcmQnLCB7XG4gICAgICByZWNvcmROYW1lOiBkb21haW5OYW1lLFxuICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMobmV3IHRhcmdldHMuQ2xvdWRGcm9udFRhcmdldChkaXN0cmlidXRpb24pKSxcbiAgICAgIHpvbmVcbiAgICB9KTtcblxuICAgIC8vIFJvdXRlNTMgYWxpYXMgcmVjb3JkIGZvciB0aGUgQ2xvdWRGcm9udCBkaXN0cmlidXRpb25cbiAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdXV1dBcGV4UmVjb3JkQWxpYXMnLCB7XG4gICAgICAgIHJlY29yZE5hbWU6ICd3d3cuJyArIGRvbWFpbk5hbWUsXG4gICAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKG5ldyB0YXJnZXRzLlJvdXRlNTNSZWNvcmRUYXJnZXQoYXBleFJlY29yZCkpLFxuICAgICAgICB6b25lXG4gICAgfSk7XG5cbiAgICAvLyBEZXBsb3kgc2l0ZSBjb250ZW50cyB0byBTMyBidWNrZXRcbiAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCAnRGVwbG95V2l0aEludmFsaWRhdGlvbicsIHtcbiAgICAgIHNvdXJjZXM6IFtzM2RlcGxveS5Tb3VyY2UuYXNzZXQoJy4vc3RlcGhlbi1rcmF3Y3p5ay1zaXRlJyldLFxuICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IHNpdGVCdWNrZXQsXG4gICAgICBkaXN0cmlidXRpb24sXG4gICAgICBkaXN0cmlidXRpb25QYXRoczogWycvKiddLFxuICAgIH0pO1xuICB9XG59Il19