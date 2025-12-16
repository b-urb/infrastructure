import {apiextensions, helm, Provider} from "@pulumi/kubernetes";
import {Secret} from "@pulumi/kubernetes/core/v1/secret";
import {CustomResourceOptions, Input, Lifted, OutputInstance} from "@pulumi/pulumi";
import {Namespace} from "@pulumi/kubernetes/core/v1";
import versions from "../versions";

export function installCilium(opts: CustomResourceOptions) {
  return new helm.v4.Chart("cilium", {
    chart: versions.cilium.depName,
    version: versions.cilium.version,
    namespace: "kube-system",
    repositoryOpts: {
      repo: versions.cilium.registryUrl,
    },
    values: {
      securityContext: {
        capabilities: {
          ciliumAgent: ["SYS_ADMIN", "NET_ADMIN", "SYS_MODULE", "SYS_RESOURCE", "IPC_LOCK"],
          cleanCiliumState: ["NET_ADMIN", "SYS_ADMIN", "SYS_RESOURCE"]
        }
      },
      // Disable toFQDNs DNS proxy to avoid conflict with K3s CoreDNS
      toFQDNs: {
        enabled: false
      }
    }
  }, opts)
}



export function installCertManager(opts: CustomResourceOptions) {
  //TODO: Switch to Helm Release, to enable Hook Support
  return new helm.v4.Chart("cert-manager", {
    chart: versions.certManager.depName,
    version: versions.certManager.version,
    repositoryOpts: {
      repo: versions.certManager.registryUrl,
    },
    namespace: "kube-system",
    values: {
      installCRDs: true,
    },
  }, opts);
}

export function installExternalSecretsOperator(opts: CustomResourceOptions) {
  //TODO: Switch to Helm Release, to enable Hook Support
  const ns = new Namespace("external-secrets",{
    metadata: {
      name: "external-secrets"
    }
  }, opts)
  return new helm.v4.Chart("external-secrets", {
    chart: versions.externalSecrets.depName ,
    version: versions.externalSecrets.version,
    repositoryOpts: {
      repo: versions.externalSecrets.registryUrl,
    },
    namespace: ns.metadata.name,
    values: {
      installCRDs: true,
    },
  }, opts);
  //TODO: create secret
}
export function installIstio(opts: CustomResourceOptions) {
  //TODO: Switch to Helm Release, to enable Hook Support
  const ns = new Namespace("istio-system",{
    metadata: {
      name: "istio-system"
    }
  }, opts)
  new helm.v4.Chart("istio-base", {
    chart: versions.istioBase.depName,
    version: versions.istioBase.version,
    repositoryOpts: {
      repo: versions.istioBase.registryUrl,
    },
    namespace: ns.metadata.name,
    values: {
      installCRDs: true,
    },
  }, opts);

  return new helm.v4.Chart("istiod", {
    chart: versions.istioD.depName,
    version: versions.istioD.version,
    repositoryOpts: {
      repo: versions.istioD.registryUrl,
    },
    namespace: ns.metadata.name,
    values: {
      "istio_cni": {
        enabled: true
      },
    },
  }, opts);
}

export function installClusterIssuer(mail: Input<string>, opts: CustomResourceOptions) {
  return new apiextensions.CustomResource("letsencrypt-issuer", {
    apiVersion: "cert-manager.io/v1",
    kind: "ClusterIssuer",
    metadata: {
      name: "letsencrypt",
    },
    spec: {
      acme: {
        server: "https://acme-v02.api.letsencrypt.org/directory",
        email: mail,
        privateKeySecretRef: {
          name: "letsencrypt",
        },
        solvers: [{
          http01: {
            ingress: {
              class: "traefik",
            },
          },
        }],
      },
    },
  }, opts);
}

export function installCSIDriver(token: Input<string>, opts: CustomResourceOptions) {
  new Secret("hcloud-token",{
    metadata: {
      name: "hcloud",
      namespace: "kube-system"
    },
    stringData: {
      "token": token
    }
  },opts)

  return new helm.v4.Chart("hcloud-csi", {
    chart: versions.hcloudCSI.depName,
    namespace: "kube-system",
    version: versions.hcloudCSI.version,
    repositoryOpts: {
      repo: versions.hcloudCSI.registryUrl
    },
  },opts)
}