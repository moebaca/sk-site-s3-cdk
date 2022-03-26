#!/usr/bin/env node
import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface StaticSiteProps {
    domainName: string;
    siteSubDomain: string;
}
/**
 * Static site infrastructure, which deploys site content to an S3 bucket.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export declare class StaticSite extends Construct {
    constructor(parent: Stack, name: string, props: StaticSiteProps);
}
