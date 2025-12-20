import * as pulumi from "@pulumi/pulumi";
import {createHetznerK3S} from "./create/Hetzner";
import {createHetznerK3SNew} from "./create/Hetzner_New";
import {getStack, Output} from "@pulumi/pulumi";
import {ClusterSpec, ClusterSpecOutput, createJoinClusterSpec} from "./k3s/types";
import {createOpenstackK3S} from "./create/Openstack_New";


const stack = getStack()

const config = new pulumi.Config();
const mail = config.get("emailAddress")!!

// Define cluster spec in code
const clusterSpec: ClusterSpec = {
  name: "urban-new",
  provider: stack === "hetzner" ? "hetzner" : "openstack",
  nodes: [
    // Old method already creates: master-main, master-1, node-0, node-1
    // So we add different nodes to avoid conflicts
    {
      id: "master-2",
      role: "master",
      serverType: "cax11",
    },
    {
      id: "node-2",
      role: "worker",
      serverType: "cax21",
    },

  ]
};

const clusterName = clusterSpec.name;

if (!(stack == "hetzner" || stack == "openstack")) {
  throw Error("invalid stack")
}

const clusterOutput = getKubeConfigAndCluster(stack, clusterName, mail, clusterSpec);

export const output = clusterOutput;

export const kubeconfig = clusterOutput.kubeconfig;
export const cluster = clusterOutput.name;
export const masterIp = clusterOutput.masterIp;
export const k3sToken = clusterOutput.k3sToken;

function getKubeConfigAndCluster(stack: string, clusterName: string, mail: string, spec: ClusterSpec): ClusterSpecOutput {
  if (stack == "hetzner") {
    const initialCluster = createHetznerK3S(config, clusterName, mail);

    if (spec.nodes && spec.nodes.length > 0) {
      const joinSpec = createJoinClusterSpec(
        initialCluster,
        clusterName,
        spec.nodes
      );

      const joinResult = createHetznerK3SNew(config, clusterName, mail, joinSpec);

      return {
        name: initialCluster.name,
        provider: initialCluster.provider,
        masterIp: initialCluster.masterIp,      // Keep original master
        k3sToken: initialCluster.k3sToken,      // Keep original token
        sshKey: initialCluster.sshKey,          // Keep original SSH key
        kubeconfig: joinResult.kubeconfig,      // Use updated kubeconfig
        nodes: [
          ...(initialCluster.nodes || []),      // Original nodes
          ...(spec.nodes || [])                 // New nodes
        ],
        kubeconfigCommand: initialCluster.kubeconfigCommand
      };
    }

    // If no additional nodes, just return initial cluster
    return initialCluster;
  }
  else if (stack == "openstack") {
    // Note: This will break since createOpenstackK3S doesn't return ClusterSpecOutput yet
    throw new Error("OpenStack return type not yet updated to ClusterSpecOutput");
  } else {
    throw Error("invalid stack");
  }
}
