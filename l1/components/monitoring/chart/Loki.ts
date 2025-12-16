import * as k8s from "@pulumi/kubernetes"
import {Namespace} from "@pulumi/kubernetes/core/v1";
import versions from "../../../versions";

export function createLokiHelm(namespace: Namespace, s3Secret: k8s.core.v1.Secret) {
  return new k8s.helm.v4.Chart("loki", {
    chart: "loki",
    namespace: namespace.metadata.name,
    version: versions.loki.version,
    repositoryOpts: {
      repo: versions.loki.registryUrl!!,
    },
    values: {
      "deploymentMode": "SimpleScalable",
      "loki": {
        "auth_enabled": false,
        "commonConfig": {
          "replication_factor": 2
        },
        "storage": {
          "type": "s3",
          "bucketNames": {
            "chunks": "loki-chunks",
            "ruler": "loki-ruler",
            "admin": "loki-admin"
          },
          "s3": {
            "endpoint": "https://eu2.contabostorage.com",
            "region": "EU",
            "s3ForcePathStyle": true,
            "insecure": false,
            "accessKeyId": "${AWS_ACCESS_KEY_ID}",
            "secretAccessKey": "${AWS_SECRET_ACCESS_KEY}"
          }
        },
        "schemaConfig": {
          "configs": [
            {
              "from": "2024-01-01",
              "store": "tsdb",
              "object_store": "s3",
              "schema": "v13",
              "index": {
                "prefix": "index_",
                "period": "24h"
              }
            }
          ]
        },
        "limits_config": {
          "retention_period": "168h" // 7 days
        },
        "compactor": {
          "retention_enabled": true,
          "delete_request_store": "s3"
        }
      },
      "read": {
        "replicas": 2,
        "extraArgs": ["-config.expand-env=true"],
        "extraEnv": [
          {
            "name": "AWS_ACCESS_KEY_ID",
            "valueFrom": {
              "secretKeyRef": {
                "name": s3Secret.metadata.name,
                "key": "s3-user-key"
              }
            }
          },
          {
            "name": "AWS_SECRET_ACCESS_KEY",
            "valueFrom": {
              "secretKeyRef": {
                "name": s3Secret.metadata.name,
                "key": "s3-user-secret"
              }
            }
          }
        ],
        "resources": {
          "requests": {
            "memory": "256Mi",
            "cpu": "250m"
          },
          "limits": {
            "memory": "1Gi",
            "cpu": "1000m"
          }
        }
      },
      "write": {
        "replicas": 2,
        "persistence": {
          "enabled": true,
          "storageClass": "local-path",
          "size": "10Gi"
        },
        "extraArgs": ["-config.expand-env=true"],
        "extraEnv": [
          {
            "name": "AWS_ACCESS_KEY_ID",
            "valueFrom": {
              "secretKeyRef": {
                "name": s3Secret.metadata.name,
                "key": "s3-user-key"
              }
            }
          },
          {
            "name": "AWS_SECRET_ACCESS_KEY",
            "valueFrom": {
              "secretKeyRef": {
                "name": s3Secret.metadata.name,
                "key": "s3-user-secret"
              }
            }
          }
        ],
        "resources": {
          "requests": {
            "memory": "256Mi",
            "cpu": "250m"
          },
          "limits": {
            "memory": "1Gi",
            "cpu": "1000m"
          }
        }
      },
      "backend": {
        "replicas": 2,
        "persistence": {
          "enabled": true,
          "storageClass": "local-path",
          "size": "10Gi"
        },
        "extraArgs": ["-config.expand-env=true"],
        "extraEnv": [
          {
            "name": "AWS_ACCESS_KEY_ID",
            "valueFrom": {
              "secretKeyRef": {
                "name": s3Secret.metadata.name,
                "key": "s3-user-key"
              }
            }
          },
          {
            "name": "AWS_SECRET_ACCESS_KEY",
            "valueFrom": {
              "secretKeyRef": {
                "name": s3Secret.metadata.name,
                "key": "s3-user-secret"
              }
            }
          }
        ],
        "resources": {
          "requests": {
            "memory": "256Mi",
            "cpu": "250m"
          },
          "limits": {
            "memory": "512Mi",
            "cpu": "500m"
          }
        }
      },
      "gateway": {
        "enabled": true,
        "replicas": 1,
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
      "monitoring": {
        "selfMonitoring": {
          "enabled": false,
          "grafanaAgent": {
            "installOperator": false
          }
        },
        "serviceMonitor": {
          "enabled": true
        },
        "lokiCanary": {
          "enabled": false
        }
      },
      "test": {
        "enabled": false
      }
    }
  });
}
