import * as k8s from "@pulumi/kubernetes"
import {WebService} from "../../types/WebService";
import {Deployment} from "@pulumi/kubernetes/apps/v1";
import {ConfigMap, Namespace, Secret} from "@pulumi/kubernetes/core/v1";

export function createRustdeskManual(namespace: Namespace, secret: Secret, config: ConfigMap) {
  const website =  new WebService("rustdesk", "rustdesk.tecios.de", namespace, "rustdesk/rustdesk-server", "1", {}, "prod");


}
function createRustdesk(website: WebService, secret: Secret, config: ConfigMap): Deployment {

}
function createRustdeskService(webservice: WebService): k8s.core.v1.Service {

  return new k8s.core.v1.Service(webservice.name, {
        "metadata": {
          name: webservice.name,
          namespace: webservice.namespace.metadata.name,
          labels: {
            "app": webservice.name,
            "component": "remote-desktop",
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
function createRustdeskIngress(webservice: WebService): k8s.networking.v1.Ingress {

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