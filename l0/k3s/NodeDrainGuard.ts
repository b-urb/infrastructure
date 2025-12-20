import * as pulumi from "@pulumi/pulumi";
import * as dynamic from "@pulumi/pulumi/dynamic";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {execSync} from "child_process";

export interface NodeDrainGuardArgs {
  nodeName: string;
  masterIp: pulumi.Input<string>;
  sshPrivateKey: pulumi.Input<string>;
  sshUser: string;
  drainTimeout?: number;
}

interface NodeDrainGuardState {
  nodeName: string;
  masterIp: string;
  sshPrivateKey: string;
  sshUser: string;
  drainTimeout: number;
}

class NodeDrainGuardProvider implements dynamic.ResourceProvider {
  async create(_inputs: NodeDrainGuardArgs): Promise<dynamic.CreateResult> {
    // Store inputs with default timeout, no drain on create
    return {
      id: Date.now().toString(),
      outs: {
        ..._inputs,
        drainTimeout: _inputs.drainTimeout || 300
      }
    };
  }

  async delete(_id: pulumi.ID, state: NodeDrainGuardState): Promise<void> {
    const {nodeName, masterIp, sshPrivateKey, sshUser, drainTimeout} = state;

    pulumi.log.info(`[NodeDrainGuard] Draining node ${nodeName} before deletion...`);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulumi-drain-"));
    const keyPath = path.join(tmpDir, "id_rsa");
    fs.writeFileSync(keyPath, sshPrivateKey, {mode: 0o600});

    try {
      const cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "ConnectTimeout=30",
        "-i", keyPath,
        `${sshUser}@${masterIp}`,
        `"sudo kubectl drain ${nodeName} \\
          --ignore-daemonsets \\
          --delete-emptydir-data \\
          --force \\
          --timeout=${drainTimeout}s || echo 'DRAIN_FAILED'"`
      ].join(" ");

      const result = execSync(cmd, {
        encoding: "utf8",
        timeout: (drainTimeout + 60) * 1000, // Add buffer for SSH overhead
      });

      if (result.includes("DRAIN_FAILED")) {
        pulumi.log.warn(
          `[NodeDrainGuard] Drain for ${nodeName} failed or timed out. ` +
          `Continuing with deletion. Output: ${result}`
        );
      } else {
        pulumi.log.info(`[NodeDrainGuard] Successfully drained ${nodeName}`);
      }
    } catch (error) {
      // Don't fail deletion if drain fails - just log warning
      pulumi.log.warn(
        `[NodeDrainGuard] Exception during drain of ${nodeName}: ${error}. ` +
        `Continuing with deletion anyway.`
      );
    } finally {
      try {
        fs.rmSync(tmpDir, {recursive: true, force: true});
      } catch { /* ignore cleanup errors */ }
    }
  }
}

export class NodeDrainGuard extends dynamic.Resource {
  constructor(name: string, args: NodeDrainGuardArgs, opts?: pulumi.CustomResourceOptions) {
    super(new NodeDrainGuardProvider(), name, args, opts);
  }
}
