#!/usr/bin/env node
import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface SkSiteS3CdkProps {
    domainName: string;
    emailAddr: string;
    captchaSecret: string;
}
/**
 * Static site infrastructure, which deploys site content to an S3 bucket.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export declare class SkSiteS3CdkStack extends Construct {
    constructor(parent: Stack, name: string, props: SkSiteS3CdkProps);
}
