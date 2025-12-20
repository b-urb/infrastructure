import {createS3Bucket} from "../s3";
import {DirectusConfig} from "../../util/types";
import {createDirectusSecret} from "../secrets";
import {createDirectusConfigMap} from "../configs";
import {createDirectusResources} from "../directus";
import {RandomPassword} from "@pulumi/random";
import {Config, interpolate, StackReference} from "@pulumi/pulumi";
import {createNamespace} from "../namespace";
import {Provider, Role} from "@pulumi/postgresql";
import * as postgresql from "@pulumi/postgresql";


export function createDirectus(postgresProvider: Provider, stackRef: StackReference, config: Config, dev: boolean = false) {
  const directusSecretKey = new RandomPassword("directus-secret", {length: 24}).result.apply(
      password => interpolate`${password}`
  )
  const namespaceDirectus = createNamespace("directus")
  const adminPassword = new RandomPassword("admin-password", {length: 19, special: true}).result.apply(
      password => interpolate`${password}`
  )
  const metricsToken = new RandomPassword("metrics-token", {length: 32, special: false}).result.apply(
      password => interpolate`${password}`
  )
  const mailgunKey = stackRef.getOutput("mailgunKey").apply(authPW => interpolate`${authPW}`)
  const postgresUrl = stackRef.getOutput("postgresUrl").apply(url => interpolate`${url}`)

  const password = new RandomPassword("directusDbPassword", {
    length: 16,
    special: true,
  });
// Create Database for DirectusCMS
  const role = new Role("directus", {
    login: true,
    name: "directus",
    password: password.result
  }, {provider: postgresProvider});
  const directusDb = new postgresql.Database("directus", {name: "directus", owner: role.name}, {provider: postgresProvider});

  const grant = new postgresql.Grant("directusFull", {
    database: directusDb.name,
    objectType: "database",
    privileges: ["ALL"],
    role: role.name,
  }, {provider: postgresProvider});


  const directusBucket = createS3Bucket(`directus${dev ? "-dev" : ""}`);

  const directusSecret = {
    "db-user": role.name,
    "db-password": password.result,
    "admin-mail": config.get("admin-mail")!!,
    "admin-password": adminPassword,
    "db-name": "directus",
    "s3-user-key": config.get("s3-key")!!,
    "s3-user-secret": config.get("s3-secret")!!,
    "aws-s3-user-secret": directusBucket.secretAccessKey,
    "aws-s3-user-key": directusBucket.accessKeyId,

    "mg-api-key": mailgunKey,
    "directus-secret": directusSecretKey,
    "metrics-token": metricsToken
  }
  const directusConfigMapData = {
    PUBLIC_URL: "https://cms.burbn.de",
    "db-client": "pg",
    "db-host": postgresUrl,
    "db-port": "5432",
    "aws-s3-bucket": directusBucket.bucketName,
    "aws-s3-region": directusBucket.region,
    "aws-s3-endpoint": directusBucket.endpoint,
    "directus-key": "bjoern",
    "redis-host": "redis-master.redis",
    "redis-port": "6379"

  }


  const directusConfig: DirectusConfig = {
    namespace: namespaceDirectus,
    secret: createDirectusSecret("directus", namespaceDirectus, directusSecret),
    config: createDirectusConfigMap(directusConfigMapData),
    metricsToken: metricsToken
  }
  const directus = createDirectusResources("manual", directusConfig);
}