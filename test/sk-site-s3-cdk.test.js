"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assertions_1 = require("aws-cdk-lib/assertions");
const cdk = require("aws-cdk-lib");
const sk_site_s3_cdk_stack_1 = require("../lib/sk-site-s3-cdk-stack");
describe("SKSiteStack", () => {
    /**
     * Setup the template for test cases with dummy values.
     */
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack', {
        env: {
            account: '1234567890',
            region: 'us-east-1',
        }
    });
    new sk_site_s3_cdk_stack_1.SkSiteS3CdkStack(stack, 'SkSiteS3CdkTestStack', {
        domainName: 'example.com',
        emailAddr: 'test@example.com',
        captchaSecret: 'captchaSecret',
    });
    const template = assertions_1.Template.fromStack(stack);
    /**
     * Run test cases.
     */
    test('Origin Access Identity Created', () => {
        template.resourceCountIs("AWS::CloudFront::CloudFrontOriginAccessIdentity", 1);
    });
    test('Static Site S3 Bucket Created', () => {
        template.resourceCountIs("AWS::S3::Bucket", 1);
        template.hasResourceProperties("AWS::S3::Bucket", {
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,
                BlockPublicPolicy: true,
                IgnorePublicAcls: true,
                RestrictPublicBuckets: true
            },
        });
    });
    test('Origin Access IAM Policy for S3 Bucket Created', () => {
        template.hasResourceProperties("AWS::S3::BucketPolicy", {
            PolicyDocument: {
                Statement: [
                    assertions_1.Match.objectLike({
                        Action: ['s3:GetBucket*', 's3:List*', 's3:DeleteObject*'],
                        Effect: "Allow",
                    }),
                    assertions_1.Match.objectLike({
                        Action: 's3:GetObject',
                        Effect: "Allow",
                    }),
                ]
            },
        });
    });
    test('SNS Topic for Contact Form Created', () => {
        template.resourceCountIs("AWS::SNS::Topic", 1);
    });
    test('SSM Parameters for Topic ARN and CAPTCHA Secret Created', () => {
        template.resourceCountIs("AWS::SSM::Parameter", 2);
    });
    test('IAM Policy for Lambda Execution Role Created', () => {
        template.hasResourceProperties("AWS::IAM::Policy", {
            PolicyDocument: {
                Statement: [
                    assertions_1.Match.objectLike({
                        Action: ['sns:Publish', 'ssm:GetParameter'],
                        Effect: "Allow",
                    }),
                ]
            },
        });
    });
    test('Lambda&Edge Contact Form Function Created', () => {
        template.hasResourceProperties("AWS::Lambda::Function", {
            Handler: "index.handler",
            Runtime: "nodejs14.x",
        });
    });
    test('CloudFront Distribution Created', () => {
        template.resourceCountIs("AWS::CloudFront::Distribution", 1);
    });
    test('Site Alias Record in Route53 Created', () => {
        template.hasResourceProperties("AWS::Route53::RecordSet", {
            Name: "example.com.",
            Type: "A",
        });
    });
    test('WWW Alias Record for Apex in Route53 Created', () => {
        template.hasResourceProperties("AWS::Route53::RecordSet", {
            Name: "www.example.com.",
            Type: "A",
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2stc2l0ZS1zMy1jZGsudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNrLXNpdGUtczMtY2RrLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSx1REFBeUQ7QUFDekQsbUNBQW1DO0FBQ25DLHNFQUFnRTtBQUVoRSxRQUFRLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRTtJQUUzQjs7T0FFRztJQUNILE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQzFCLE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsV0FBVyxFQUFFO1FBQzVDLEdBQUcsRUFBRTtZQUNILE9BQU8sRUFBRSxZQUFZO1lBQ3JCLE1BQU0sRUFBRSxXQUFXO1NBQ3BCO0tBQ0YsQ0FBQyxDQUFDO0lBRUgsSUFBSSx1Q0FBZ0IsQ0FBQyxLQUFLLEVBQUUsc0JBQXNCLEVBQUU7UUFDbEQsVUFBVSxFQUFFLGFBQWE7UUFDekIsU0FBUyxFQUFFLGtCQUFrQjtRQUM3QixhQUFhLEVBQUUsZUFBZTtLQUMvQixDQUFDLENBQUM7SUFDSCxNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUUzQzs7T0FFRztJQUNILElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7UUFDMUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxpREFBaUQsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNqRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywrQkFBK0IsRUFBRSxHQUFHLEVBQUU7UUFDekMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMvQyxRQUFRLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUU7WUFDaEQsOEJBQThCLEVBQUU7Z0JBQzlCLGVBQWUsRUFBRSxJQUFJO2dCQUNyQixpQkFBaUIsRUFBRSxJQUFJO2dCQUN2QixnQkFBZ0IsRUFBRSxJQUFJO2dCQUN0QixxQkFBcUIsRUFBRSxJQUFJO2FBQzVCO1NBQ0YsQ0FBQyxDQUFBO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZ0RBQWdELEVBQUUsR0FBRyxFQUFFO1FBQzFELFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyx1QkFBdUIsRUFBRTtZQUN0RCxjQUFjLEVBQUU7Z0JBQ2QsU0FBUyxFQUFFO29CQUNULGtCQUFLLENBQUMsVUFBVSxDQUFDO3dCQUNmLE1BQU0sRUFBRSxDQUFDLGVBQWUsRUFBRSxVQUFVLEVBQUUsa0JBQWtCLENBQUM7d0JBQ3pELE1BQU0sRUFBRSxPQUFPO3FCQUNoQixDQUFDO29CQUNGLGtCQUFLLENBQUMsVUFBVSxDQUFDO3dCQUNmLE1BQU0sRUFBRSxjQUFjO3dCQUN0QixNQUFNLEVBQUUsT0FBTztxQkFDaEIsQ0FBQztpQkFDSDthQUNGO1NBQ0YsQ0FBQyxDQUFBO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0NBQW9DLEVBQUUsR0FBRyxFQUFFO1FBQzlDLFFBQVEsQ0FBQyxlQUFlLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDakQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseURBQXlELEVBQUUsR0FBRyxFQUFFO1FBQ25FLFFBQVEsQ0FBQyxlQUFlLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDckQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOENBQThDLEVBQUUsR0FBRyxFQUFFO1FBQ3hELFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxrQkFBa0IsRUFBRTtZQUNqRCxjQUFjLEVBQUU7Z0JBQ2QsU0FBUyxFQUFFO29CQUNULGtCQUFLLENBQUMsVUFBVSxDQUFDO3dCQUNmLE1BQU0sRUFBRSxDQUFDLGFBQWEsRUFBRSxrQkFBa0IsQ0FBQzt3QkFDM0MsTUFBTSxFQUFFLE9BQU87cUJBQ2hCLENBQUM7aUJBQ0g7YUFDRjtTQUNGLENBQUMsQ0FBQTtJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtRQUNyRCxRQUFRLENBQUMscUJBQXFCLENBQUMsdUJBQXVCLEVBQUU7WUFDdEQsT0FBTyxFQUFFLGVBQWU7WUFDeEIsT0FBTyxFQUFFLFlBQVk7U0FDdEIsQ0FBQyxDQUFBO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsaUNBQWlDLEVBQUUsR0FBRyxFQUFFO1FBQzNDLFFBQVEsQ0FBQyxlQUFlLENBQUMsK0JBQStCLEVBQUUsQ0FBQyxDQUFDLENBQUE7SUFDOUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0NBQXNDLEVBQUUsR0FBRyxFQUFFO1FBQ2hELFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyx5QkFBeUIsRUFBRTtZQUN4RCxJQUFJLEVBQUUsY0FBYztZQUNwQixJQUFJLEVBQUUsR0FBRztTQUNWLENBQUMsQ0FBQTtJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEdBQUcsRUFBRTtRQUN4RCxRQUFRLENBQUMscUJBQXFCLENBQUMseUJBQXlCLEVBQUU7WUFDeEQsSUFBSSxFQUFFLGtCQUFrQjtZQUN4QixJQUFJLEVBQUUsR0FBRztTQUNWLENBQUMsQ0FBQTtJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tICdhd3MtY2RrLWxpYi9hc3NlcnRpb25zJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBTa1NpdGVTM0Nka1N0YWNrIH0gIGZyb20gJy4uL2xpYi9zay1zaXRlLXMzLWNkay1zdGFjayc7XG5cbmRlc2NyaWJlKFwiU0tTaXRlU3RhY2tcIiwgKCkgPT4ge1xuICBcbiAgLyoqXG4gICAqIFNldHVwIHRoZSB0ZW1wbGF0ZSBmb3IgdGVzdCBjYXNlcyB3aXRoIGR1bW15IHZhbHVlcy5cbiAgICovXG4gIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gIGNvbnN0IHN0YWNrID0gbmV3IGNkay5TdGFjayhhcHAsICdUZXN0U3RhY2snLCB7XG4gICAgZW52OiB7XG4gICAgICBhY2NvdW50OiAnMTIzNDU2Nzg5MCcsXG4gICAgICByZWdpb246ICd1cy1lYXN0LTEnLFxuICAgIH1cbiAgfSk7XG5cbiAgbmV3IFNrU2l0ZVMzQ2RrU3RhY2soc3RhY2ssICdTa1NpdGVTM0Nka1Rlc3RTdGFjaycsIHtcbiAgICBkb21haW5OYW1lOiAnZXhhbXBsZS5jb20nLFxuICAgIGVtYWlsQWRkcjogJ3Rlc3RAZXhhbXBsZS5jb20nLFxuICAgIGNhcHRjaGFTZWNyZXQ6ICdjYXB0Y2hhU2VjcmV0JyxcbiAgfSk7XG4gIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcblxuICAvKipcbiAgICogUnVuIHRlc3QgY2FzZXMuXG4gICAqL1xuICB0ZXN0KCdPcmlnaW4gQWNjZXNzIElkZW50aXR5IENyZWF0ZWQnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKFwiQVdTOjpDbG91ZEZyb250OjpDbG91ZEZyb250T3JpZ2luQWNjZXNzSWRlbnRpdHlcIiwgMSk7XG4gIH0pO1xuXG4gIHRlc3QoJ1N0YXRpYyBTaXRlIFMzIEJ1Y2tldCBDcmVhdGVkJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCAxKTtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgUHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIEJsb2NrUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgQmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG4gICAgICAgIElnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgIFJlc3RyaWN0UHVibGljQnVja2V0czogdHJ1ZVxuICAgICAgfSxcbiAgICB9KVxuICB9KTtcblxuICB0ZXN0KCdPcmlnaW4gQWNjZXNzIElBTSBQb2xpY3kgZm9yIFMzIEJ1Y2tldCBDcmVhdGVkJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFBvbGljeVwiLCB7XG4gICAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICBTdGF0ZW1lbnQ6IFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIEFjdGlvbjogWydzMzpHZXRCdWNrZXQqJywgJ3MzOkxpc3QqJywgJ3MzOkRlbGV0ZU9iamVjdConXSxcbiAgICAgICAgICAgIEVmZmVjdDogXCJBbGxvd1wiLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgQWN0aW9uOiAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgICAgIEVmZmVjdDogXCJBbGxvd1wiLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdXG4gICAgICB9LFxuICAgIH0pXG4gIH0pO1xuXG4gIHRlc3QoJ1NOUyBUb3BpYyBmb3IgQ29udGFjdCBGb3JtIENyZWF0ZWQnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKFwiQVdTOjpTTlM6OlRvcGljXCIsIDEpO1xuICB9KTtcblxuICB0ZXN0KCdTU00gUGFyYW1ldGVycyBmb3IgVG9waWMgQVJOIGFuZCBDQVBUQ0hBIFNlY3JldCBDcmVhdGVkJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcyhcIkFXUzo6U1NNOjpQYXJhbWV0ZXJcIiwgMik7XG4gIH0pO1xuXG4gIHRlc3QoJ0lBTSBQb2xpY3kgZm9yIExhbWJkYSBFeGVjdXRpb24gUm9sZSBDcmVhdGVkJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6SUFNOjpQb2xpY3lcIiwge1xuICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgU3RhdGVtZW50OiBbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBBY3Rpb246IFsnc25zOlB1Ymxpc2gnLCAnc3NtOkdldFBhcmFtZXRlciddLFxuICAgICAgICAgICAgRWZmZWN0OiBcIkFsbG93XCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIF1cbiAgICAgIH0sXG4gICAgfSlcbiAgfSk7XG5cbiAgdGVzdCgnTGFtYmRhJkVkZ2UgQ29udGFjdCBGb3JtIEZ1bmN0aW9uIENyZWF0ZWQnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgIEhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgUnVudGltZTogXCJub2RlanMxNC54XCIsXG4gICAgfSlcbiAgfSk7XG5cbiAgdGVzdCgnQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gQ3JlYXRlZCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoXCJBV1M6OkNsb3VkRnJvbnQ6OkRpc3RyaWJ1dGlvblwiLCAxKVxuICB9KTtcblxuICB0ZXN0KCdTaXRlIEFsaWFzIFJlY29yZCBpbiBSb3V0ZTUzIENyZWF0ZWQnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpSb3V0ZTUzOjpSZWNvcmRTZXRcIiwge1xuICAgICAgTmFtZTogXCJleGFtcGxlLmNvbS5cIixcbiAgICAgIFR5cGU6IFwiQVwiLFxuICAgIH0pXG4gIH0pO1xuXG4gIHRlc3QoJ1dXVyBBbGlhcyBSZWNvcmQgZm9yIEFwZXggaW4gUm91dGU1MyBDcmVhdGVkJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6Um91dGU1Mzo6UmVjb3JkU2V0XCIsIHtcbiAgICAgIE5hbWU6IFwid3d3LmV4YW1wbGUuY29tLlwiLFxuICAgICAgVHlwZTogXCJBXCIsXG4gICAgfSlcbiAgfSk7XG59KTsiXX0=