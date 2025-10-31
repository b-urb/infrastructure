import * as openstack from "@pulumi/openstack";
import * as pulumi from "@pulumi/pulumi";

import {ICloudOrchestrator} from "../../common/interfaces/ICloudOrchestrator";
import {Input, Output} from "@pulumi/pulumi";
import {RandomPassword} from "@pulumi/random";
import {FloatingIp, getPortOutput, SecGroup} from "@pulumi/openstack/networking";

export class OpenStackOrchestrator {
  private readonly provider: openstack.Provider;

  constructor(provider: openstack.Provider) {
    this.provider = provider;
  }

  createServer(
      sshKeys: Array<openstack.compute.Keypair>,
      userData: Input<string>,
      name: string,
      floatingIp: FloatingIp
  ) {



    const network1 = new openstack.networking.Network("network_1", {
      name: "network_1",
      adminStateUp: true,
    }, {provider: this.provider});

    const subnet = new openstack.networking.Subnet("subnet", {
      networkId: network1.id,
      name: "subnet1",
      cidr: "192.168.199.0/24",
    }, {provider: this.provider})

    const router = new openstack.networking.Router("router", {
      externalNetworkId: "5398ba00-40ee-42a3-bfcd-e7aad3db3bd8",
    }, {provider: this.provider})

    const routerInterface1 = new openstack.networking.RouterInterface("router_interface_1", {
      routerId: router.id,
      subnetId: subnet.id,
    }, {provider: this.provider});


    // const volume1 = new openstack.blockstorage.Volume("volume",
    //     {
    //       size: 32
    //     }, {provider: this.provider})

    const serverAdminPass = new RandomPassword(`server-password-${name}`, {
      special: true,
      length: 17
    })
    pulumi.secret(serverAdminPass)
    const secGroup = new SecGroup("sec-group", {
      name: name
    }, {provider: this.provider})
    const secgroupRule1 = new openstack.networking.SecGroupRule("secgroup_rule_1", {
      direction: "ingress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 22,
      portRangeMax: 22,
      remoteIpPrefix: "0.0.0.0/0",
      securityGroupId: secGroup.id,
    }, {provider: this.provider});

    const secGroupKubernetes = new SecGroup("sec-group-kubernetes", {
      name: "kubernetes"
    }, {provider: this.provider})
    const secgroupRuleKubernetesIngress = new openstack.networking.SecGroupRule("secgroup_rule_kubernetes_ing", {
      direction: "ingress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 6443,
      portRangeMax: 6443,
      remoteIpPrefix: "0.0.0.0/0",
      securityGroupId: secGroupKubernetes.id,
    }, {provider: this.provider});
    const secgroupRuleKubernetesEgress = new openstack.networking.SecGroupRule("secgroup_rule_kubernetes_egr", {
      direction: "egress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 6443,
      portRangeMax: 6443,
      remoteIpPrefix: "0.0.0.0/0",
      securityGroupId: secGroupKubernetes.id,
    }, {provider: this.provider});

   const secGroupHttp= new SecGroup("sec-group-http", {
      name: "internet"
    }, {provider: this.provider})
    const secgroupRuleHttpsEgress = new openstack.networking.SecGroupRule("secgroup_rule_https_egr", {
      direction: "egress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 443,
      portRangeMax: 443,
      remoteIpPrefix: "0.0.0.0/0",
      securityGroupId: secGroupHttp.id,
    }, {provider: this.provider});
    const secgroupRuleHttpEgress = new openstack.networking.SecGroupRule("secgroup_rule_http_egr", {
      direction: "egress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 80,
      portRangeMax: 80,
      remoteIpPrefix: "0.0.0.0/0",
      securityGroupId: secGroupHttp.id,
    }, {provider: this.provider});
    const secgroupRuleHttpsIngress = new openstack.networking.SecGroupRule("secgroup_rule_https_ing", {
      direction: "ingress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 443,
      portRangeMax: 443,
      remoteIpPrefix: "0.0.0.0/0",
      securityGroupId: secGroupHttp.id,
    }, {provider: this.provider});
    const secgroupRuleHttpIngress = new openstack.networking.SecGroupRule("secgroup_rule_http_ing", {
      direction: "ingress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 80,
      portRangeMax: 80,
      remoteIpPrefix: "0.0.0.0/0",
      securityGroupId: secGroupHttp.id,
    }, {provider: this.provider});

    const server = new openstack.compute.Instance(`master-${name}`, {
      availabilityZone: "az1",
      keyPair: sshKeys[0].name,
      imageName: "ubuntu-22.04-x86_64",
      imageId: "04c4ff7b-858d-4520-832a-b9f58f75b868",
      userData: userData,
      blockDevices: [{
        deleteOnTermination: true,
        sourceType: "image",
        destinationType: "volume",
        volumeSize: 32,
        uuid: "04c4ff7b-858d-4520-832a-b9f58f75b868"
      }],
      flavorId: "c142ae74-f3ba-4cf5-b240-f47dcf71f8d2",
      flavorName: "c5.xlarge",
      name: name,
      networks: [{
        accessNetwork: true,
        name: network1.name,
        uuid: network1.id,
      }],
      region: "fra",
      securityGroups: [
        "default",
        secGroup.name,
        secGroupKubernetes.name,
          secGroupHttp.name
      ],
    }, {
      provider: this.provider,
    });


    const rightPort = getPortOutput({deviceOwner: "compute:az1", deviceId: server.id, networkId: network1.id})
    const associate = new openstack.networking.FloatingIpAssociate("associate", {
      floatingIp: floatingIp.address,
      portId: rightPort.id
    }, {provider: this.provider, dependsOn: [server] })

    return {server: server, ip: floatingIp.address, associate: associate}

  }
}
