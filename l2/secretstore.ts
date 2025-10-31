import { awsProvider } from "./index";
import { Provider } from "@pulumi/kubernetes";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";

export function createSecretStore(k8sProvider: Provider) {
  // Create an IAM user for secrets management
  const secretsUser = new aws.iam.User("secretsUser", {
    name: "secretsManagerUser"
  }, { provider: awsProvider });

  // Attach policy to the user that allows managing Secrets Manager
  const policy = new aws.iam.Policy("policy", {
    description: "Policy that allows management of Secrets Manager",
    policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Action: [
          "secretsmanager:*"
        ],
        Resource: "*",
        Effect: "Allow"
      }]
    })
  }, { provider: awsProvider });

  // Attach policy to the user
  new aws.iam.UserPolicyAttachment("userPolicyAttachment", {
    user: secretsUser.name,
    policyArn: policy.arn
  }, { provider: awsProvider });

  // Create access key for the IAM user
  const accessKey = new aws.iam.AccessKey("accessKey", {
    user: secretsUser.name
  }, { provider: awsProvider });

  // Create Kubernetes Secret with AWS credentials
  const awsCredsSecret = new k8s.core.v1.Secret("aws-creds", {
    metadata: {
      name: "aws-creds",
      namespace: "kube-system"
    },
    stringData: {
      accessKey: accessKey.id,
      secretAccessKey: accessKey.secret
    }
  }, { provider: k8sProvider });

  // Create a SecretStore that references AWS Secrets Manager with IAM user credentials
  return new k8s.apiextensions.CustomResource("aws-secret-store", {
    apiVersion: "external-secrets.io/v1",
    kind: "ClusterSecretStore",
    metadata: {
      name: "aws-secret-store",
      namespace: "kube-system"
    },
    spec: {
      provider: {
        aws: {
          service: "SecretsManager",
          region: "eu-central-1", // Frankfurt region
          auth: {
            secretRef: {
              accessKeyIDSecretRef: {
                name: "aws-creds",
                key: "accessKey",
                namespace: "kube-system"
              },
              secretAccessKeySecretRef: {
                name: "aws-creds",
                key: "secretAccessKey",
                namespace: "kube-system"
              }
            }
          }
        }
      }
    }
  }, { provider: k8sProvider });
}
