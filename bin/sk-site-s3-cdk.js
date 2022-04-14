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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2stc2l0ZS1zMy1jZGsuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzay1zaXRlLXMzLWNkay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxtQ0FBbUM7QUFDbkMsc0VBQStEO0FBRS9EOzs7Ozs7Ozs7O0dBVUc7QUFDSCxNQUFNLFdBQVksU0FBUSxHQUFHLENBQUMsS0FBSztJQUMvQixZQUFZLE1BQWUsRUFBRSxJQUFZLEVBQUUsS0FBcUI7UUFDOUQsS0FBSyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFM0IsSUFBSSx1Q0FBZ0IsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFO1lBQ2pDLFVBQVUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUM7WUFDN0MsU0FBUyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQztZQUMvQyxhQUFhLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDO1NBQ3hELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDSjtBQUVELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLElBQUksV0FBVyxDQUFDLEdBQUcsRUFBRSxRQUFRLEVBQUU7SUFDM0I7Ozs7OztPQU1HO0lBQ0gsR0FBRyxFQUFFO1FBQ0QsT0FBTyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQztRQUM1Qzs7O1dBR0c7UUFDSCxNQUFNLEVBQUUsV0FBVztLQUN0QjtDQUNKLENBQUMsQ0FBQztBQUVILEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBTa1NpdGVTM0Nka1N0YWNrIH0gZnJvbSAnLi4vbGliL3NrLXNpdGUtczMtY2RrLXN0YWNrJztcblxuLyoqXG4gKiBUaGlzIHN0YWNrIHJlbGllcyBvbiBnZXR0aW5nIHRoZSBkb21haW4gbmFtZSBmcm9tIENESyBjb250ZXh0LlxuICogVXNlICdjZGsgc3ludGggLWMgZG9tYWluPXN0ZXBoZW5rcmF3Y3p5ay5jb20gLWMgYWNjb3VudElkPTEyMzQ1Njc4OTAgLWMgZW1haWxBZGRyPW1lQGV4YW1wbGUuY29tIC1jIGNhcHRjaGFTZWNyZXQ9eHl6J1xuICogT3IgYWRkIHRoZSBmb2xsb3dpbmcgdG8gY2RrLmpzb246XG4gKiB7XG4gKiAgIFwiY29udGV4dFwiOiB7XG4gKiAgICAgXCJkb21haW5cIjogXCJzdGVwaGVua3Jhd2N6eWsuY29tXCIsXG4gKiAgICAgXCJhY2NvdW50SWRcIjogXCIxMjM0NTY3ODkwXCIsXG4gKiAgIH1cbiAqIH1cbioqL1xuY2xhc3MgU0tTaXRlU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudDogY2RrLkFwcCwgbmFtZTogc3RyaW5nLCBwcm9wczogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICAgIHN1cGVyKHBhcmVudCwgbmFtZSwgcHJvcHMpO1xuXG4gICAgICBuZXcgU2tTaXRlUzNDZGtTdGFjayh0aGlzLCAnU2l0ZScsIHtcbiAgICAgICAgZG9tYWluTmFtZTogdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2RvbWFpbicpLFxuICAgICAgICBlbWFpbEFkZHI6IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdlbWFpbEFkZHInKSxcbiAgICAgICAgY2FwdGNoYVNlY3JldDogdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2NhcHRjaGFTZWNyZXQnKVxuICAgICAgfSk7XG4gICAgfVxufVxuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG5uZXcgU0tTaXRlU3RhY2soYXBwLCAnU0tTaXRlJywge1xuICAgIC8qKlxuICAgICAqIFRoaXMgaXMgcmVxdWlyZWQgZm9yIG91ciB1c2Ugb2YgaG9zdGVkLXpvbmUgbG9va3VwLlxuICAgICAqXG4gICAgICogTG9va3VwcyBkbyBub3Qgd29yayBhdCBhbGwgd2l0aG91dCBhbiBleHBsaWNpdCBlbnZpcm9ubWVudFxuICAgICAqIHNwZWNpZmllZDsgdG8gdXNlIHRoZW0sIHlvdSBtdXN0IHNwZWNpZnkgZW52LlxuICAgICAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9sYXRlc3QvZ3VpZGUvZW52aXJvbm1lbnRzLmh0bWxcbiAgICAgKi9cbiAgICBlbnY6IHtcbiAgICAgICAgYWNjb3VudDogYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnYWNjb3VudElkJyksXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTdGFjayBtdXN0IGJlIGluIHVzLWVhc3QtMSwgYmVjYXVzZSB0aGUgQUNNIGNlcnRpZmljYXRlIGZvciBhXG4gICAgICAgICAqIGdsb2JhbCBDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBtdXN0IGJlIHJlcXVlc3RlZCBpbiB1cy1lYXN0LTEuXG4gICAgICAgICAqL1xuICAgICAgICByZWdpb246ICd1cy1lYXN0LTEnLFxuICAgIH1cbn0pO1xuXG5hcHAuc3ludGgoKTsiXX0=