import * as k8s from "@pulumi/kubernetes"
import {getEnv} from "@pulumi/kubernetes/utilities";
import {WebService} from "../../types/WebService";
import {Deployment} from "@pulumi/kubernetes/apps/v1";
import {ConfigMap, Namespace, PersistentVolumeClaim, Secret} from "@pulumi/kubernetes/core/v1";
import {keelAnnotationsProd} from "../../../util/globals";
import {createSecretWrapper} from "../../secrets";
import {Input} from "@pulumi/pulumi";
import versions from "../../versions";

export function createVaultwardenManual(namespace: Namespace, configMap: ConfigMap, secretData: Input<{[key: string]:  Input<string>}>) {
  const website =  new WebService("vaultwarden", "warden.burbn.de", namespace, versions.vaultwarden.depName, versions.vaultwarden.version, {}, "prod");

  const deployment = createVaultwardenDeployments(website, configMap, secretData);
  const service = createVaultwardenService(website);
  const ingress = createVaultwardenIngress(website);
}
function createVaultwardenDeployments(website: WebService, configMap: ConfigMap, secretData: Input<{[key: string]:  Input<string>}>): Deployment {
  const secret = createSecretWrapper(website.name, website.namespace, secretData)

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
        ...keelAnnotationsProd

      }
    },
    "spec": {
      replicas: 1,
      "strategy": {
        "type": "RollingUpdate"
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
          // },
          "containers": [
            {
              "name": website.name,
              "image": website.registryImage + ":" + website.imageTag,
              "imagePullPolicy": "Always",
              "env": [
                {name: "DATABASE_URL",
                valueFrom: {secretKeyRef: { name: secret.metadata.name, key: "database-url" }}},
                {name: "YUBICO_SECRET_KEY",
                  valueFrom: {secretKeyRef: { name: secret.metadata.name, key: "yubico-client-secret" }}},
                {name: "YUBICO_CLIENT_ID",
                  valueFrom: {secretKeyRef: { name: secret.metadata.name, key: "yubico-client-id" }}},
                {name: "DOMAIN",
                  valueFrom: {configMapKeyRef: { name: configMap.metadata.name, key: "url" }}}
              ],
              "ports": [
                {
                  "name": "http",
                  "containerPort": 80
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
              },
            }
          ],
        }

      }
    }
  })
}
function createVaultwardenService(webservice: WebService): k8s.core.v1.Service {

  return new k8s.core.v1.Service(webservice.name, {
        "metadata": {
          name: webservice.name,
          namespace: webservice.namespace.metadata.name,
          labels: {
            "app": webservice.name,
            "component": "password-manager",
            "managed-by": "pulumi",
            "version": webservice.imageTag,
            "name": webservice.name,
            "service-criticality": "1"
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
function createVaultwardenIngress(webservice: WebService): k8s.networking.v1.Ingress {

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