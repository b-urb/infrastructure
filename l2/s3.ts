import * as k8s from "@pulumi/kubernetes";
import * as aws from "@pulumi/aws";
// s3BucketCreator.ts
import * as pulumi from "@pulumi/pulumi";
import {awsProvider} from "./index";
import {getRegion, Region} from "@pulumi/aws";  // Import the singleton provider

type S3BucketCredentials = {
  bucketName: pulumi.Output<string>;
  accessKeyId: pulumi.Output<string>;
  secretAccessKey: pulumi.Output<string>;
  region: pulumi.Output<string>;
  endpoint: pulumi.Output<string>;
};

export function createS3Bucket(bucketName: string): S3BucketCredentials {
  const bucket = new aws.s3.Bucket(bucketName, {
    bucketPrefix: bucketName,
    acl: "private",
  }, { provider: awsProvider, protect: true });  // Use the singleton provider

  const user = new aws.iam.User(`${bucketName}-user`, {}, { provider: awsProvider, protect: true });

  const accessKey = new aws.iam.AccessKey(`${bucketName}-accessKey`, {
    user: user.name,
  }, { provider: awsProvider });

  const userPolicy = new aws.iam.Policy(`${bucketName}-policy`, {
    policy: bucket.arn.apply(arn => JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Action: "s3:*",
        Resource: [
          `${arn}/*`,
          arn,
        ],
      }],
    })),
  }, { provider: awsProvider });

  new aws.iam.PolicyAttachment(`${bucketName}-policy-attachment`, {
    policyArn: userPolicy.arn,
    users: [user.name],
  }, { provider: awsProvider });
  const region = awsProvider.region.apply(region => region || Region.EUCentral1);

  return {
    bucketName: bucket.id,
    accessKeyId: accessKey.id,
    secretAccessKey: accessKey.secret,
    region: region,
    endpoint: pulumi.interpolate `https://s3.${region}.amazonaws.com`,
  };
}


function createDirectusS3Service() {
  return new k8s.core.v1.Service("directus-s3", {
    "metadata": {
      name: "directus-s3"
    }, spec: {
      type: "ExternalName",
      externalName: "minio.minio.svc.cluster.local",
      ports: [{
        port: 9000,
        protocol: "TCP",
        targetPort: 80,
        name: "minio"
      }]
    }
  })
}
