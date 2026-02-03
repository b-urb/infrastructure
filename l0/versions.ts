// versions.ts

export interface VersionEntry {
  version: string;
  depName: string;
  datasource: string;
  versioning: string;
  registryUrl?: string;
}

export const versions: Record<string, VersionEntry> = {
  juiceCsiDriver: {
    version: "0.31.1",
    depName: "juicefs-csi-driver",
    datasource: "helm",
    versioning: "helm",
    registryUrl: "https://juicedata.github.io/charts"
  },
  cilium: {
    version: "1.18.6",
    depName: "cilium",
    datasource: "helm",
    versioning: "helm",
    registryUrl: "https://helm.cilium.io/"
  },
  certManager: {
    version: "v1.19.3",
    depName: "cert-manager",
    datasource: "helm",
    versioning: "semver-coerced",
    registryUrl: "https://charts.jetstack.io"
  },
  istioBase: {
    version: "1.28.3",
    depName: "base",
    datasource: "helm",
    versioning: "helm",
    registryUrl: "https://istio-release.storage.googleapis.com/charts"
  },
  istioD: {
    version: "1.28.3",
    depName: "istiod",
    datasource: "helm",
    versioning: "helm",
    registryUrl: "https://istio-release.storage.googleapis.com/charts"
  },
  hcloudCSI: {
    version: "2.18.3",
    depName: "hcloud-csi",
    datasource: "helm",
    versioning: "helm",
    registryUrl: "https://charts.hetzner.cloud/"
  },
  externalSecrets: {
    version: "1.3.2",
    depName: "external-secrets",
    datasource: "helm",
    versioning: "semver-coerced",
    registryUrl: "https://charts.external-secrets.io"
  },
  pulumiOperator: {
    version: "0.8.1",
    depName: "pulumi-kubernetes-operator",
    datasource: "helm",
    versioning: "semver-coerced",
    registryUrl: "oci://ghcr.io/pulumi/helm-charts/pulumi-kubernetes-operator"
  },

};

export default versions;