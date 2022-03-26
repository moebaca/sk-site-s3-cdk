#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SkSiteS3CdkStack } from '../lib/sk-site-s3-cdk-stack';

/**
 * This stack relies on getting the domain name from CDK context.
 * Use 'cdk synth -c domain=stephenkrawczyk.com -c accountId=1234567890'
 * Or add the following to cdk.json:
 * {
 *   "context": {
 *     "domain": "stephenkrawczyk.com",
 *     "accountId": "1234567890",
 *   }
 * }
**/
class SKSiteStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props: cdk.StackProps) {
      super(parent, name, props);

      new SkSiteS3CdkStack(this, 'Site', {
        domainName: this.node.tryGetContext('domain')
      });
    }
}

const app = new cdk.App();

new SKSiteStack(app, 'SKSite', {
    /**
     * This is required for our use of hosted-zone lookup.
     *
     * Lookups do not work at all without an explicit environment
     * specified; to use them, you must specify env.
     * @see https://docs.aws.amazon.com/cdk/latest/guide/environments.html
     */
    env: {
        account: app.node.tryGetContext('accountId'),
        /**
         * Stack must be in us-east-1, because the ACM certificate for a
         * global CloudFront distribution must be requested in us-east-1.
         */
        region: 'us-east-1',
    }
});

app.synth();