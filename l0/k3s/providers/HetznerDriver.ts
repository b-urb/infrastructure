import * as pulumi from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud";
import {HCloudOrchestrator} from "../../cloud_providers/hetzner/HCloudOrchestrator";
import {ClusterDriver, ClusterDriverContext, ClusterDriverInitArgs, ClusterServerResult, CreateServerArgs} from "./types";

export class HetznerDriver implements ClusterDriver {
  kind: "hetzner" = "hetzner";
  sshUser = "root";

  private orchestrator: HCloudOrchestrator;
  private provider: hcloud.Provider;

  constructor(provider: hcloud.Provider, datacenterId: string, location: string) {
    this.provider = provider;
    this.orchestrator = new HCloudOrchestrator(provider, datacenterId, location);
  }

  init(args: ClusterDriverInitArgs): ClusterDriverContext {
    const network = this.orchestrator.createNetwork(`${args.clusterName}-network`);
    this.orchestrator.createSubnet(network, `${args.clusterName}-subnet`);

    const sshKeys = args.publicKeys.map((key, index) =>
      new hcloud.SshKey(`${args.clusterName}-ssh-${index}`, {
        publicKey: key,
      }, {provider: this.provider, parent: args.parent})
    );

    return {network, sshKeys: sshKeys as pulumi.Resource[]};
  }

  createServer(ctx: ClusterDriverContext, args: CreateServerArgs): ClusterServerResult {
    const sshKeys = ctx.sshKeys as hcloud.SshKey[];
    const network = ctx.network as hcloud.Network;

    const opts: pulumi.ResourceOptions = {
      protect: args.protect,
      dependsOn: args.dependsOn,
    };

    const server = this.orchestrator.createServer(
      sshKeys,
      network,
      args.serverType,
      args.userData,
      args.name,
      opts
    );

    return {
      name: args.name,
      ip: server.ipv4Address,
      resource: server,
    };
  }
}
