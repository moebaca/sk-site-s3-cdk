#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("aws-cdk-lib");
const sk_site_s3_cdk_stack_1 = require("../lib/sk-site-s3-cdk-stack");
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
    constructor(parent, name, props) {
        super(parent, name, props);
        new sk_site_s3_cdk_stack_1.SkSiteS3CdkStack(this, 'Site', {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2stc2l0ZS1zMy1jZGsuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzay1zaXRlLXMzLWNkay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxtQ0FBbUM7QUFDbkMsc0VBQStEO0FBRS9EOzs7Ozs7Ozs7O0dBVUc7QUFDSCxNQUFNLFdBQVksU0FBUSxHQUFHLENBQUMsS0FBSztJQUMvQixZQUFZLE1BQWUsRUFBRSxJQUFZLEVBQUUsS0FBcUI7UUFDOUQsS0FBSyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFM0IsSUFBSSx1Q0FBZ0IsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFO1lBQ2pDLFVBQVUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUM7U0FDOUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNKO0FBRUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsSUFBSSxXQUFXLENBQUMsR0FBRyxFQUFFLFFBQVEsRUFBRTtJQUMzQjs7Ozs7O09BTUc7SUFDSCxHQUFHLEVBQUU7UUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDO1FBQzVDOzs7V0FHRztRQUNILE1BQU0sRUFBRSxXQUFXO0tBQ3RCO0NBQ0osQ0FBQyxDQUFDO0FBRUgsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFNrU2l0ZVMzQ2RrU3RhY2sgfSBmcm9tICcuLi9saWIvc2stc2l0ZS1zMy1jZGstc3RhY2snO1xuXG4vKipcbiAqIFRoaXMgc3RhY2sgcmVsaWVzIG9uIGdldHRpbmcgdGhlIGRvbWFpbiBuYW1lIGZyb20gQ0RLIGNvbnRleHQuXG4gKiBVc2UgJ2NkayBzeW50aCAtYyBkb21haW49c3RlcGhlbmtyYXdjenlrLmNvbSAtYyBhY2NvdW50SWQ9MTIzNDU2Nzg5MCdcbiAqIE9yIGFkZCB0aGUgZm9sbG93aW5nIHRvIGNkay5qc29uOlxuICoge1xuICogICBcImNvbnRleHRcIjoge1xuICogICAgIFwiZG9tYWluXCI6IFwic3RlcGhlbmtyYXdjenlrLmNvbVwiLFxuICogICAgIFwiYWNjb3VudElkXCI6IFwiMTIzNDU2Nzg5MFwiLFxuICogICB9XG4gKiB9XG4qKi9cbmNsYXNzIFNLU2l0ZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgICBjb25zdHJ1Y3RvcihwYXJlbnQ6IGNkay5BcHAsIG5hbWU6IHN0cmluZywgcHJvcHM6IGNkay5TdGFja1Byb3BzKSB7XG4gICAgICBzdXBlcihwYXJlbnQsIG5hbWUsIHByb3BzKTtcblxuICAgICAgbmV3IFNrU2l0ZVMzQ2RrU3RhY2sodGhpcywgJ1NpdGUnLCB7XG4gICAgICAgIGRvbWFpbk5hbWU6IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdkb21haW4nKVxuICAgICAgfSk7XG4gICAgfVxufVxuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG5uZXcgU0tTaXRlU3RhY2soYXBwLCAnU0tTaXRlJywge1xuICAgIC8qKlxuICAgICAqIFRoaXMgaXMgcmVxdWlyZWQgZm9yIG91ciB1c2Ugb2YgaG9zdGVkLXpvbmUgbG9va3VwLlxuICAgICAqXG4gICAgICogTG9va3VwcyBkbyBub3Qgd29yayBhdCBhbGwgd2l0aG91dCBhbiBleHBsaWNpdCBlbnZpcm9ubWVudFxuICAgICAqIHNwZWNpZmllZDsgdG8gdXNlIHRoZW0sIHlvdSBtdXN0IHNwZWNpZnkgZW52LlxuICAgICAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9sYXRlc3QvZ3VpZGUvZW52aXJvbm1lbnRzLmh0bWxcbiAgICAgKi9cbiAgICBlbnY6IHtcbiAgICAgICAgYWNjb3VudDogYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnYWNjb3VudElkJyksXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTdGFjayBtdXN0IGJlIGluIHVzLWVhc3QtMSwgYmVjYXVzZSB0aGUgQUNNIGNlcnRpZmljYXRlIGZvciBhXG4gICAgICAgICAqIGdsb2JhbCBDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBtdXN0IGJlIHJlcXVlc3RlZCBpbiB1cy1lYXN0LTEuXG4gICAgICAgICAqL1xuICAgICAgICByZWdpb246ICd1cy1lYXN0LTEnLFxuICAgIH1cbn0pO1xuXG5hcHAuc3ludGgoKTsiXX0=