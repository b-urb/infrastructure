import * as k8s from "@pulumi/kubernetes"
import {WebService} from "../../types/WebService";
import {Deployment} from "@pulumi/kubernetes/apps/v1";
import { Namespace, Secret} from "@pulumi/kubernetes/core/v1";
import {keelAnnotationsDev} from "../../../util/globals";

export function createUmamiManual(namespace: Namespace, secret: Secret) {
  const website =  new WebService("umami", "stats.burbn.de", namespace, "docker.umami.dev/umami-software/umami", "postgresql-v2.11.2", {}, "prod");

  const deployment = createUmamiDeployments(website, secret);
  const service = createUmamiService(website);
  const ingress = createUmamiIngress(website);
}
function createUmamiDeployments(website: WebService, secret: Secret): Deployment {
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
          // nodeSelector: {
          //
          // },
          "containers": [
            {
              "name": website.name,
              "image": website.registryImage + ":" + website.imageTag,
              "imagePullPolicy": "Always",
              "env": [
                {
                  name: "DATABASE_URL",
                  valueFrom: {secretKeyRef: {name: secret.metadata.name, key: "db-connection-string"}}
                },
              ],
              "ports": [
                {
                  "name": "http",
                  "containerPort": 3000
                },],
              "livenessProbe": {
                httpGet: {
                  path: "/",
                  port: "http"
                }
              },
              readinessProbe: {
                httpGet: {
                  path: "/",
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
function createUmamiService(webservice: WebService): k8s.core.v1.Service {

  return new k8s.core.v1.Service(webservice.name, {
    "metadata": {
      name: webservice.name,
      namespace: webservice.namespace.metadata.name,
      labels: {
        "app": webservice.name,
        "component": "analytics",
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
function createUmamiIngress(webservice: WebService): k8s.networking.v1.Ingress {

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