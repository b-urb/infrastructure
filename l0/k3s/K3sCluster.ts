import * as fs from "fs";
import * as cloudinit from "@pulumi/cloudinit"
import * as command from "@pulumi/command"
import * as pulumi from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud";
import {CloudProviderTypes} from "../common/types/cloudProviderTypes";
import {masterConfig, workerConfig, nodeConfigDynamic} from "./cloudinit";
import {Input} from "@pulumi/pulumi";
import {HCloudOrchestrator} from "../cloud_providers/hetzner/HCloudOrchestrator";
import * as tls from "@pulumi/tls";
import {PrivateKey} from "@pulumi/tls";
import {updateKubeConfig} from "../utils";
import {RandomPassword} from "@pulumi/random";
import {K3sNodeConfig, NodeDescriptor, ClusterResult} from "./types";


export class K3sCluster<T extends keyof CloudProviderTypes> {
  private orchestrator: HCloudOrchestrator;
  private provider: hcloud.Provider;
  private hCloudToken: Input<string>;
  private k3sToken: RandomPassword;

  constructor(orchestrator: HCloudOrchestrator, provider: hcloud.Provider, hCloudToken: Input<string>, k3sToken: RandomPassword) {
    this.provider = provider;
    this.orchestrator = orchestrator;
    this.hCloudToken = hCloudToken;
    this.k3sToken = k3sToken;
  }

  createCluster(name: string, useCilium: boolean, masterCount: number, agentCount: number) {
    if (masterCount < 1)
    {
      throw Error("Master Count must at least one or the cluster would be empty.")
    }

    const publicKeyHuman = fs.readFileSync('/Users/bjornurban/.ssh/id_rsa.pub', 'utf8');
    const sshKey = new tls.PrivateKey("sshKey", {
      algorithm: "RSA",
      rsaBits: 4096,
    });
    const publicKeys = Array.of(pulumi.output(publicKeyHuman), sshKey.publicKeyOpenssh)


    // Create the SSH key resource on Hetzner Cloud
    const network = this.orchestrator.createNetwork("main-network")
    //Network needs a subnet also we do not need to use the value later on manually
    this.orchestrator.createSubnet(network, "main-subnet")
    const serverType = "cax21"
    const sshKeys = publicKeys.map((it, index) => new hcloud.SshKey(`ssh-${index}`, {
      publicKey: it,
    }, {provider: this.provider}));
    const initialNode = this.orchestrator.createServer(sshKeys, network, serverType, masterConfig(this.k3sToken.result, useCilium), "master-main")
    for (let i = 0; i < masterCount - 1; i++) {
      const serverName = `master-${i+1}`
      this.orchestrator.createServer(sshKeys, network, serverType, workerConfig(initialNode.ipv4Address, this.k3sToken.result, useCilium, false), serverName)
    }

      for (let i = 0; i < agentCount; i++) {
      const serverName =  `node-${i}`
      this.orchestrator.createServer(sshKeys, network, serverType, workerConfig(initialNode.ipv4Address, this.k3sToken.result, useCilium, true), serverName)
    }

    const kubeconfig = this.getConfig(initialNode.ipv4Address, sshKey); // Assuming this returns the kubeconfig as a string
    const newContextName = `${name}`; // Replace with your new context name
    const newClusterName = `${name}`; // Replace with your new cluster name
    const newUserName = `${name}`;
    const updatedConfig = updateKubeConfig(kubeconfig.stdout, initialNode.ipv4Address, newContextName, newClusterName, newUserName);
  // Call the function
    return {
      "ip": initialNode.ipv4Address,
      "sshKey": sshKey,
      "kubeconfig": updatedConfig,
      "kubeconfig-command": kubeconfig
    }
  }

  getCloudInit(master: Boolean) {
    const k3sInstallPath = master ? "./install-k3s-master.sh" : "./install-k3s.sh"
    return cloudinit.getConfig({
      gzip: false,
      base64Encode: false,

      parts: [
        {
          contentType: "text/x-shellscript",
          content: fs.readFileSync("./ensure-curl.sh", "utf8"),
        },
        {
          contentType: "text/x-shellscript",
          content: fs.readFileSync(k3sInstallPath, "utf8"),
        },
      ],
    });
  }

  createMasterNode(name: string, config: hcloud.ServerArgs, token: pulumi.Output<string>): pulumi.Output<hcloud.Server> {
    const modifiedConfig = {
      ...config,
      userData: token.apply(t => `#cloud-config\nyour-configuration-here\nK3S_TOKEN=${t}`),
    };

    const workerServer = new hcloud.Server(name, modifiedConfig);
    return pulumi.output(workerServer);
  }

  createWorkerNode(name: string, config: hcloud.ServerArgs, token: pulumi.Output<string>): pulumi.Output<hcloud.Server> {
    const modifiedConfig = {
      ...config,
      userData: token.apply(t => `#cloud-config\nyour-configuration-here\nK3S_TOKEN=${t}`),
    };

    const workerServer = new hcloud.Server(name, modifiedConfig);
    return pulumi.output(workerServer);
  }

  getNodeToken(server: hcloud.Server, name: string): pulumi.Output<string> {
    const tokenCommand = new command.local.Command(name, {
      create: `ssh user@${server.ipv4Address.apply(ip => ip)} 'cat /var/lib/rancher/k3s/server/node-token'`,
    }, {dependsOn: [server]});

    return tokenCommand.stdout;
  }

  getConfig(ip: Input<string>, sshKey: PrivateKey) {
    const fetchKubeconfig = new command.remote.Command("fetch-kubeconfig", {
      connection: {
        host: ip,
        user: "root",
        privateKey: sshKey.privateKeyPem,

      },
      create:
      // First, we use `until` to monitor for the k3s.yaml (our kubeconfig) being created.
      // Then we sleep 10, just in-case the k3s server needs a moment to become healthy. Sorry?
          "until [ -f /etc/rancher/k3s/k3s.yaml ]; do sleep 5; done; cat /etc/rancher/k3s/k3s.yaml; sleep 10;",
    },{deleteBeforeReplace: true});
    return fetchKubeconfig;
  }
}
