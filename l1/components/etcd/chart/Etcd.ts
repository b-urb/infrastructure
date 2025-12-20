import * as k8s from "@pulumi/kubernetes";
import {Namespace, Secret} from "@pulumi/kubernetes/core/v1";


export function createEtcd(namespace: Namespace, secret: Secret) {
  return new k8s.helm.v4.Chart("etcd", {
    chart: "etcd",
    namespace: namespace.metadata.name,
    repositoryOpts: {
      repo: "https://charts.bitnami.com/bitnami"
    },
    values: {
      "commonLabels": {
        "app": "etcd",
        "component": "key-value-store",
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
        "size": "3Gi"
      },
      nodeSelector: {
        owner: "bjoern"
      }

    }
  })
}
