import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import * as command from "@pulumi/command";

/**
 * Configuration for a single node in the K3s cluster
 */
export interface K3sNodeConfig {
  /** Hetzner Cloud server type (e.g., "cax21", "cpx31", "ccx63") */
  serverType: string;
  /** Role of the node in the K3s cluster */
  role: "master" | "worker";
  /** Kubernetes labels to apply to the node (e.g., {"workload": "gpu", "tier": "compute"}) */
  labels?: Record<string, string>;
  /** Kubernetes taints to apply to the node (e.g., ["gpu=true:NoSchedule", "tier=spot:PreferNoSchedule"]) */
  taints?: string[];
  /** Optional custom name for the node. If not provided, a unique name will be auto-generated (e.g., "master-lovelace", "node-galactus") */
  name?: string;
}

export type ClusterProvider = "hetzner" | "openstack";

export interface ClusterJoinExisting {
  /** Existing master IP to join */
  masterIp: pulumi.Input<string>;
  /** Existing cluster token */
  k3sToken: pulumi.Input<string>;
}

export interface ClusterBootstrapPolicy {
  /** Optional explicit bootstrap master id. Defaults to first master in nodes. */
  masterId?: string;
}

export interface ClusterSpec {
  name: string;
  provider: ClusterProvider;
  bootstrap?: ClusterBootstrapPolicy;
  joinExisting?: ClusterJoinExisting;
  nodes: NodeSpec[];
}

export interface NodeSpec {
  /** Stable node identifier (required). Used for naming and diffing. */
  id: string;
  /** Role of the node in the K3s cluster */
  role: "master" | "worker";
  /** Provider-specific server type (e.g., Hetzner serverType or OpenStack flavorName) */
  serverType: string;
  /** Optional custom name (DNS compatible). If omitted, name is derived from id. */
  name?: string;
  /** Kubernetes labels to apply to the node */
  labels?: Record<string, string>;
  /** Kubernetes taints to apply to the node */
  taints?: string[];
  /** Optional override to protect this node from deletion */
  protect?: boolean;
}

/**
 * Internal descriptor with generated metadata
 * @internal
 */
export interface NodeDescriptor extends NodeSpec {
  /** Generated resource name (e.g., "master-main", "node-0") */
  name: string;
  /** Whether this is the initial master node that bootstraps the cluster */
  isInitialMaster: boolean;
}

/**
 * Result of cluster creation
 */
export interface ClusterResult {
  /** Public IP address of the initial master node */
  ip: pulumi.Output<string>;
  /** SSH private key for cluster access */
  sshKey: tls.PrivateKey;
  /** Kubeconfig file content */
  kubeconfig: pulumi.Output<string>;
  /** Command used to retrieve kubeconfig */
  "kubeconfig-command": command.remote.Command;
}

/**
 * Output type for deployed clusters - contains all outputs needed to join or reference the cluster
 */
export interface ClusterSpecOutput {
  /** Cluster name */
  name: pulumi.Output<string>;
  /** Cloud provider type */
  provider: ClusterProvider;
  /** Master node IP address (for joining) */
  masterIp: pulumi.Output<string>;
  /** K3s cluster token (for joining) - marked as secret */
  k3sToken: pulumi.Output<string>;
  /** SSH private key for cluster access */
  sshKey: tls.PrivateKey;
  /** Kubeconfig for cluster access */
  kubeconfig: pulumi.Output<string>;
  /** Node specifications that were created */
  nodes?: NodeSpec[];
  /** The kubeconfig retrieval command */
  kubeconfigCommand?: command.remote.Command;
}

/**
 * Creates a ClusterSpec configured to join an existing cluster
 *
 * @param output The cluster output from a previous deployment
 * @param newClusterName Name for the joining cluster/nodes
 * @param nodes New nodes to add to the cluster
 * @returns A ClusterSpec configured to join the existing cluster
 */
export function createJoinClusterSpec(
  output: ClusterSpecOutput,
  newClusterName: string,
  nodes: NodeSpec[]
): ClusterSpec {
  return {
    name: newClusterName,
    provider: output.provider,
    joinExisting: {
      masterIp: output.masterIp,
      k3sToken: output.k3sToken,
    },
    nodes: nodes,
  };
}
