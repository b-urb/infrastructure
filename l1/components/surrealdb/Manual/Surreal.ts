import {ConfigMap, PersistentVolumeClaim, Service} from "@pulumi/kubernetes/core/v1";
import {Namespace, Secret} from "@pulumi/kubernetes/core/v1";
import {RandomPassword} from "@pulumi/random";
import {StatefulSet} from "@pulumi/kubernetes/apps/v1";
import versions from "../../../versions";
const name = "surrealdb"
const namespaceName = "surrealdb"
const image = versions.surrealDB.depName
const tag = versions.surrealDB.version

export const surrealPassword = new RandomPassword("surrealPassword",{length: 16, special: true})

export function createSurrealManual() {
 const namespace = new Namespace(name, {
  metadata: {
   name: name,
  }
 })
 const secret = new Secret(name, {
  metadata: {
   name: name,
   namespace: namespace.metadata.name
  },
  stringData: {
   "surreal-user": "root",
   "surreal-password": surrealPassword.result
  }
 })

 const config = new ConfigMap(name, {
  metadata: {
   name: name,
   namespace: namespace.metadata.name
  },
  data: {
   "log-level": "trace",
   "file-path": "/var/db"
  }
 })

 const surrealPvc = new PersistentVolumeClaim(name, {
  metadata: {
   name: name,
   namespace: namespace.metadata.name
  },
  spec: {
   storageClassName: "local-path",
   accessModes: ["ReadWriteOnce"],
   resources: { requests: { storage: "1Gi" } },
  },
 });
 new StatefulSet(name, {
  "metadata": {
   "name": name,
   "namespace": namespace.metadata.name,
   annotations: {
    "pulumi.com/timeoutSeconds": "120" // Only wait 1 minute for pulumi to timeout
   }
  },
  "spec": {
   "serviceName": `${name}-service`,
   "replicas": 1,
   "selector": {
    "matchLabels": {
     "app": name
    }
   },
   "template": {
    "metadata": {
     "labels": {
      "app": name
     }
    },
    "spec": {
     // nodeSelector: {
     // },
     "containers": [
      {
       "name": name,
       "image": image + ":" + tag,
       "imagePullPolicy": "Always",
       "securityContext": {
        "runAsUser": 0
       },
       "args": ["start", "--log", "$(LOG_LEVEL)", "--user", "$(SURREAL_USER)", "--pass", "$(SURREAL_PASSWORD)", "file:$(FILE_PATH)"],
       "env": [
        {
         name: "FILE_PATH",
         valueFrom: {configMapKeyRef: {name: config.metadata.name, key: "file-path"}}
        },
        {
         "name": "LOG_LEVEL",
         "valueFrom": {
          "configMapKeyRef": {
           "name": config.metadata.name,
           "key": "log-level"
          }
         }
        },
        {
         name: "SURREAL_USER",
         valueFrom: {secretKeyRef: {name: secret.metadata.name, key: "surreal-user"}}
        }, {
         name: "SURREAL_PASSWORD",
         valueFrom: {secretKeyRef: {name: secret.metadata.name, key: "surreal-password"}}
        }],
       "ports": [
        {
         "name": "surreal",
         "containerPort": 8000
        }
       ],
       "volumeMounts": [
        {
         "name": surrealPvc.metadata.name,
         "mountPropagation": "HostToContainer",
         "mountPath": "/var"
        }
       ]
      }
     ],
     "volumes": [
      {
       "name": surrealPvc.metadata.name,
       "persistentVolumeClaim": {
        "claimName": surrealPvc.metadata.name,
       }
      }
     ],
    }
   }
  }
 })

 new Service(name, {
  "metadata": {
   name: name,
   namespace: namespace.metadata.name,
   labels: {
    "app": name,
    "component": "database",
    "managed-by": "pulumi",
    "version": versions.surrealDB.version,
    "name": name,
    "service-criticality": "3"
   }
  },
  "spec": {
   "ports": [
    {
     "name": "surreal",
     "port": 8000,
     "protocol": "TCP",
     "targetPort": "surreal"
    }
   ],
   "selector": {
    "app": name
   }
  }
 });
}