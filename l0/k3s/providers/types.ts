import * as pulumi from "@pulumi/pulumi";
import {ClusterProvider} from "../types";

export interface ClusterDriverInitArgs {
  clusterName: string;
  publicKeys: pulumi.Input<string>[];
  parent?: pulumi.Resource;
}

export interface ClusterDriverContext {
  network?: pulumi.Resource;
  sshKeys: pulumi.Resource[];
  extra?: Record<string, pulumi.Resource>;
}

export interface CreateServerArgs {
  name: string;
  serverType: string;
  userData: pulumi.Input<string>;
  attachFloatingIp?: boolean;
  protect?: boolean;
  dependsOn?: pulumi.Resource[];
}

export interface ClusterServerResult {
  name: string;
  ip: pulumi.Output<string>;
  resource: pulumi.Resource;
}

export interface ClusterDriver {
  kind: ClusterProvider;
  sshUser: string;
  init(args: ClusterDriverInitArgs): ClusterDriverContext;
  createServer(ctx: ClusterDriverContext, args: CreateServerArgs): ClusterServerResult;
}
