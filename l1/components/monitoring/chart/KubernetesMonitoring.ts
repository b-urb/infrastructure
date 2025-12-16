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
          "url": "http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090",
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

      // Alloy configuration
      "alloy": {
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

      "alloy-logs": {
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

      "alloy-events": {
        "enabled": true,
        "alloy": {
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

      // Singleton collector required for cluster events
      "alloy-singleton": {
        "enabled": true,
        "alloy": {
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
      }
    }
  });
}
