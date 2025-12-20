# Infrastructure

## Description
I use this cluster to host all my personal stuff.
This project is a multi-layered infrastructure setup using Pulumi. It is divided into three main layers:

1. [l0](l0/): The base infrastructure like the Kubernetes cluster and DNS resources. It is implemented in TypeScript and uses various Pulumi libraries such as `@pulumi/kubernetes`, `@pulumi/hcloud`, and `@pulumi/github` among others. The main entry point is [index.ts](l0/index.ts). Currently it setups a k3s cluster on hetzner with the hetzner-csi driver using cilium

2. [l1](l1/): This layer is responsible for setting up the necessary configurations for the project. It exposes several outputs including the Postgres user, Postgres password, and Mailgun host. The main entry point is [configs.ts](l1/configs.ts).


3. [l2](l2/): Infrastructure like CMS and other high-level software that depends on databases. It is implemented in Node.js. The main entry point is (provide the main entry point for l2).

There is also a [flux-operator](flux-operator/) component. This is used for GitOps within the cluster

## Goals
- Provide a set of configurable infrastructure components according to each layer
- provide templates or starters for composing these components into an actual deployment on what you need
- refactor the code
- implement other cloud providers/databases/services etc.

## Installation

This project uses npm for package management. To install the dependencies, run the following command in each of the directories (l0, l1, l2, and flux-operator):

```sh
npm install
```

## Usage

### Configuration

Before deploying, configure the required settings for each layer:

#### L0 (Base Infrastructure)

The L0 layer requires the following configuration:

```sh
# Set your SSH public key (required for VM provisioning)
pulumi config set sshPublicKey "$(cat ~/.ssh/id_rsa.pub)"

# Set your email address (required for Let's Encrypt certificates)
pulumi config set emailAddress "your-email@example.com"

# For Hetzner stack:
pulumi config set --secret hcloudToken "your-hetzner-token"

# For OpenStack stack:
pulumi config set --secret openstackAuthUrl "your-openstack-auth-url"
```

### Deployment

To deploy this project, you need to deploy each layer in order. Start with l0, then l1, and finally l2. For each layer, navigate to the directory and run the following command:

```sh
pulumi up
```

This will deploy the resources defined in that layer. Repeat the process for each layer.

### Accessing Kubeconfig

The kubeconfig is exported as a secret output from the L0 layer. To save it to a file:

```sh
# Navigate to the l0 directory
cd l0

# Extract kubeconfig to a file
pulumi stack output kubeconfig --show-secrets > ~/.kube/urban.yaml

# Use the kubeconfig
export KUBECONFIG=~/.kube/urban.yaml
kubectl get nodes
```

## Migration from Legacy to New Cluster Creation

The new cluster creation method in `Hetzner_New.ts` supports state-based master protection, flexible node configurations, and joining existing clusters. This section guides you through migrating from the legacy cluster creation to the new method.

### Step 1: Extract Existing Cluster Info

From your legacy cluster, get the master IP and token:

```bash
# SSH into existing master
ssh root@<legacy-master-ip>

# Get K3s token
sudo cat /var/lib/rancher/k3s/server/node-token

# Get master IP
hostname -I | awk '{print $1}'
```

### Step 2: Configure New Cluster to Join Existing

Set Pulumi config to join the existing cluster:

```bash
cd l0

# Set existing cluster connection info
pulumi config set existingMasterIp "<legacy-master-ip>"
pulumi config set --secret existingK3sToken "<k3s-token-from-above>"

# Set other required configs
pulumi config set sshPublicKey "$(cat ~/.ssh/id_rsa.pub)"
```

### Step 3: Deploy New Nodes to Join Existing Cluster

```bash
# Preview changes
pulumi preview

# Deploy new nodes (they will join the existing legacy cluster)
pulumi up
```

Your new nodes will join the existing cluster as additional masters/workers.

### Step 4: Verify New Nodes Joined

```bash
# Get kubeconfig from either old or new master
pulumi stack output kubeconfig --show-secrets > ~/.kube/config

# Check all nodes (should see both legacy and new nodes)
kubectl get nodes
```

### Step 5: Remove Legacy Cluster Code

Once new nodes are operational and you've migrated workloads:

1. Remove legacy `createHetznerK3S()` call from index.ts
2. Remove legacy master nodes from infrastructure
3. Remove `existingMasterIp` and `existingK3sToken` config
4. Update nodeConfigs to include all desired nodes

### Step 6: Unprotect and Remove Initial Master (Optional)

If you want to remove the original bootstrap master:

```bash
# Ensure you have at least 2 other masters operational first
kubectl get nodes | grep master

# Unprotect the initial master resource
pulumi state unprotect 'urn:pulumi:hetzner::l0::hcloud:index/server:Server::master-main'

# Remove the initial master from nodeConfigs in Hetzner_New.ts
# (Remove the first master entry)

# Deploy changes
pulumi up
```

**WARNING:** Never remove all masters at once. Always ensure at least one master remains operational.

### Node Configuration Features

The new cluster creation method supports:

- **Word-generated node names**: Memorable, unique names (e.g., `master-lovelace`, `node-galactus`)
- **Master node taints**: Masters only schedule critical workloads (service-criticality: 1)
- **Flexible server types**: Configure different VM types per node
- **Order-independent management**: Add/remove nodes freely from the array
- **State-based protection**: Initial master is protected until failover capability exists
- **Labels and taints**: Full Kubernetes scheduling control
- **Custom names**: Optional custom naming via the `name` field

Example node configuration:

```typescript
const nodeConfigs: K3sNodeConfig[] = [
  {
    serverType: "cax21",
    role: "master",
    labels: {
      "node-role.kubernetes.io/control-plane": "true",
      "node-role": "master"
    },
    taints: ["node-role=master:NoSchedule"]
    // Name will be auto-generated (e.g., "master-lovelace")
  },
  {
    serverType: "cax21",
    role: "master",
    labels: {
      "node-role.kubernetes.io/control-plane": "true",
      "node-role": "master"
    },
    taints: ["node-role=master:NoSchedule"],
    name: "master-custom"  // Optional: Specify custom name
  },
  {
    serverType: "cax21",
    role: "worker",
    labels: { "workload": "general" }
    // Name will be auto-generated (e.g., "node-galactus")
  }
];
```

**Node Names**:
- Auto-generated names are deterministic and based on cluster name + role + index
- Example names: `master-lovelace`, `master-curie`, `node-galactus`, `node-newton`
- Names are stable across deployments (same configuration = same names)
- Custom names can be specified via the optional `name` field
- All names are validated for DNS compatibility and uniqueness

## Contributing

Contributions are welcome, just note that the project is still Work in Progess and the final structure is not yet comlete