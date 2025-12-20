import * as hcloud from "@pulumi/hcloud";
import * as pulumi from "@pulumi/pulumi";

import {ICloudOrchestrator} from "../../common/interfaces/ICloudOrchestrator";
import {Input, Output} from "@pulumi/pulumi";
import {HCloudServer} from "./HCloudServer";

export class HCloudOrchestrator {

  private readonly provider: hcloud.Provider
  private datacenterId: string
  private location: string

  constructor(provider: hcloud.Provider, datacenterId: string, location: string) {
this.provider = provider
    this.datacenterId = datacenterId
    this.location = location
  }

  createNetwork(name: string) {
    return new hcloud.Network(name, {
      ipRange: "10.0.0.0/16" // Specify an appropriate IP range
    }, {provider: this.provider});
  }

  createSubnet(network: hcloud.Network, name: string) {
    return new hcloud.NetworkSubnet(name, {
          networkId: network.id.apply(id => parseInt(id)),
          type: "cloud",
          networkZone: "eu-central",
          ipRange: "10.0.1.0/24",
        }, {provider: this.provider}
    );
  }

  createServer(
      sshKeys: Array<hcloud.SshKey>,
      network: hcloud.Network,
      serverType: string,
      userData: Input<string>,
      name: string,
      additionalOptions?: pulumi.ResourceOptions  // Optional resource options for protection, etc.
  ) {


    // const primaryIpv4 = new hcloud.PrimaryIp(`${name}-primary_ip-v4`, {
    //   datacenter: this.datacenterId,
    //   type: "ipv4",
    //   assigneeType: "server",
    //   autoDelete: true,
    //   labels: {
    //     hallo: "welt",
    //   },
    // }, {provider: this.provider});
    // const primaryIpv6 = new hcloud.PrimaryIp(`${name}-primary_ip-v6`, {
    //   datacenter: this.datacenterId,
    //   type: "ipv6",
    //   assigneeType: "server",
    //   autoDelete: true,
    //   labels: {
    //     hallo: "welt",
    //   },
    // }, {provider: this.provider});
    //const volume = this.createVolume(name)
    const server = new hcloud.Server(name, {
      serverType: serverType,
      name: name,
      datacenter: this.datacenterId,
      image: "ubuntu-22.04",
      sshKeys: sshKeys.map(it => it.name),
      userData: userData,
      publicNets: [
        {
          //ipv4Enabled: true,
          //ipv4: primaryIpv4.id.apply(id => parseInt(id)),
          ipv6Enabled: true,
          //ipv6: primaryIpv6.id.apply(id => parseInt(id)),
        }],
      networks: [{
        networkId: network.id.apply(id => parseInt(id)),
      }],
    }, {
      provider: this.provider,
      ...additionalOptions  // Merge in protection and other options
    });
    //this.attachVolumeToServer(volume, server)
    return server
  }

  createVolume(name: string) {
    return pulumi.output(new hcloud.Volume(`${name}-volume`, {
      size: 25, // Size of the volume in GB
      location: this.location,
      format: "ext4", // Specify the format (optional)
    }, {provider: this.provider}));
  }

  attachVolumeToServer(volume: hcloud.Volume, server: hcloud.Server) {
    const main = new hcloud.VolumeAttachment("attach", {
      volumeId: volume.id.apply(id => parseInt(id)),
      serverId: server.id.apply(id => parseInt(id)),
      automount: true,
    }, {provider: this.provider});
  }


  // ... other resource methods as needed ...
}