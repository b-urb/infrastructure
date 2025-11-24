// versions.ts

export interface VersionEntry {
  version: string;
  depName: string;
  datasource: string;
  versioning: string;
  registryUrl?: string;
}

export const versions: Record<string, VersionEntry> = {
  surrealDB: {
    version: "v2.4",
    depName: "surrealdb/surrealdb",
    datasource: "docker",
    versioning: "semver-coerced",
  },
  redis: {
    version: "20.6.1",
    depName: "redis",
    datasource: "helm",
    versioning: "helm",
    registryUrl: "oci://registry-1.docker.io/bitnamicharts/redis"
  },
  postgresql: {
    version: "16.3.3",
    depName: "postgresql",
    datasource: "helm",
    versioning: "helm",
    registryUrl: "oci://registry-1.docker.io/bitnamicharts/postgresql"
  },
};

export default versions;