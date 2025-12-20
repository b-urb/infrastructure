import * as pulumi from "@pulumi/pulumi"
import {Input, Output} from "@pulumi/pulumi";
import {Keypair} from "@pulumi/openstack/compute/keypair";

/**
 * Builds K3s node flags for labels and taints
 * @param labels - Key-value pairs for node labels
 * @param taints - Array of taint strings in format "key=value:effect"
 * @returns String of flags to append to K3s installation command
 */
function buildNodeFlags(labels?: Record<string, string>, taints?: string[]): string {
  let flags = '';

  if (labels) {
    for (const [key, value] of Object.entries(labels)) {
      flags += ` --node-label ${key}=${value}`;
    }
  }

  if (taints) {
    for (const taint of taints) {
      flags += ` --node-taint ${taint}`;
    }
  }

  return flags;
}

export const masterConfigWithSsh = (k3sToken: Input<string>, disableFlannel: boolean, sshKey: Keypair[], masterIp: Input<string>): Output<string> => {
  return pulumi.interpolate`
#cloud-config
package_update: true
packages:
  - curl
runcmd:
  - [ sh, -c, "curl -sfL https://get.k3s.io | K3S_TOKEN='your_actual_token' K3S_KUBECONFIG_MODE='644' sh -s - server --cluster-init --tls-san ${masterIp}" ]
    `;
}
export const masterConfig = (k3sToken: Input<string>, disableFlannel: boolean): Output<string> => {
  return pulumi.interpolate`
  #cloud-config
  users:
    - name: k3s-user
  groups: sudo
  shell: /bin/bash
  runcmd:
    - | 
      curl -sfL https://get.k3s.io | K3S_TOKEN=${k3sToken} K3S_KUBECONFIG_MODE="644" sh -s - server \
      ${disableFlannel ? "--flannel-backend none --disable-network-policy" : ""} \
      --cluster-init 
  `;
}
export const workerConfigWithSSH = (masterIp: Output<string>, k3sToken: Input<string>, disableFlannel: boolean, isWorker: boolean = true, sshKey: Input<string>[]): Output<string> => {
  return pulumi.interpolate`
#cloud-config
users:
  - name: ubuntu
    sudo: ['ALL=(ALL) NOPASSWD:ALL']
    shell: /bin/bash
    ssh_authorized_keys:
      - ${sshKey[0]}
      - ${sshKey[1]}
  - name: k3s-user
    sudo: ['ALL=(ALL) NOPASSWD:ALL']
    shell: /bin/bash
      
runcmd:
  - |
    curl -sfL https://get.k3s.io | K3S_TOKEN=${k3sToken} K3S_KUBECONFIG_MODE="644" sh -s - server \
    ${disableFlannel ? "--flannel-backend none --disable-network-policy" : ""} \
    --cluster-init 
     `;

}
export const workerConfig = (masterIp: Output<string>, k3sToken: Input<string>, disableFlannel: boolean, isWorker: boolean = true): Output<string> => {
  return pulumi.interpolate`
  #cloud-config
  users:
    - name: k3s-user
  groups: sudo
  shell: /bin/bash
  runcmd:
    - |
      curl -sfL https://get.k3s.io | K3S_TOKEN=${k3sToken} K3S_URL=https://${masterIp}:6443 sh -s - ${isWorker ? "agent" : "server"} \
      ${disableFlannel && !isWorker ? "--flannel-backend none --disable-network-policy" : ""}
  `;
}

/**
 * Unified cloud-init configuration with full customization support
 * @param k3sToken - K3s cluster token
 * @param disableFlannel - Whether to disable Flannel (for Cilium)
 * @param isInitialMaster - Whether this is the first master (--cluster-init)
 * @param masterIp - Master IP for joining nodes (undefined for initial master)
 * @param isWorker - Whether this is a worker/agent node
 * @param labels - Optional node labels
 * @param taints - Optional node taints
 */
export const nodeConfigDynamic = (
  k3sToken: Input<string>,
  disableFlannel: boolean,
  isInitialMaster: boolean,
  masterIp?: Output<string>,
  isWorker: boolean = false,
  labels?: Record<string, string>,
  taints?: string[]
): Output<string> => {
  const nodeFlags = buildNodeFlags(labels, taints);

  // Determine K3s role and flags
  let k3sCommand: string;
  if (isInitialMaster) {
    // First master: --cluster-init
    k3sCommand = `server ${disableFlannel ? "--flannel-backend none --disable-network-policy" : ""} --cluster-init${nodeFlags}`;
  } else if (!isWorker) {
    // Additional master: join as server
    k3sCommand = `server ${disableFlannel ? "--flannel-backend none --disable-network-policy" : ""}${nodeFlags}`;
  } else {
    // Worker: join as agent
    k3sCommand = `agent${nodeFlags}`;
  }

  const k3sUrl = isInitialMaster
    ? pulumi.output("")
    : pulumi.interpolate`K3S_URL=https://${masterIp}:6443 `;

  return pulumi.interpolate`
  #cloud-config
  users:
    - name: k3s-user
  groups: sudo
  shell: /bin/bash
  runcmd:
    - |
      curl -sfL https://get.k3s.io | K3S_TOKEN=${k3sToken} ${k3sUrl}K3S_KUBECONFIG_MODE="644" sh -s - ${k3sCommand}
  `;
}