// versions.ts

export interface VersionEntry {
  version: string;
  depName: string;
  datasource: string;
  versioning: string;
  registryUrl?: string;
}

export const versions: Record<string, VersionEntry> = {
  directus: {
    version: "11.15.4",
    depName: "directus/directus",
    datasource: "docker",
    versioning: "docker",
  },
  vaultwarden: {
    version: "1.35.4-alpine",
    depName: "vaultwarden/server",
    datasource: "docker",
    versioning: "docker",
  },
  plane: {
    version: "1.4.1",
    depName: "plane-ce",
    datasource: "helm",
    versioning: "helm",
    registryUrl: "https://helm.plane.so"
  },
};

export default versions;