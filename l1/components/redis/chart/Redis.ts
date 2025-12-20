import * as k8s from "@pulumi/kubernetes"
import {Namespace} from "@pulumi/kubernetes/core/v1";
import {redisDBPassword} from "../../../../util/env";
import versions from "../../../versions";

export function createRedisHelm(namespace: Namespace) {
  return new k8s.helm.v4.Chart("redis", {
        chart: versions.redis.registryUrl!!,
        namespace: namespace.metadata.name,
        version: versions.redis.version,
        values: {
          "commonLabels": {
            "app": "redis",
            "component": "cache",
            "managed-by": "pulumi",
            "service-criticality": "1"
          },
          "global": {
            "redis":{
                "password": redisDBPassword,
            },
            defaultStorageClass: "local-path"
          },
          auth: {
            enabled: false,
            sentinel: false,
          },
          master: {
            disableCommands: [],
            persistence: {
              size: "3Gi"
            },
          },
          replica: {
            disableCommands: [],
            persistence: {
              size: "3Gi"
            },
            replicaCount: 1
          }
        }
      }
  );
}

