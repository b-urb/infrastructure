import {Source} from "../../../util/types";
import {Namespace} from "@pulumi/kubernetes/core/v1";
import {createPrometheusStackHelm} from "./chart/PrometheusStack";
import {createLokiHelm} from "./chart/Loki";
import {createKubernetesMonitoringHelm} from "./chart/KubernetesMonitoring";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export function createMonitoring(
  by: Source,
  namespace: Namespace,
  s3UserKey: pulumi.Output<string>,
  s3UserSecret: pulumi.Output<string>,
  grafanaAdminMail: string,
  grafanaAdminPassword: pulumi.Output<string>
) {
  switch (by) {
    case "manual":
      throw Error("Not Implemented")
    case "gke":
      console.log("Not Implemented")
      throw Error("Not Implemented")
    case "azure":
      console.log("Not Implemented")
      throw Error("Not Implemented")
    case "helm":
      // Create S3 credentials secret for Loki
      const s3Secret = new k8s.core.v1.Secret("loki-s3-credentials", {
        metadata: {
          name: "loki-s3-credentials",
          namespace: namespace.metadata.name
        },
        stringData: {
          "s3-user-key": s3UserKey,
          "s3-user-secret": s3UserSecret,
        }
      });

      // Create Thanos object storage config secret
      const thanosObjstoreConfig = pulumi.all([s3UserKey, s3UserSecret]).apply(
        ([accessKey, secretKey]) => {
          return `type: S3
config:
  endpoint: "eu2.contabostorage.com"
  bucket: "prometheus-blocks"
  region: "EU"
  access_key: "${accessKey}"
  secret_key: "${secretKey}"
  insecure: false`;
        }
      );

      const thanosSecret = new k8s.core.v1.Secret("thanos-objstore-config", {
        metadata: {
          name: "thanos-objstore-config",
          namespace: namespace.metadata.name
        },
        stringData: {
          "objstore.yml": thanosObjstoreConfig
        }
      });

      // Deploy monitoring stack
      const prometheusStack = createPrometheusStackHelm(namespace, thanosSecret, grafanaAdminMail, grafanaAdminPassword);
      const loki = createLokiHelm(namespace, s3Secret);

      // Construct Loki gateway URL
      // Loki push endpoint (k8s-monitoring expects the full /loki/api/v1/push path)
      const lokiUrl = pulumi.interpolate`http://loki-gateway.${namespace.metadata.name}.svc.cluster.local/loki/api/v1/push`;

      const kubernetesMonitoring = createKubernetesMonitoringHelm(namespace, lokiUrl);

      return { prometheusStack, loki, kubernetesMonitoring };
    case "aws":
      console.log("Not Implemented")
      throw Error("Not Implemented")
  }
}
