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
      "commonLabels": {
        "app": "k8s-monitoring",
        "component": "cluster-monitoring",
        "managed-by": "pulumi",
        "service-criticality": "1"
      },
      "cluster": {
        "name": "main-cluster"
      },

      // Destinations - v2.0+ format
      "destinations": [
        {
          "name": "loki",
          "type": "loki",
          "url": lokiUrl,
        },
        {
          "name": "prometheus",
          "type": "prometheus",
          "url": "http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090/api/v1/write",
        }
      ],

      // Receivers - What data to collect
      "receivers": {
        "grpc": {
          "enabled": false
        },
        "http": {
          "enabled": false
        },
        "zipkin": {
          "enabled": false
        },
        "grafanaCloudMetrics": {
          "enabled": false
        }
      },

      // Pod logs collection
      "podLogs": {
        "enabled": true,
        // Explicitly use the DaemonSet collector; avoids the singleton Deployment grabbing logs
        "collector": "alloy-logs",
        "destinations": ["loki"]
      },

      // Metrics collection
      "metrics": {
        "enabled": true,
        "receiver": {
          "prometheus": "prometheus"
        },
        "podMonitor": {
          "enabled": true
        },
        "serviceMonitor": {
          "enabled": true
        },
        "kubeStateMetrics": {
          "enabled": false  // Already enabled in kube-prometheus-stack
        },
        "nodeExporter": {
          "enabled": true
        },
        "kubelet": {
          "enabled": true
        },
        "cadvisor": {
          "enabled": true
        },
        "cost": {
          "enabled": true
        }
      },

      // Cluster events
      "clusterEvents": {
        "enabled": true,
        "logFormat": "logfmt"
      },

      // Disable the default Alloy Deployment (we use the explicit collectors below)
      "alloy": {
        "enabled": false
      },

      "alloy-logs": {
        "enabled": true,
        // Ensure this collector always has the Loki destination even if other features change
        "includeDestinations": ["loki"],
        "alloy": {
          "resources": {
            "requests": {
              "memory": "64Mi",
              "cpu": "50m"
            },
            "limits": {
              "memory": "256Mi",
              "cpu": "250m"
            }
          }
        }
      },

      "alloy-events": {
        "enabled": true,
        "alloy": {
          "resources": {
            "requests": {
              "memory": "32Mi",
              "cpu": "25m"
            },
            "limits": {
              "memory": "128Mi",
              "cpu": "100m"
            }
          }
        }
      },

      // Singleton collector required for cluster events
      "alloy-singleton": {
        "enabled": true,
        "alloy": {
          "resources": {
            "requests": {
              "memory": "32Mi",
              "cpu": "25m"
            },
            "limits": {
              "memory": "128Mi",
              "cpu": "100m"
            }
          }
        }
      }
    }
  });
}
