import * as pulumi from "@pulumi/pulumi";
import {createNamespace} from "./namespace";

import {RandomPassword} from "@pulumi/random";
import {Config, secret} from "@pulumi/pulumi";
import {Htpasswd, HtpasswdAlgorithm} from "pulumi-htpasswd";
import * as k8s from "@pulumi/kubernetes";
import {Secret} from "@pulumi/kubernetes/core/v1";
import {createSurrealManual} from "./components/surrealdb/Manual/Surreal";
import {createPostgres} from "./components/postgres";
import {createRedis} from "./redis";
import {createMonitoring} from "./components/monitoring";
const namespacePostgres = createNamespace("postgres");
export const postgresNamespace = namespacePostgres.metadata.name
//const namespaceEtcd = createNamespace("etcd")
const config = new Config()
const contaboS3Key = config.requireSecret("contabo-s3-key");
const contaboS3Secret = config.requireSecret("contabo-s3-secret");
const grafanaAdminMail = config.require("admin-mail");
const grafanaAdminPassword = config.requireSecret("admin-password");
 const dbRootPassword = new RandomPassword("postgresRootPassword", {
  length: 16,
  special: true,
});
const appDbPassword = new RandomPassword("applicationDBPassword", {
  length: 16,
  special: true,
});

// Databases Setup
// Postgres
const postgres = createPostgres("helm", namespacePostgres, dbRootPassword, appDbPassword)
// export const postgresService = postgres.getResource("v1/Service", "postgres/postgres-postgresql-primary")
// export const postgresUrl = pulumi.interpolate`${postgresService.metadata.name}.${postgresService.metadata.namespace}`
export const postgresUrl = "postgres-postgresql-primary.postgres"

// Surreal
createSurrealManual()



// const postgresProvider = new Provider("custom", {host: externalService.spec.externalIPs, port: externalService.spec.ports., password: dbRootPassword.result, username: "postgres"}, {dependsOn: postgres})
// const applicationDb = new Database("applications",{},{provider: postgresProvider});
// export const role = new Role("applicationDbAdmin", {login: true, password: password.result}, {provider: postgresProvider});
// const grant  = new Grant("applicationAdmin", {
//   database: applicationDb.name,
//   objectType: "database",
//   privileges: ["ALL"],
//   role: role.name,
// }, {provider: postgresProvider});
//TODO: check if we can export the role before assigning the grant


export const mailgunKey =  config.requireSecret("mailgunKey") //TODO: Replace with mailgunProvider

//export const etcdSecret = createEtcdSecret(env.etcdRootPassword, namespaceEtcd);
//const etcd = createEtcd(namespaceEtcd, etcdSecret)
const namespaceRedis = createNamespace("redis")
const redis = createRedis("helm",namespaceRedis); //FIXME: Update chart
export const postgresRootPassword = dbRootPassword.result

// Monitoring Stack (Prometheus, Grafana, Loki)
const namespaceMonitoring = createNamespace("monitoring")
const monitoring = createMonitoring("helm", namespaceMonitoring, contaboS3Key, contaboS3Secret, grafanaAdminMail, grafanaAdminPassword);
export const monitoringNamespace = namespaceMonitoring.metadata.name


export function createBasicAuthSecret(user: string, password: string) {

  const credentials = new Htpasswd('credentials', {
    algorithm: HtpasswdAlgorithm.Bcrypt,
    entries: [{
      // example with a specific username + password
      username: user,
      password: password,
    }],
  });

  const authString = credentials.result

  return new k8s.core.v1.Secret("basic-auth", {
    metadata: {
      name: "basic-auth",
      namespace: "kube-system"
    },
    stringData: {
      "users": authString,
    }
  })
}



