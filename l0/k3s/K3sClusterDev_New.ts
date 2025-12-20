import * as fs from "fs";
import * as cloudinit from "@pulumi/cloudinit"
import * as command from "@pulumi/command"
import * as pulumi from "@pulumi/pulumi";
import {CloudProviderTypes} from "../common/types/cloudProviderTypes";
import {masterConfig, masterConfigWithSsh, workerConfig, workerConfigWithSSH} from "./cloudinit";
import * as openstack from "@pulumi/openstack"
import {Input} from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import {PrivateKey} from "@pulumi/tls";
import {updateKubeConfig} from "../utils";
import {RandomPassword} from "@pulumi/random";
import {OpenStackOrchestrator} from "../cloud_providers/openstack/OpenStackOrchestrator";
import { Keypair } from "@pulumi/openstack/compute/keypair";
import {Instance} from "@pulumi/openstack/compute";
import {FloatingIpAssociate} from "@pulumi/openstack/networking";


export class K3sClusterDev<T extends keyof CloudProviderTypes> {
  private orchestrator: OpenStackOrchestrator;
  private provider: openstack.Provider;
  private k3sToken: RandomPassword;
  private sshPublicKey: pulumi.Output<string>;

  constructor(orchestrator: OpenStackOrchestrator, provider: openstack.Provider, k3sToken: RandomPassword, sshPublicKey: pulumi.Output<string>) {
    this.provider = provider;
    this.orchestrator = orchestrator;
    this.k3sToken = k3sToken;
    this.sshPublicKey = sshPublicKey;
  }

  createCluster(name: string, useCilium: boolean, masterCount: number, agentCount: number) {
    if (masterCount < 1)
    {
      throw Error("Master Count must at least one or the cluster would be empty.")
    }
    const floatingIp = new openstack.networking.FloatingIp("floating-ip", {
      address: "185.113.124.117",
      pool: "public",
      region: "fra",
      tenantId: "f3344e21ff8a4cb7b0b93ee5c53bf09c",
    }, {
      //provider: this.provider,
      protect: true,
    });
    const publicKeyHuman = this.sshPublicKey;
    const sshKey = new tls.PrivateKey("sshKey", {
      algorithm: "RSA",
      rsaBits: 4096,
    });
    const publicKeys = Array.of(sshKey.publicKeyOpenssh,pulumi.output(publicKeyHuman))

    const multiKey = pulumi.interpolate`${sshKey.publicKeyOpenssh} \n ${publicKeyHuman}`
    const multiKeypair = new Keypair(`ssh-key`, {
      name:`ssh-key`,
      publicKey: multiKey
    }, {provider: this.provider});

    //
    const sshKeys = publicKeys.map((it, index) => new Keypair(`ssh-${index}`, {
      name:`ssh-${index}`,
      publicKey: it
    }, {provider: this.provider}));


    const initialNode = this.orchestrator.createServer(sshKeys, masterConfigWithSsh(this.k3sToken.result, useCilium,sshKeys, floatingIp.address), "master-main", floatingIp)
    for (let i = 0; i < masterCount - 1; i++) {
      const serverName = `master-${i+1}`
      this.orchestrator.createServer(sshKeys, workerConfigWithSSH(initialNode.ip, this.k3sToken.result, useCilium, false, publicKeys), serverName, floatingIp)
    }

    for (let i = 0; i < agentCount; i++) {
      const serverName =  `node-${i}`
      this.orchestrator.createServer(sshKeys, workerConfig(initialNode.ip, this.k3sToken.result, useCilium, true), serverName,floatingIp)
    }

    const kubeconfig = this.getConfig(initialNode.ip, sshKey, initialNode.associate, initialNode.server); // Assuming this returns the kubeconfig as a string
    const newContextName = `${name}`; // Replace with your new context name
    const newClusterName = `${name}`; // Replace with your new cluster name
    const newUserName = `${name}`; // Replace with your new cluster name
    const updatedConfig = updateKubeConfig(kubeconfig, initialNode.ip, newContextName, newClusterName, newUserName);
    // Call the function
    return {
      "ip": initialNode.ip,
      "sshKey": sshKey,
      "kubeconfig": updatedConfig
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


  getConfig(ip: Input<string>, sshKey: PrivateKey, associate: FloatingIpAssociate, server: Instance) {
    const fetchKubeconfig = new command.remote.Command("fetch-kubeconfig", {
      connection: {
        host: ip,
        user: "ubuntu",
        privateKey: sshKey.privateKeyPem,
      },
      triggers: [server.updated],
      create:
      // First, we use `until` to monitor for the k3s.yaml (our kubeconfig) being created.
      // Then we sleep 10, just in-case the k3s server needs a moment to become healthy. Sorry?
          "until [ -f /etc/rancher/k3s/k3s.yaml ]; do sleep 5; done; sudo cat /etc/rancher/k3s/k3s.yaml; sleep 10;",
    },{dependsOn: associate });
    return fetchKubeconfig.stdout;
  }
}


