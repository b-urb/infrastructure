import * as k8s from "@pulumi/kubernetes"
import * as pulumi from "@pulumi/pulumi";
import {Namespace} from "@pulumi/kubernetes/core/v1";
import versions from "../../../versions";

export function createKubernetesMonitoringHelm(namespace: Namespace, lokiUrl: pulumi.Output<string>) {
  return new k8s.helm.v4.Chart("k8s-monitoring", {
    chart: "k8s-monitoring",
    namespace: namespace.metadata.name,
    version: versions.kubernetesMonitoring.version,
    repositoryOpts: {
      repo: versions.kubernetesMonitoring.registryUrl!!,
    },
    values: {
      "cluster": {
        "name": "main-cluster"
      },

      // Alloy Operator Configuration
      "alloy": {
        "enabled": true,
        "alloy": {
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

      // Logs Configuration - Send to Loki
      "logs": {
        "enabled": true,
        "pod_logs": {
          "enabled": true
        },
        "cluster_events": {
          "enabled": true
        }
      },

      // External Services Configuration
      "externalServices": {
        "loki": {
          "host": lokiUrl,
          "protocol": "http",
          "basicAuth": {
            "username": "",
            "password": ""
          }
        },
        "prometheus": {
          "host": "http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090",
          "protocol": "http",
          "basicAuth": {
            "username": "",
            "password": ""
          }
        }
      },

      // Metrics Configuration - Send to Prometheus
      "metrics": {
        "enabled": true,
        "cost": {
          "enabled": true
        },
        "node-exporter": {
          "enabled": true
        },
        "kubeStateMetrics": {
          "enabled": false  // Already enabled in kube-prometheus-stack
        }
      },

      // Service Monitors
      "serviceMonitor": {
        "enabled": true
      },

      // Resource limits for Alloy instances
      "alloy-logs": {
        "alloy": {
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

      "alloy-metrics": {
        "alloy": {
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
      }
    }
  });
}
