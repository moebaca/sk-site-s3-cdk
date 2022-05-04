#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("aws-cdk-lib");
const sk_site_s3_cdk_stack_1 = require("../lib/sk-site-s3-cdk-stack");
/**
 * This stack relies on getting the domain name from CDK context.
 * Use 'cdk synth -c domain=stephenkrawczyk.com -c accountId=1234567890 -c emailAddr=me@example.com -c captchaSecret=xyz'
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
            domainName: this.node.tryGetContext('domain'),
            emailAddr: this.node.tryGetContext('emailAddr'),
            captchaSecret: this.node.tryGetContext('captchaSecret')
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2stc2l0ZS1zMy1jZGsuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzay1zaXRlLXMzLWNkay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxtQ0FBbUM7QUFDbkMsc0VBQStEO0FBRS9EOzs7Ozs7Ozs7O0dBVUc7QUFDSCxNQUFNLFdBQVksU0FBUSxHQUFHLENBQUMsS0FBSztJQUNqQyxZQUFZLE1BQWUsRUFBRSxJQUFZLEVBQUUsS0FBcUI7UUFDOUQsS0FBSyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFM0IsSUFBSSx1Q0FBZ0IsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFO1lBQ2pDLFVBQVUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUM7WUFDN0MsU0FBUyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQztZQUMvQyxhQUFhLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDO1NBQ3hELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQUVELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLElBQUksV0FBVyxDQUFDLEdBQUcsRUFBRSxRQUFRLEVBQUU7SUFDN0I7Ozs7OztPQU1HO0lBQ0gsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQztRQUM1Qzs7O1dBR0c7UUFDSCxNQUFNLEVBQUUsV0FBVztLQUNwQjtDQUNGLENBQUMsQ0FBQztBQUVILEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBTa1NpdGVTM0Nka1N0YWNrIH0gZnJvbSAnLi4vbGliL3NrLXNpdGUtczMtY2RrLXN0YWNrJztcblxuLyoqXG4gKiBUaGlzIHN0YWNrIHJlbGllcyBvbiBnZXR0aW5nIHRoZSBkb21haW4gbmFtZSBmcm9tIENESyBjb250ZXh0LlxuICogVXNlICdjZGsgc3ludGggLWMgZG9tYWluPXN0ZXBoZW5rcmF3Y3p5ay5jb20gLWMgYWNjb3VudElkPTEyMzQ1Njc4OTAgLWMgZW1haWxBZGRyPW1lQGV4YW1wbGUuY29tIC1jIGNhcHRjaGFTZWNyZXQ9eHl6J1xuICogT3IgYWRkIHRoZSBmb2xsb3dpbmcgdG8gY2RrLmpzb246XG4gKiB7XG4gKiAgIFwiY29udGV4dFwiOiB7XG4gKiAgICAgXCJkb21haW5cIjogXCJzdGVwaGVua3Jhd2N6eWsuY29tXCIsXG4gKiAgICAgXCJhY2NvdW50SWRcIjogXCIxMjM0NTY3ODkwXCIsXG4gKiAgIH1cbiAqIH1cbioqL1xuY2xhc3MgU0tTaXRlU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihwYXJlbnQ6IGNkay5BcHAsIG5hbWU6IHN0cmluZywgcHJvcHM6IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIocGFyZW50LCBuYW1lLCBwcm9wcyk7XG5cbiAgICBuZXcgU2tTaXRlUzNDZGtTdGFjayh0aGlzLCAnU2l0ZScsIHtcbiAgICAgIGRvbWFpbk5hbWU6IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdkb21haW4nKSxcbiAgICAgIGVtYWlsQWRkcjogdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2VtYWlsQWRkcicpLFxuICAgICAgY2FwdGNoYVNlY3JldDogdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2NhcHRjaGFTZWNyZXQnKVxuICAgIH0pO1xuICB9XG59XG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5cbm5ldyBTS1NpdGVTdGFjayhhcHAsICdTS1NpdGUnLCB7XG4gIC8qKlxuICAgKiBUaGlzIGlzIHJlcXVpcmVkIGZvciBvdXIgdXNlIG9mIGhvc3RlZC16b25lIGxvb2t1cC5cbiAgICpcbiAgICogTG9va3VwcyBkbyBub3Qgd29yayBhdCBhbGwgd2l0aG91dCBhbiBleHBsaWNpdCBlbnZpcm9ubWVudFxuICAgKiBzcGVjaWZpZWQ7IHRvIHVzZSB0aGVtLCB5b3UgbXVzdCBzcGVjaWZ5IGVudi5cbiAgICogQHNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2xhdGVzdC9ndWlkZS9lbnZpcm9ubWVudHMuaHRtbFxuICAgKi9cbiAgZW52OiB7XG4gICAgYWNjb3VudDogYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnYWNjb3VudElkJyksXG4gICAgLyoqXG4gICAgICogU3RhY2sgbXVzdCBiZSBpbiB1cy1lYXN0LTEsIGJlY2F1c2UgdGhlIEFDTSBjZXJ0aWZpY2F0ZSBmb3IgYVxuICAgICAqIGdsb2JhbCBDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBtdXN0IGJlIHJlcXVlc3RlZCBpbiB1cy1lYXN0LTEuXG4gICAgICovXG4gICAgcmVnaW9uOiAndXMtZWFzdC0xJyxcbiAgfVxufSk7XG5cbmFwcC5zeW50aCgpOyJdfQ==