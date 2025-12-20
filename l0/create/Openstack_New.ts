import * as pulumi from "@pulumi/pulumi";
import * as openstack from "@pulumi/openstack";
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
import {ClusterSpec} from "../k3s/types";
import {K3sClusterComponent} from "../k3s/K3sClusterComponent";
import {OpenStackDriver} from "../k3s/providers/OpenStackDriver";


export function createOpenstackK3S(config: pulumi.Config, clusterName: string, mail: Input<string>, spec: ClusterSpec) {

  // const openstackProvider = new openstack.Provider("openstack-provider", {
  //   cloud:
  // })

// Create a web server
//   const test_server = new openstack.compute.Instance("test-server", {});
  const sshPublicKey = config.require("sshPublicKey");
  const cloudName = "openstack"
  const provider = new openstack.Provider("openstack-provider", {cloud: cloudName})
  if (spec.provider !== "openstack") {
    throw new Error(`Cluster provider mismatch: expected openstack, got ${spec.provider}`);
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

  const driver = new OpenStackDriver(provider);
  const clusterComponent = new K3sClusterComponent(
    resolvedName,
    spec,
    driver,
    pulumi.output(sshPublicKey),
    true
  );

  const kubernetesProviderConfig = {kubeconfig: clusterComponent.kubeconfig, cluster: resolvedName, context: resolvedName}
// Export config for other stacks and levels
  const kubeconfig = pulumi.secret(clusterComponent.kubeconfig)
  const kubernetesProvider = new Provider("kube-provider", kubernetesProviderConfig)

  // install kubernetes extensions
  // const cilium = installCilium({provider:kubernetesProvider});
  const certManager = installCertManager({provider: kubernetesProvider})
  installClusterIssuer(mail!!, {provider: kubernetesProvider, dependsOn: [certManager]})
  // installIstio({provider: kubernetesProvider})
  // const externalSecrets = installExternalSecretsOperator({provider: kubernetesProvider})
  new Namespace("flux-system", {
        metadata: {
          name: "flux-system"
        },
      },
      {provider: kubernetesProvider}
  )
  return {kubeconfig: kubeconfig, cluster: pulumi.output(resolvedName)}
}
