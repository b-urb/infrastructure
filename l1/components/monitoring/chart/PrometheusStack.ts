import * as k8s from "@pulumi/kubernetes"
import * as pulumi from "@pulumi/pulumi";
import {Namespace} from "@pulumi/kubernetes/core/v1";
import versions from "../../../versions";

export function createPrometheusStackHelm(
  namespace: Namespace,
  thanosObjstoreSecret: k8s.core.v1.Secret,
  grafanaAdminMail: string,
  grafanaAdminPassword: pulumi.Output<string>
) {
  return new k8s.helm.v4.Chart("kube-prometheus-stack", {
    chart: "kube-prometheus-stack",
    namespace: namespace.metadata.name,
    version: versions.kubePrometheusStack.version,
    repositoryOpts: {
      repo: versions.kubePrometheusStack.registryUrl!!,
    },
    values: {
      "commonLabels": {
        "app": "kube-prometheus-stack",
        "component": "monitoring",
        "managed-by": "pulumi",
        "service-criticality": "1"
      },
      "prometheus": {
        "prometheusSpec": {
          "retention": "15d",
          "retentionSize": "50GB",
          "enableRemoteWriteReceiver": true,
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
              "memory": "384Mi",
              "cpu": "250m"
            },
            "limits": {
              "memory": "768Mi",
              "cpu": "750m"
            }
          }
        }
      },
      "grafana": {
        "enabled": true,
        "adminUser": grafanaAdminMail,
        "adminPassword": grafanaAdminPassword,
        "persistence": {
          "enabled": true,
          "storageClassName": "local-path",
          "size": "10Gi"
        },
        "additionalDataSources": [{
          "name": "Loki",
          "type": "loki",
          "access": "proxy",
          "url": "http://loki-gateway.monitoring.svc.cluster.local",
          "jsonData": {
            "maxLines": 1000
          }
        }],
        "ingress": {
          "enabled": true,
          "ingressClassName": "traefik",
          "annotations": {
            "cert-manager.io/cluster-issuer": "letsencrypt"
          },
          "hosts": ["grafana.burbn.de"],
          "tls": [{
            "secretName": "grafana-tls",
            "hosts": ["grafana.burbn.de"]
          }]
        },
        "resources": {
          "requests": {
            "memory": "96Mi",
            "cpu": "50m"
          },
          "limits": {
            "memory": "384Mi",
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
              "memory": "64Mi",
              "cpu": "50m"
            },
            "limits": {
              "memory": "256Mi",
              "cpu": "200m"
            }
          }
        }
      },
      "prometheusOperator": {
        "admissionWebhooks": {
          "enabled": true,
          "certManager": {
            "enabled": true
          },
          "patch": {
            "enabled": false
          }
        },
        "resources": {
          "requests": {
            "memory": "64Mi",
            "cpu": "50m"
          },
          "limits": {
            "memory": "256Mi",
            "cpu": "200m"
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
