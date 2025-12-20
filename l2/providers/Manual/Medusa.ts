import * as k8s from "@pulumi/kubernetes"
import {WebService} from "../../types/WebService";
import {Deployment} from "@pulumi/kubernetes/apps/v1";
import {ConfigMap, Namespace, Secret} from "@pulumi/kubernetes/core/v1";
import {keelAnnotationsDev} from "../../../util/globals";

export function createMedusaManual(namespace: Namespace, secret: Secret) {
  const medusaBackend =  new WebService("medusa", "medusa.tecios.de", namespace, "ghcr.io/breuerfelix/medusa/backend", "latest", {}, "prod");
  const medusaAdmin =  new WebService("medusa-admin", "store-admin.tecios.de", namespace, "ghcr.io/breuerfelix/medusa/admin", "latest", {}, "prod");

  const deploymentBackend = createMedusaDeployment(medusaBackend, secret);
  const serviceBackend = createMedusaService(medusaBackend);
  const ingressBackend = createMedusaIngress(medusaBackend);

  const deploymentAdmin = createMedusaAdminDeployment(medusaAdmin);
  const serviceAdmin = createMedusaService(medusaAdmin);
  const ingressAdmin = createMedusaIngress(medusaAdmin);
}
function createMedusaDeployment(website: WebService, secret: Secret): Deployment {
  return new k8s.apps.v1.Deployment(website.name, {
    metadata: {
      name: website.name,
      namespace: website.namespace.metadata.name,
      labels: {
        name: website.name
      },
      "annotations": {
        "keel.sh/trigger": "poll",
        "keel.sh/pollSchedule": "@every 5m",
        ...keelAnnotationsDev

      }
    },
    "spec": {
      "strategy": {
        "type": "Recreate"
      },
      "selector": {
        "matchLabels": {
          "name": website.name
        }
      },

      "template": {
        "metadata": {
          "labels": {
            "name": website.name
          }
        },
        "spec": {
          nodeSelector: {
            "owner": "bjoern"
          },
          "containers": [
            {
              "name": website.name,
              "image": website.registryImage + ":" + website.imageTag,
              "imagePullPolicy": "Always",
              "env": [
                {
                  name: "ADMIN_CORS",
                  value: "https://store-admin.burbn.de"
                },
                {name: "DATABASE_URL", valueFrom: {secretKeyRef: {name: secret.metadata.name, key: "postgres-connection-string"}}},
                {name: "REDIS_URL", valueFrom: {secretKeyRef: {name: secret.metadata.name, key: "redis-connection-string"}}},
              ],
              "ports": [
                {
                  "name": "http",
                  "containerPort": 9000
                },],
            }
          ],
        }

      }
    }
  })
}

function createMedusaAdminDeployment(website: WebService): Deployment {
  return new k8s.apps.v1.Deployment(website.name, {
    metadata: {
      name: website.name,
      namespace: website.namespace.metadata.name,
      labels: {
        name: website.name
      },
      "annotations": {
        "keel.sh/trigger": "poll",
        "keel.sh/pollSchedule": "@every 5m",
        ...keelAnnotationsDev
      }
    },
    "spec": {
      "strategy": {
        "type": "Recreate"
      },
      "selector": {
        "matchLabels": {
          "name": website.name
        }
      },

      "template": {
        "metadata": {
          "labels": {
            "name": website.name
          }
        },
        "spec": {
          nodeSelector: {
            "owner": "bjoern"
          },
          "containers": [
            {
              "name": website.name,
              "image": website.registryImage + ":" + website.imageTag,
              "imagePullPolicy": "Always",
              "env": [
                {
                  name: "MEDUSA_URL",
                  value: "https://medusa.tecios.de"
                }],
              "ports": [
                {
                  "name": "http",
                  "containerPort": 80
                },],
              "livenessProbe": {
                initialDelaySeconds: 200,
                httpGet: {
                  path: "/login",
                  port: "http"
                },
                periodSeconds: 60
              },
              readinessProbe: {
                initialDelaySeconds: 200,
                httpGet: {
                  path: "/login",
                  port: "http"
                }
              }
            }
          ],
        }
      }
    }
  })
}



function createMedusaService(webservice: WebService): k8s.core.v1.Service {
  const component = webservice.name === "medusa-admin" ? "ecommerce-admin" : "ecommerce-backend";

  return new k8s.core.v1.Service(webservice.name, {
    "metadata": {
      name: webservice.name,
      namespace: webservice.namespace.metadata.name,
      labels: {
        "app": webservice.name,
        "component": component,
        "managed-by": "pulumi",
        "version": webservice.imageTag,
        "name": webservice.name,
        "service-criticality": "3"
      }
    },
    "spec": {
      "ports": [
        {
          "name": "http",
          "port": 80,
          "protocol": "TCP",
          "targetPort": "http"
        }
      ],
      "selector": {
        "name": webservice.name
      }
    }
  });
}
function createMedusaIngress(webservice: WebService): k8s.networking.v1.Ingress {

  return new k8s.networking.v1.Ingress(webservice.name, {
        metadata: {
          annotations: {
            "kubernetes.io/ingress.class": "traefik",
            "cert-manager.io/cluster-issuer": "letsencrypt",
            ...webservice.ingressAnnotations
          },
          namespace: webservice.namespace.metadata.name
        },

        spec: {
          tls: [{
            secretName: webservice.name + "-tls",
            hosts: [webservice.url]
          }],
          rules: [
            {
              host: webservice.url,
              http: {
                paths: [{
                  pathType: "Prefix",
                  path: "/",
                  backend: {service: {name: webservice.name, port:{number: 80 }}}
                }]
              }
            }]

        }
      }
  );
}