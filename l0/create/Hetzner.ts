import * as pulumi from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud"
import {HCloudOrchestrator} from "../cloud_providers/hetzner/HCloudOrchestrator";
import {K3sCluster} from "../k3s/K3sCluster";
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
import {Input} from "@pulumi/pulumi";
import {installPulumiOperator} from "../components/pulumi-operator/chart";


export function createHetznerK3S(config: pulumi.Config, clusterName: string, mail: Input<string>) {
  const filename = `${clusterName}.yaml`;
  const hcloudToken = config.requireSecret("hcloudToken");
  const datacenterId = "fsn1-dc14"
  const location = "fsn1"
  const provider = new hcloud.Provider("hcloud-provider", {token: hcloudToken})
  const hetznerOrchestrator = new HCloudOrchestrator(provider, datacenterId, location);
  const k3sToken = new RandomPassword("k3sToken", {
    special: false,
    length: 30
  })
  const k3sCluster = new K3sCluster(hetznerOrchestrator, provider, hcloudToken, k3sToken);
  const result = k3sCluster.createCluster(clusterName, true, 1, 1)
// Write to a file
  result.kubeconfig.apply(value => {
    fs.writeFileSync(filename, value, 'utf8');
    console.log(`File written: ${filename}`);
  });
// Export config for other stacks and levels
  const readKubeconfig = fs.readFileSync(filename,"utf-8")
  const kubeconfig = pulumi.secret(readKubeconfig)
  const cluster = clusterName
  const kubernetesProviderConfig = {kubeconfig: readKubeconfig, cluster: clusterName, context: clusterName }
  const kubernetesProvider = new Provider("kube-provider", kubernetesProviderConfig)

  // install kubernetes extensions
  const cilium = installCilium({provider:kubernetesProvider});
  installCSIDriver(hcloudToken,{provider: kubernetesProvider, dependsOn: [cilium]})
  const certManager = installCertManager({provider:kubernetesProvider})
  installClusterIssuer(mail!!,{provider: kubernetesProvider, dependsOn: [certManager]})
  installIstio({provider: kubernetesProvider})

  const externalSecrets = installExternalSecretsOperator({provider: kubernetesProvider})

  //const pulumiAccessToken = config.getSecret("pulumiAccessToken")
  const pulumiOperatorNamespace = new Namespace("pulumi-kubernetes-operator", {
        metadata: {
          name: "pulumi-kubernetes-operator"
        },
      },
      {provider: kubernetesProvider}
  )
 // const pulumiOperator = installPulumiOperator(pulumiAccessToken!!, pulumiOperatorNamespace, {provider: kubernetesProvider})

  return {kubeconfig: kubeconfig, cluster: pulumi.output(cluster)}
}