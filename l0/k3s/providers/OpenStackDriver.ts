import * as pulumi from "@pulumi/pulumi";
import * as openstack from "@pulumi/openstack";
import {ClusterDriver, ClusterDriverContext, ClusterDriverInitArgs, ClusterServerResult, CreateServerArgs} from "./types";

interface OpenStackContext extends ClusterDriverContext {
  keypair: openstack.compute.Keypair;
  floatingIp: openstack.networking.FloatingIp;
  securityGroups: openstack.networking.SecGroup[];
  network: openstack.networking.Network;
  subnet: openstack.networking.Subnet;
  router: openstack.networking.Router;
  routerInterface: openstack.networking.RouterInterface;
}

export class OpenStackDriver implements ClusterDriver {
  kind: "openstack" = "openstack";
  sshUser = "ubuntu";

  private provider: openstack.Provider;

  constructor(provider: openstack.Provider) {
    this.provider = provider;
  }

  init(args: ClusterDriverInitArgs): ClusterDriverContext {
    const network = new openstack.networking.Network(`${args.clusterName}-network`, {
      name: `${args.clusterName}-network`,
      adminStateUp: true,
    }, {provider: this.provider, parent: args.parent});

    const subnet = new openstack.networking.Subnet(`${args.clusterName}-subnet`, {
      networkId: network.id,
      name: `${args.clusterName}-subnet`,
      cidr: "192.168.199.0/24",
    }, {provider: this.provider, parent: args.parent});

    const router = new openstack.networking.Router(`${args.clusterName}-router`, {
      externalNetworkId: "5398ba00-40ee-42a3-bfcd-e7aad3db3bd8",
    }, {provider: this.provider, parent: args.parent});

    const routerInterface = new openstack.networking.RouterInterface(`${args.clusterName}-router-iface`, {
      routerId: router.id,
      subnetId: subnet.id,
    }, {provider: this.provider, parent: args.parent});

    const secGroupSsh = new openstack.networking.SecGroup(`${args.clusterName}-sec-ssh`, {
      name: `${args.clusterName}-ssh`,
    }, {provider: this.provider, parent: args.parent});

    new openstack.networking.SecGroupRule(`${args.clusterName}-sec-ssh-ing`, {
      direction: "ingress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 22,
      portRangeMax: 22,
      remoteIpPrefix: "0.0.0.0/0",
      securityGroupId: secGroupSsh.id,
    }, {provider: this.provider, parent: args.parent});

    const secGroupKubernetes = new openstack.networking.SecGroup(`${args.clusterName}-sec-k8s`, {
      name: `${args.clusterName}-k8s`,
    }, {provider: this.provider, parent: args.parent});

    new openstack.networking.SecGroupRule(`${args.clusterName}-sec-k8s-ing`, {
      direction: "ingress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 6443,
      portRangeMax: 6443,
      remoteIpPrefix: "0.0.0.0/0",
      securityGroupId: secGroupKubernetes.id,
    }, {provider: this.provider, parent: args.parent});

    const secGroupHttp = new openstack.networking.SecGroup(`${args.clusterName}-sec-http`, {
      name: `${args.clusterName}-http`,
    }, {provider: this.provider, parent: args.parent});

    new openstack.networking.SecGroupRule(`${args.clusterName}-sec-http-ing`, {
      direction: "ingress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 80,
      portRangeMax: 80,
      remoteIpPrefix: "0.0.0.0/0",
      securityGroupId: secGroupHttp.id,
    }, {provider: this.provider, parent: args.parent});

    new openstack.networking.SecGroupRule(`${args.clusterName}-sec-https-ing`, {
      direction: "ingress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 443,
      portRangeMax: 443,
      remoteIpPrefix: "0.0.0.0/0",
      securityGroupId: secGroupHttp.id,
    }, {provider: this.provider, parent: args.parent});

    new openstack.networking.SecGroupRule(`${args.clusterName}-sec-http-egr`, {
      direction: "egress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 80,
      portRangeMax: 80,
      remoteIpPrefix: "0.0.0.0/0",
      securityGroupId: secGroupHttp.id,
    }, {provider: this.provider, parent: args.parent});

    new openstack.networking.SecGroupRule(`${args.clusterName}-sec-https-egr`, {
      direction: "egress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 443,
      portRangeMax: 443,
      remoteIpPrefix: "0.0.0.0/0",
      securityGroupId: secGroupHttp.id,
    }, {provider: this.provider, parent: args.parent});

    const floatingIp = new openstack.networking.FloatingIp(`${args.clusterName}-floating-ip`, {
      address: "185.113.124.117",
      pool: "public",
      region: "fra",
      tenantId: "f3344e21ff8a4cb7b0b93ee5c53bf09c",
    }, {provider: this.provider, parent: args.parent});

    if (args.publicKeys.length < 1) {
      throw new Error("At least one public key is required for OpenStack.");
    }
    const secondaryKey = args.publicKeys[1] ?? args.publicKeys[0];
    const combinedKey = pulumi.interpolate`${args.publicKeys[0]} \n ${secondaryKey}`;
    const keypair = new openstack.compute.Keypair(`${args.clusterName}-keypair`, {
      name: `${args.clusterName}-keypair`,
      publicKey: combinedKey,
    }, {provider: this.provider, parent: args.parent});

    const ctx: OpenStackContext = {
      sshKeys: [keypair],
      keypair,
      floatingIp,
      securityGroups: [secGroupSsh, secGroupKubernetes, secGroupHttp],
      network,
      subnet,
      router,
      routerInterface,
    };

    return ctx;
  }

  createServer(ctx: ClusterDriverContext, args: CreateServerArgs): ClusterServerResult {
    const osCtx = ctx as OpenStackContext;
    const securityGroups = osCtx.securityGroups.map(sg => sg.name);

    const opts: pulumi.ResourceOptions = {
      protect: args.protect,
      dependsOn: args.dependsOn ? [...args.dependsOn, osCtx.routerInterface] : [osCtx.routerInterface],
    };

    const flavorIdOrName = args.serverType;
    const isUuid = /^[0-9a-fA-F-]{36}$/.test(flavorIdOrName);

    const server = new openstack.compute.Instance(`${args.name}`, {
      availabilityZone: "az1",
      keyPair: osCtx.keypair.name,
      imageName: "ubuntu-22.04-x86_64",
      imageId: "04c4ff7b-858d-4520-832a-b9f58f75b868",
      userData: args.userData,
      blockDevices: [{
        deleteOnTermination: true,
        sourceType: "image",
        destinationType: "volume",
        volumeSize: 32,
        uuid: "04c4ff7b-858d-4520-832a-b9f58f75b868",
      }],
      flavorId: isUuid ? flavorIdOrName : undefined,
      flavorName: isUuid ? undefined : flavorIdOrName,
      name: args.name,
      networks: [{
        accessNetwork: true,
        name: osCtx.network.name,
        uuid: osCtx.network.id,
      }],
      region: "fra",
      securityGroups: ["default", ...securityGroups],
    }, {provider: this.provider, ...opts});

    let ip = osCtx.floatingIp.address;
    if (args.attachFloatingIp) {
      const port = openstack.networking.getPortOutput({
        deviceOwner: "compute:az1",
        deviceId: server.id,
        networkId: osCtx.network.id,
      }, {provider: this.provider});

      new openstack.networking.FloatingIpAssociate(`${args.name}-fip`, {
        floatingIp: osCtx.floatingIp.address,
        portId: port.id,
      }, {provider: this.provider, dependsOn: [server]});
    }

    return {
      name: args.name,
      ip: ip,
      resource: server,
    };
  }
}
