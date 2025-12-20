import * as pulumi from "@pulumi/pulumi";
import * as command from "@pulumi/command";
import * as tls from "@pulumi/tls";
import {RandomPassword, RandomString} from "@pulumi/random";
import {ClusterSpec, NodeDescriptor, NodeSpec} from "./types";
import {nodeConfigDynamic} from "./cloudinit";
import {generateNodeNameFromId, validateNodeNames} from "./nameGenerator";
import {updateKubeConfig} from "../utils";
import {ClusterDriver, ClusterServerResult} from "./providers/types";
import {MasterRemovalGuard} from "./MasterRemovalGuard";
import {NodeDrainGuard} from "./NodeDrainGuard";

export class K3sClusterComponent extends pulumi.ComponentResource {
  public readonly kubeconfig: pulumi.Output<string>;
  public readonly clusterName: pulumi.Output<string>;
  public readonly servers: ClusterServerResult[];
  public readonly sshKey: tls.PrivateKey;

  constructor(
    name: string,
    spec: ClusterSpec,
    driver: ClusterDriver,
    sshPublicKey: pulumi.Input<string>,
    useCilium: boolean,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("k3s:ClusterComponent", name, {}, opts);

    this.clusterName = pulumi.output(spec.name);
    if (spec.provider !== driver.kind) {
      throw new Error(`Cluster provider '${spec.provider}' does not match driver '${driver.kind}'.`);
    }

    if (spec.joinExisting && (!spec.joinExisting.masterIp || !spec.joinExisting.k3sToken)) {
      throw new Error("joinExisting requires both masterIp and k3sToken.");
    }

    const nodeDescriptors = this.buildNodeDescriptors(spec);
    const masterNodes = nodeDescriptors.filter(n => n.role === "master");
    if (masterNodes.length < 1) {
      throw new Error("At least one master node is required.");
    }
    if (masterNodes.length === 1) {
      pulumi.log.warn(
        "WARNING: Only one master node configured. Consider adding additional masters before removing the bootstrap master.",
        this
      );
    }

    const bootstrapId = spec.bootstrap?.masterId ?? masterNodes[0].id;
    const bootstrapNode = nodeDescriptors.find(n => n.id === bootstrapId);
    if (!bootstrapNode) {
      throw new Error(`bootstrap.masterId '${bootstrapId}' not found in nodes.`);
    }


    this.sshKey = new tls.PrivateKey("ssh", {
      algorithm: "ED25519",
      rsaBits: 4096,
    }, {parent: this});

    const publicKeys = [pulumi.output(sshPublicKey), this.sshKey.publicKeyOpenssh];
    const driverCtx = driver.init({clusterName: spec.name, publicKeys, parent: this});

    const k3sToken = spec.joinExisting?.k3sToken ?? new RandomPassword(`${name}-k3s-token`, {
      special: false,
      length: 30,
    }, {parent: this}).result;

    const joinExistingMasterIp = spec.joinExisting?.masterIp;
    const primaryMaster = spec.joinExisting ? masterNodes[0] : bootstrapNode;

    const primaryMasterServer = this.createServer(
      primaryMaster,
      driver,
      driverCtx,
      k3sToken,
      useCilium,
      joinExistingMasterIp,
      !spec.joinExisting && primaryMaster.id === bootstrapId,
      [],
      undefined,  // No masterIp yet (this IS the master)
      undefined   // No SSH key yet
    );

    const masterIds = masterNodes.map(m => m.id);
    const guard = new MasterRemovalGuard(`${name}-master-guard`, {
      masterIds,
      bootstrapIp: primaryMasterServer.ip,
      sshPrivateKey: this.sshKey.privateKeyPem,
      sshUser: driver.sshUser,
    }, {parent: this});

    const joinMasterIp = spec.joinExisting?.masterIp ?? primaryMasterServer.ip;

    const otherNodes = nodeDescriptors.filter(n => n.id !== primaryMaster.id);
    const otherServers = otherNodes.map(descriptor => {
      const isBootstrap = !spec.joinExisting && descriptor.id === bootstrapId;
      const dependsOn = descriptor.role === "master" && !isBootstrap ? [guard] : [];
      return this.createServer(
        descriptor,
        driver,
        driverCtx,
        k3sToken,
        useCilium,
        joinMasterIp,
        isBootstrap,
        dependsOn,
        primaryMasterServer.ip,      // Pass master IP
        this.sshKey.privateKeyPem    // Pass SSH key
      );
    });

    this.servers = [primaryMasterServer, ...otherServers];

    const kubeconfigCommand = new command.remote.Command(`${name}-fetch-kubeconfig`, {
      connection: {
        host: primaryMasterServer.ip,
        user: driver.sshUser,
        privateKey: this.sshKey.privateKeyPem,
      },
      create:
        "until [ -f /etc/rancher/k3s/k3s.yaml ]; do sleep 5; done; cat /etc/rancher/k3s/k3s.yaml; sleep 10;",
    }, {parent: this, dependsOn: [primaryMasterServer.resource]});

    this.kubeconfig = updateKubeConfig(
      kubeconfigCommand.stdout,
      primaryMasterServer.ip,
      spec.name,
      spec.name,
      spec.name
    );

    this.registerOutputs({
      kubeconfig: this.kubeconfig,
      clusterName: this.clusterName,
    });
  }

