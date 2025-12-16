import {createNamespace} from "./namespace";
import {createUmami} from "./umami";
import * as postgresql from "@pulumi/postgresql";
import {Provider, Role} from "@pulumi/postgresql";
import {RandomPassword} from "@pulumi/random";
import {Config, getStack, interpolate, StackReference} from "@pulumi/pulumi";
import {createBackupSecret, createUmamiSecret} from "./secrets";
import {ConfigMap} from "@pulumi/kubernetes/core/v1";
import createBackupCronjob from "./CronJob";
import {createVaultwardenManual} from "./providers/Manual/Vaultwarden";
import {createDirectus} from "./create/directus";
import * as aws from "@pulumi/aws"
import {createSecretStore} from "./secretstore";
import * as k8s from "@pulumi/kubernetes"
import {createKubevoyage} from "./create/kubevoyage";
import {region} from "@pulumi/aws/config";
import {Region} from "@pulumi/aws";

const config = new Config();
const stack = getStack();
const org = config.require("org");

const stackRef = new StackReference(`${org}/l1/${stack}`)
const stackRefl0 = new StackReference(`${org}/l0/${stack}`)

let dev = false

if(stack == "opnenstack")
  dev = true


const postgresNamespace = stackRef.getOutput("postgresNamespace").apply(namespace => interpolate`${namespace}`)
//Initialize Postgres Provider. NOTE: Requires port-forward for now
const dbAuthPassword = stackRef.getOutput("postgresRootPassword").apply(authPW => interpolate`${authPW}`)
const mailgunKey = stackRef.getOutput("mailgunKey").apply(authPW => interpolate`${authPW}`)
const postgresUrl = stackRef.getOutput("postgresUrl").apply(url => interpolate`${url}`)


const postgresProvider = new Provider("custom", {
  host: postgresUrl,
  password: dbAuthPassword,
  username: "postgres",
  sslmode: "disable"
})
export const awsProvider = new aws.Provider("my-aws-provider", {
  accessKey: config.getSecret("aws-key"),
  secretKey: config.getSecret("aws-secret"),
  // Optional: If you are using temporary credentials, you also need to specify a session token
  region: Region.EUCentral1,
});
const kubeConfig = stackRefl0.getOutput("kubeconfig").apply(kubeconfig => interpolate`${kubeconfig}`);
const clusterName = stackRefl0.getOutput("cluster").apply(cluster => interpolate`${cluster}`);
export const kubernetesProvider = new k8s.Provider("kube-provider", {
  kubeconfig: kubeConfig,
  cluster: clusterName,
  context: clusterName
})

export const secretStore = createSecretStore(kubernetesProvider)

// Create Backup for Database
const backupPGPassword = new RandomPassword("backupPGPassword", {
  length: 16,
  special: true,
});
const backupRole = new Role("backup", {
  login: true,
  name: "backup",
  password: backupPGPassword.result,
  superuser: true,
  replication: true
}, {provider: postgresProvider});
const backUpSecret = {
  "db-user": backupRole.name,
  "db-password": backupPGPassword.result,
  "s3-user-key": config.get("s3-key")!!,
  "s3-user-secret": config.get("s3-secret")!!,
}



createBackupCronjob(postgresNamespace, createBackupSecret(postgresNamespace, backUpSecret))
export const backupPassword = backupPGPassword.result

function createDBCredentials(ident: string) {
  const password = new RandomPassword(`${ident}DBPassword`, {
    length: 26,
    special: false,
  });

  const role = new Role(ident, {login: true, name: ident, password: password.result}, {provider: postgresProvider});
  const db = new postgresql.Database(ident, {name: ident, owner: role.name}, {provider: postgresProvider});
  new postgresql.Grant(`${ident}Full`, {
    database: db.name,
    objectType: "database",
    privileges: ["ALL"],
    role: role.name,
  }, {provider: postgresProvider});

  return {
    user: role.name,
    password: password.result,
    db: db.name,
  }
}


createDirectus(postgresProvider, stackRef, config, dev)
createKubevoyage(postgresProvider, stackRef, config)
//createPlane(postgresProvider, stackRef, config)


// const umamiCredentials = createDBCredentials("umami")
//
// // Create apps for general usage
// //export const namespaceMedusa = createNamespace("medusa")
// export const namespaceUmami = createNamespace("umami")
// export const umamiSecret = {
//   "db-connection-string": interpolate`postgresql://${umamiCredentials.user}:${umamiCredentials.password}@${postgresUrl}:5432/${umamiCredentials.db}`
// }
// createUmami("manual", namespaceUmami, createUmamiSecret(namespaceUmami, umamiSecret))

const yubiClientSecret = config.getSecret("yubi-client-secret")
const yubiClientId = config.getSecret("yubi-client-id")
const vaultwardenCredentials = createDBCredentials("vaultwarden")
export const vaultwardenSecret = {
  "database-url": interpolate`postgresql://${vaultwardenCredentials.user}:${vaultwardenCredentials.password}@${postgresUrl}:5432/${vaultwardenCredentials.db}`,
  "yubico-client-secret": interpolate`${yubiClientSecret}`,
  "yubico-client-id":interpolate`${yubiClientId}`
}
const vaultwardenNamespace = createNamespace("vaultwarden")
const configMap = new ConfigMap("vaultwarden", {
  metadata: {
    name: "vaultwarden",
    namespace: vaultwardenNamespace.metadata.name
  }, data: {
    "url": "https://warden.burbn.de"
  }
})
createVaultwardenManual(vaultwardenNamespace, configMap, vaultwardenSecret)

// const paperlessSecretKey = new RandomPassword("paperlessSecretKey", {
//   length: 16,
//   special: true,
// });
// const paperlessDbCredentials = createDBCredentials("paperless")
// const paperlessNamespace = createNamespace("paperless")
// const paperlessSecret = {
//   "postgresHost": postgresUrl,
//   "postgresUser": paperlessDbCredentials.user,
//   "postgresPassword": paperlessDbCredentials.password,
//   "postgresDBName": paperlessDbCredentials.db,
//   "usermap-uid": config.get("paperlessUsermapUid")!!,
//   "usermap-gid": config.get("paperlessUsermapGid")!!,
//   "secret": paperlessSecretKey.result,
//   "adminUser": config.get("paperlessAdminUser")!!,
//   "adminPassword": config.get("paperlessAdminPw")!!,
// }
// const paperlessConfigMap = new ConfigMap("paperless", {
//   metadata: {name: "paperless", namespace: vaultwardenNamespace.metadata.name}, data: {}
// })
// createPaperless(paperlessNamespace, createSecretWrapper("paperless", paperlessNamespace, paperlessSecret), paperlessConfigMap)