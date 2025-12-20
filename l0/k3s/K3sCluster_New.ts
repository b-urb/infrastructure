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
import {generateNodeName, validateNodeNames} from "./nameGenerator";


export class K3sCluster<T extends keyof CloudProviderTypes> {
  private orchestrator: HCloudOrchestrator;
  private provider: hcloud.Provider;
  private hCloudToken: Input<string>;
  private k3sToken: RandomPassword;
  private sshPublicKey: pulumi.Output<string>;

  constructor(orchestrator: HCloudOrchestrator, provider: hcloud.Provider, hCloudToken: Input<string>, k3sToken: RandomPassword, sshPublicKey: pulumi.Output<string>) {
    this.provider = provider;
    this.orchestrator = orchestrator;
    this.hCloudToken = hCloudToken;
    this.k3sToken = k3sToken;
    this.sshPublicKey = sshPublicKey;
  }

  /**
   * Validates cluster state to ensure master count never reaches zero
   * This runs during pulumi preview/up before making changes
   */
  private validateClusterIntegrity(nodeConfigs: K3sNodeConfig[]): void {
    const masterCount = nodeConfigs.filter(n => n.role === "master").length;

    if (masterCount === 0) {
      throw new Error(
        "CRITICAL: Cannot reduce master count to zero. " +
        "This would destroy the cluster. " +
        "At least one master node must remain in nodeConfigs."
      );
    }

    if (masterCount === 1) {
      pulumi.log.warn(
        "WARNING: Only one master node configured. " +
        "Cluster has no high availability. " +
        "Consider adding additional masters before removing the initial master.",
        this
      );
    }
  }

  createCluster(
    name: string,
    useCilium: boolean,
    nodeConfigs: K3sNodeConfig[],
    existingMasterIp?: Input<string>,  // For joining existing clusters
    existingK3sToken?: Input<string>   // Token from existing cluster
  ) {
    // FIRST: Validate cluster integrity
    this.validateClusterIntegrity(nodeConfigs);

    const publicKeyHuman = this.sshPublicKey;
    const sshKey = new tls.PrivateKey("sshKey", {
      algorithm: "RSA",
      rsaBits: 4096,
    });
    const publicKeys = Array.of(pulumi.output(publicKeyHuman), sshKey.publicKeyOpenssh)


    // Create the SSH key resource on Hetzner Cloud
    const network = this.orchestrator.createNetwork("main-network")
    //Network needs a subnet also we do not need to use the value later on manually
    this.orchestrator.createSubnet(network, "main-subnet")
    const sshKeys = publicKeys.map((it, index) => new hcloud.SshKey(`ssh-${index}`, {
      publicKey: it,
    }, {provider: this.provider}));

    // Convert K3sNodeConfig array to NodeDescriptor array with generated names
    const nodeDescriptors: NodeDescriptor[] = nodeConfigs.map((config, index) => {
      let nodeName: string;
      let isInitialMaster = false;

      // Use custom name if provided, otherwise generate
      if (config.name) {
        nodeName = config.name;
      } else {
        // Generate deterministic name based on cluster name, role and index
        if (config.role === "master") {
          const masterIndex = nodeConfigs.slice(0, index).filter(n => n.role === "master").length;
          nodeName = generateNodeName(name, "master", masterIndex);

          // First master is the initial/bootstrap master
          if (masterIndex === 0) {
            isInitialMaster = true;
          }
        } else {
          const workerIndex = nodeConfigs.slice(0, index).filter(n => n.role === "worker").length;
          nodeName = generateNodeName(name, "node", workerIndex);
        }
      }

      // Mark first master as initial if custom names are used
      if (config.role === "master" && !isInitialMaster) {
        const masterIndex = nodeConfigs.slice(0, index).filter(n => n.role === "master").length;
        if (masterIndex === 0) {
          isInitialMaster = true;
        }
      }

      return {
        ...config,
        name: nodeName,
        isInitialMaster
      };
    });

    // Validate all node names are unique and DNS-compatible
    validateNodeNames(nodeDescriptors.map(d => d.name));

    // Validate at least one master exists
    const masters = nodeDescriptors.filter(n => n.role === "master");
    if (masters.length < 1) {
      throw Error("At least one master node is required.");
    }

    // Determine actual initial master based on state and existingMasterIp
    let actualInitialMaster: NodeDescriptor | null;
    let isNewCluster: boolean;

    if (existingMasterIp && existingK3sToken) {
      // Joining existing cluster - no initial master needed
      isNewCluster = false;
      nodeDescriptors.forEach(nd => nd.isInitialMaster = false);
      actualInitialMaster = null;

      pulumi.log.info(
        `Joining existing cluster. All nodes will connect to master at ${existingMasterIp}`,
        this
      );
    } else {
      // New cluster or expanding existing cluster managed by this stack
      const firstMasterDescriptor = nodeDescriptors.find(n => n.role === "master");

      if (!firstMasterDescriptor) {
        throw new Error("At least one master node is required in nodeConfigs");
      }

      // First master in array becomes the bootstrap master
      firstMasterDescriptor.isInitialMaster = true;
      actualInitialMaster = firstMasterDescriptor;
      isNewCluster = true;

      // Ensure others are not marked as initial
      nodeDescriptors
        .filter(n => n !== firstMasterDescriptor && n.role === "master")
        .forEach(n => n.isInitialMaster = false);

      pulumi.log.info(
        `Creating new cluster with initial master: ${actualInitialMaster.name}`,
        this
      );
    }

    // Create all nodes using nodeConfigDynamic
    const servers = nodeDescriptors.map(descriptor => {
      const masterIpForJoin = existingMasterIp
        ? existingMasterIp  // Use provided existing master IP
        : descriptor.isInitialMaster
          ? undefined  // Initial master doesn't join anything
          : actualInitialMaster?.ipv4Address;  // New nodes join the initial master

      const cloudInit = nodeConfigDynamic(
        existingK3sToken || this.k3sToken.result,  // Use existing token if joining
        useCilium,
        descriptor.isInitialMaster && !existingMasterIp,  // Only bootstrap if new cluster
        masterIpForJoin,
        descriptor.role === "worker",
        descriptor.labels,
        descriptor.taints
      );

      // Determine if this server should be protected
      const shouldProtect = descriptor.isInitialMaster && !existingMasterIp;

      const resourceOptions: pulumi.ResourceOptions = shouldProtect
        ? { protect: true }  // Prevent accidental deletion of initial master
        : {};

      return this.orchestrator.createServer(
        sshKeys,
        network,
        descriptor.serverType,  // Use per-node server type
        cloudInit,
        descriptor.name,
        resourceOptions  // Pass protection options
      );
    });

    // Get the initial master server for kubeconfig retrieval
    const initialNode = servers[nodeDescriptors.findIndex(n => n.isInitialMaster)];

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
