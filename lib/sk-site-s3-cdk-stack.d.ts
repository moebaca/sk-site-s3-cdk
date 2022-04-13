#!/usr/bin/env node
import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
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
export declare class SkSiteS3CdkStack extends Construct {
    constructor(parent: Stack, name: string, props: SkSiteS3CdkProps);
}
