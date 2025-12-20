import * as pulumi from "@pulumi/pulumi";
import * as dynamic from "@pulumi/pulumi/dynamic";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {execSync} from "child_process";

export interface MasterRemovalGuardArgs {
  masterIds: string[];
  bootstrapIp: pulumi.Input<string>;
  sshPrivateKey: pulumi.Input<string>;
  sshUser: string;
}

interface MasterRemovalGuardState {
  masterIds: string[];
  bootstrapIp: string;
  sshPrivateKey: string;
  sshUser: string;
}

class MasterRemovalGuardProvider implements dynamic.ResourceProvider {
  async create(_inputs: MasterRemovalGuardArgs): Promise<dynamic.CreateResult> {
    return {id: Date.now().toString(), outs: _inputs};
  }

  async diff(_id: pulumi.ID, olds: MasterRemovalGuardState, news: MasterRemovalGuardState): Promise<dynamic.DiffResult> {
    const oldSet = new Set(olds.masterIds || []);
    const newSet = new Set(news.masterIds || []);
    const removed = Array.from(oldSet).filter(id => !newSet.has(id));
    const added = Array.from(newSet).filter(id => !oldSet.has(id));
    const changes = removed.length > 0 ||
      added.length > 0 ||
      olds.bootstrapIp !== news.bootstrapIp ||
      olds.sshUser !== news.sshUser;
    return {changes};
  }

  async update(_id: pulumi.ID, olds: MasterRemovalGuardState, news: MasterRemovalGuardState): Promise<dynamic.UpdateResult> {
    const oldSet = new Set(olds.masterIds || []);
    const newSet = new Set(news.masterIds || []);
    const removed = Array.from(oldSet).filter(id => !newSet.has(id));

    if (removed.length === 0) {
      return {outs: news};
    }

    // Always-on preflight: require at least two Ready masters before removal.
    const bootstrapIp = news.bootstrapIp;
    const sshUser = news.sshUser;
    const privateKey = news.sshPrivateKey;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulumi-k3s-"));
    const keyPath = path.join(tmpDir, "id_rsa");
    fs.writeFileSync(keyPath, privateKey, {mode: 0o600});

    try {
      const cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-i", keyPath,
        `${sshUser}@${bootstrapIp}`,
        "\"sudo kubectl get nodes --no-headers | awk '$2==\\\"Ready\\\" && $3 ~ /control-plane|master/ {count++} END {print count}'\""
      ].join(" ");

      const result = execSync(cmd, {encoding: "utf8"}).trim();
      const readyMasters = Number(result);
      if (!Number.isFinite(readyMasters) || readyMasters < 2) {
        throw new Error(
          `Preflight failed: need at least 2 Ready masters before removal, got ${result || "0"}.`
        );
      }
    } finally {
      try { fs.rmSync(tmpDir, {recursive: true, force: true}); } catch { /* no-op */ }
    }

    return {outs: news};
  }
}

export class MasterRemovalGuard extends dynamic.Resource {
  constructor(name: string, args: MasterRemovalGuardArgs, opts?: pulumi.CustomResourceOptions) {
    super(new MasterRemovalGuardProvider(), name, args, opts);
  }
}
