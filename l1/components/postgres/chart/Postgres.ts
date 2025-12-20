import * as k8s from "@pulumi/kubernetes"
import {Namespace} from "@pulumi/kubernetes/core/v1";
import {dbUsername} from "../../../../util/env";
import {RandomPassword} from "@pulumi/random";
import versions from "../../../versions";




export function createPostgresHelm(namespace: Namespace, dbRootPassword: RandomPassword, appDbPassword: RandomPassword) {
  return new k8s.helm.v4.Chart("postgres", {
        chart: versions.postgresql.registryUrl!!,
        namespace: namespace.metadata.name,
        version:versions.postgresql.version ,
        values: {
         "commonLabels": {
           "app": "postgres",
           "component": "database",
           "managed-by": "pulumi",
           "service-criticality": "1"
         },
         "global": {
           "postgresql":{
             "auth": {
               "database": "applications",
               "username": "applicationDbAdmin",
               "password": appDbPassword.result,
               "postgresPassword": dbRootPassword.result
             }
           }
         },
          "architecture": "replication",
          "primary": {
            "extendedConfiguration": "max_connections = 400"
            },
          "readReplicas": {
            "extendedConfiguration": "max_connections = 400",
            "replicaCount": 1
          }
        }
      }
  );
}

