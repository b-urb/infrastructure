import * as k8s from "@pulumi/kubernetes"
import {Namespace} from "@pulumi/kubernetes/core/v1";
import versions from "../../../versions";

export function createPrometheusStackHelm(namespace: Namespace, thanosObjstoreSecret: k8s.core.v1.Secret) {
  return new k8s.helm.v4.Chart("kube-prometheus-stack", {
    chart: "kube-prometheus-stack",
    namespace: namespace.metadata.name,
    version: versions.kubePrometheusStack.version,
    repositoryOpts: {
      repo: versions.kubePrometheusStack.registryUrl!!,
    },
    values: {
      "prometheus": {
        "prometheusSpec": {
          "retention": "15d",
          "retentionSize": "50GB",
          "thanos": {
            "baseImage": "quay.io/thanos/thanos",
            "version": "v0.36.1",
            "objectStorageConfig": {
              "name": thanosObjstoreSecret.metadata.name,
              "key": "objstore.yml"
            }
          },
          "resources": {
            "requests": {
              "memory": "512Mi",
              "cpu": "500m"
            },
            "limits": {
              "memory": "2Gi",
              "cpu": "2000m"
            }
          }
        }
      },
      "grafana": {
        "enabled": true,
        "adminPassword": "admin", // Change this in production
        "persistence": {
          "enabled": true,
          "storageClassName": "local-path",
          "size": "10Gi"
        },
        "ingress": {
          "enabled": false // Enable and configure as needed
        },
        "resources": {
          "requests": {
            "memory": "128Mi",
            "cpu": "100m"
          },
          "limits": {
            "memory": "512Mi",
            "cpu": "500m"
          }
        }
      },
      "alertmanager": {
        "enabled": true,
        "alertmanagerSpec": {
          "storage": {
            "volumeClaimTemplate": {
              "spec": {
                "storageClassName": "local-path",
                "accessModes": ["ReadWriteOnce"],
                "resources": {
                  "requests": {
                    "storage": "10Gi"
                  }
                }
              }
            }
          },
          "resources": {
            "requests": {
              "memory": "128Mi",
              "cpu": "100m"
            },
            "limits": {
              "memory": "512Mi",
              "cpu": "500m"
            }
          }
        }
      },
      "prometheusOperator": {
        "admissionWebhooks": {
          "enabled": true,
          "patch": {
            "enabled": true,
            "image": {
              "pullPolicy": "IfNotPresent"
            }
          }
        },
        "resources": {
          "requests": {
            "memory": "128Mi",
            "cpu": "100m"
          },
          "limits": {
            "memory": "512Mi",
            "cpu": "500m"
          }
        }
      },
      "kubeStateMetrics": {
        "enabled": true
      },
      "nodeExporter": {
        "enabled": true
      }
    }
  });
}
