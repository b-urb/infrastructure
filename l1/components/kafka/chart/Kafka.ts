import * as k8s from "@pulumi/kubernetes";
import {Namespace, Secret} from "@pulumi/kubernetes/core/v1";


export function createKafka(namespace: Namespace, secret: Secret) {
  return new k8s.helm.v4.Chart("kafka", {
    chart: "kafka",
    namespace: namespace.metadata.name,
    repositoryOpts: {
      repo: "https://charts.bitnami.com/bitnami"
    },
    values: {
      "commonLabels": {
        "app": "kafka",
        "component": "message-broker",
        "managed-by": "pulumi",
        "service-criticality": "2"
      },
      "auth":
          {
            "rbac": {
              create: false,
              "existingSecret": secret.metadata.name,
              "existingSecretPasswordKey": "root-password"
            },
            client: {
              //secureTransport: true,
              //useAutoTLS: true
              //existingSecret: etcdSecret.metadata.name
            }
          },
      "persistence": {
        "storageClass":"local-path",
        "size": "3Gi"
      },
      nodeSelector: {
       // owner: "bjoern"
      }

    }
  })
}
