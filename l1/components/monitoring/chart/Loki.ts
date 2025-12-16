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
          "replication_factor": 1
        },
        "chunk_store_config": {
          "chunk_cache_config": {
            "redis": {
              "endpoint": "redis-master.redis:6379",
              "expiration": "1h"
            },
            "max_size_items": 0,
            "max_size_bytes": 0
          },
          "write_dedupe_cache_config": {
            "redis": {
              "endpoint": "redis-master.redis:6379",
              "expiration": "15m"
            }
          }
        },
        "query_range": {
          "cache_results": true,
          "max_retries": 5,
          "results_cache": {
            "cache": {
              "redis": {
                "endpoint": "redis-master.redis:6379",
                "expiration": "24h"
              }
            },
            "compression": "snappy"
          }
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
          "retention_period": "168h", // 7 days
          "max_cache_freshness_per_query": "10m",
          "split_queries_by_interval": "15m",
          "max_query_parallelism": 16,
          "volume_enabled": true
        },
        "compactor": {
          "retention_enabled": true,
          "delete_request_store": "s3"
        }
      },
      "read": {
        "replicas": 1,
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
            "memory": "96Mi",
            "cpu": "75m"
          },
          "limits": {
            "memory": "384Mi",
            "cpu": "400m"
          }
        }
      },
      "write": {
        "replicas": 1,
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
            "memory": "128Mi",
            "cpu": "100m"
          },
          "limits": {
            "memory": "384Mi",
            "cpu": "400m"
          }
        }
      },
      "backend": {
        "replicas": 1,
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
            "memory": "128Mi",
            "cpu": "100m"
          },
          "limits": {
            "memory": "384Mi",
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
      },
      "chunksCache": {
        "enabled": false
      },
      "memcached": {
        "enabled": false
      },
      "memcached-chunks": {
        "enabled": false
      }
    }
  });
}
