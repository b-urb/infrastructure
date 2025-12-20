import {ConfigMap, Namespace, Secret} from "@pulumi/kubernetes/core/v1";
import {adminMail, adminPassword, mailgunKey, s3UserKey, s3UserSecret} from "./env";
import {RandomPassword} from "@pulumi/random";
import * as pulumi from "@pulumi/pulumi";

export type Source = "helm" | "aws" | "manual" | "gke" | "azure"

export interface DirectusConfig  {
  namespace: Namespace;
  secret: Secret;
  config: ConfigMap;
  metricsToken: pulumi.Output<string>;
}

export type Stage = "prod" | "dev" | "experimental"
export interface DirectusSecret  {
  "db-user": string,
  "db-password": string,
  "admin-mail": string,
  "admin-password": string,
  "db-name": string,
  "s3-user-key": string,
  "s3-user-secret": string,
  "mg-api-key": string,
  "directus-secret": string
}
export interface UmamiSecret  {
  "db-connection-string": string
}