  private buildNodeDescriptors(spec: ClusterSpec): NodeDescriptor[] {
    const nodes = spec.nodes;
    if (!nodes || nodes.length === 0) {
      throw new Error("nodes must contain at least one entry.");
    }

    const seenIds = new Set<string>();
    const descriptors: NodeDescriptor[] = nodes.map((node: NodeSpec) => {
      if (!node.id || node.id.trim().length === 0) {
        throw new Error("Each node must include a non-empty id.");
      }
      if (seenIds.has(node.id)) {
        throw new Error(`Duplicate node id detected: ${node.id}`);
      }
      seenIds.add(node.id);
      const rolePrefix = node.role === "master" ? "master" : "node";
      const name = node.name ?? generateNodeNameFromId(spec.name, rolePrefix, node.id);
      return {
        ...node,
        name,
        isInitialMaster: false,
      };
    });

    validateNodeNames(descriptors.map(d => d.name));
    return descriptors;
  }

  private createServer(
    descriptor: NodeDescriptor,
    driver: ClusterDriver,
    driverCtx: any,
    k3sToken: pulumi.Input<string>,
    useCilium: boolean,
    joinMasterIp: pulumi.Input<string> | undefined,
    isBootstrap: boolean,
    dependsOn: pulumi.Resource[],
    masterIp?: pulumi.Output<string>,
    sshPrivateKey?: pulumi.Output<string>
  ): ClusterServerResult {
    const userData = nodeConfigDynamic(
      k3sToken,
      useCilium,
      isBootstrap,
      joinMasterIp ? pulumi.output(joinMasterIp) : undefined,
      descriptor.role === "worker",
      descriptor.labels,
      descriptor.taints
    );

    const protect = descriptor.protect ?? (isBootstrap && !joinMasterIp);
    const serverResult = driver.createServer(driverCtx, {
      name: descriptor.name,
      serverType: descriptor.serverType,
      userData,
      attachFloatingIp: isBootstrap,
      protect,
      dependsOn,
    });

    // Create drain guard for non-protected nodes
    if (masterIp && sshPrivateKey && !protect) {
      new NodeDrainGuard(`${descriptor.name}-drain-guard`, {
        nodeName: descriptor.name,
        masterIp: masterIp,
        sshPrivateKey: sshPrivateKey,
        sshUser: driver.sshUser,
        drainTimeout: 300,
      }, {
        parent: this,
        dependsOn: [serverResult.resource],
      });
    }

    return serverResult;
  }
}
