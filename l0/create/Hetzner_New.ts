import * as pulumi from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud"
import {ClusterSpec, ClusterSpecOutput, ClusterProvider} from "../k3s/types";
import {K3sClusterComponent} from "../k3s/K3sClusterComponent";
import {
  installCertManager,
  installCilium,
  installClusterIssuer,
  installCSIDriver, installExternalSecretsOperator,
  installIstio
} from "../components/addons";
import {Namespace} from "@pulumi/kubernetes/core/v1";
import {Provider} from "@pulumi/kubernetes";
import {Input} from "@pulumi/pulumi";
import {installPulumiOperator} from "../components/pulumi-operator/chart";
import {HetznerDriver} from "../k3s/providers/HetznerDriver";


export function createHetznerK3SNew(config: pulumi.Config, clusterName: string, mail: Input<string>, spec: ClusterSpec): ClusterSpecOutput {
  const hcloudToken = config.requireSecret("hcloudToken");
  const sshPublicKey = config.require("sshPublicKey");

  const datacenterId = "fsn1-dc14"
  const location = "fsn1"
  const provider = new hcloud.Provider("hcloud-provider-new", {token: hcloudToken})

  if (spec.provider !== "hetzner") {
    throw new Error(`Cluster provider mismatch: expected hetzner, got ${spec.provider}`);
  }
  const existingMasterIp = config.get("existingMasterIp");
  const existingK3sToken = config.getSecret("existingK3sToken");
  if (existingMasterIp && existingK3sToken) {
    spec.joinExisting = {
      masterIp: pulumi.output(existingMasterIp),
      k3sToken: existingK3sToken,
    };
  }
  if (spec.name !== clusterName) {
    pulumi.log.warn(`Cluster name mismatch: spec.name='${spec.name}' vs clusterName='${clusterName}'. Using spec.name.`);
  }
  const resolvedName = spec.name;

  const driver = new HetznerDriver(provider, datacenterId, location);
  const cluster = new K3sClusterComponent(
    resolvedName,
    spec,
    driver,
    pulumi.output(sshPublicKey),
    true
  );
// Export config for other stacks and levels
  const kubeconfig = pulumi.secret(cluster.kubeconfig)
  const kubernetesProviderConfig = {kubeconfig: cluster.kubeconfig, cluster: resolvedName, context: resolvedName }
  const kubernetesProvider = new Provider("kube-provider-new", kubernetesProviderConfig)

  // Note: Kubernetes addons (Cilium, CSI, cert-manager, Istio, external-secrets) are installed
  // only by the old method (createHetznerK3S) to avoid duplicate resources.
  // The new method only joins nodes to the existing cluster.

  // This method is designed to join existing clusters, so spec.joinExisting must be present
  if (!spec.joinExisting) {
    throw new Error("createHetznerK3SNew requires spec.joinExisting to be defined");
  }

  return {
    name: pulumi.output(resolvedName),
    provider: "hetzner" as ClusterProvider,
    masterIp: pulumi.output(spec.joinExisting.masterIp),
    k3sToken: pulumi.output(spec.joinExisting.k3sToken),
    sshKey: cluster.sshKey,
    kubeconfig: kubeconfig,
    nodes: spec.nodes,
  }
}
