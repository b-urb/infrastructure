import * as pulumi from "@pulumi/pulumi";
import * as openstack from "@pulumi/openstack";
import * as fs from "fs";
import {RandomPassword} from "@pulumi/random";
import {
  installCertManager,
  installCilium,
  installClusterIssuer,
  installCSIDriver, installExternalSecretsOperator,
  installIstio
} from "../components/addons";
import {Namespace} from "@pulumi/kubernetes/core/v1";
import {Provider} from "@pulumi/kubernetes";
import {OpenStackOrchestrator} from "../cloud_providers/openstack/OpenStackOrchestrator";
import {Input} from "@pulumi/pulumi";
import {K3sClusterDev} from "../k3s/K3sClusterDev";


export function createOpenstackK3S(config: pulumi.Config, clusterName: string, mail: Input<string>) {

  // const openstackProvider = new openstack.Provider("openstack-provider", {
  //   cloud:
  // })

// Create a web server
//   const test_server = new openstack.compute.Instance("test-server", {});
  clusterName = `${clusterName}-dev`
  const filename = `${clusterName}.yaml`;
  const cloudName = "openstack"
  const provider = new openstack.Provider("openstack-provider", {cloud: cloudName})
  const openstackOrchestrator = new OpenStackOrchestrator(provider);
  const k3sToken = new RandomPassword("k3sToken", {
    special: false,
    length: 30
  })
  const k3sCluster = new K3sClusterDev(openstackOrchestrator, provider, k3sToken);
  const result = k3sCluster.createCluster(clusterName, true, 1, 0)
  const kubernetesProviderConfig = {kubeconfig: result.kubeconfig, cluster: clusterName, context: clusterName}
// Export config for other stacks and levels
  const cluster = clusterName
  const kubeconfig = pulumi.secret(result.kubeconfig)
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
  return {kubeconfig: result.kubeconfig, cluster: pulumi.output(clusterName)}
}