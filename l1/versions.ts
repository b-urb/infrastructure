// versions.ts

export interface VersionEntry {
  version: string;
  depName: string;
  datasource: string;
  versioning: string;
  registryUrl?: string;
}

export const versions: Record<string, VersionEntry> = {
  surrealDB: {
    version: "v2.6.5",
    depName: "surrealdb/surrealdb",
    datasource: "docker",
    versioning: "semver-coerced",
  },
  redis: {
    version: "20.6.1",
    depName: "redis",
    datasource: "helm",
    versioning: "helm",
    registryUrl: "oci://registry-1.docker.io/bitnamicharts/redis"
  },
  postgresql: {
    version: "16.3.3",
    depName: "postgresql",
    datasource: "helm",
    versioning: "helm",
    registryUrl: "oci://registry-1.docker.io/bitnamicharts/postgresql"
  },
  kubePrometheusStack: {
    version: "80.14.4",
    depName: "kube-prometheus-stack",
    datasource: "helm",
    versioning: "helm",
    registryUrl: "https://prometheus-community.github.io/helm-charts"
  },
  loki: {
    version: "6.55.0",
    depName: "loki",
    datasource: "helm",
    versioning: "helm",
    registryUrl: "https://grafana.github.io/helm-charts"
  },
  kubernetesMonitoring: {
    version: "3.8.9",
    depName: "k8s-monitoring",
    datasource: "helm",
    versioning: "helm",
    registryUrl: "https://grafana.github.io/helm-charts"
  },
};

export default versions;