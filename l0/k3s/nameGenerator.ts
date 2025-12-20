import { uniqueNamesGenerator, names } from 'unique-names-generator';
import * as crypto from 'crypto';

/**
 * Generates a deterministic, DNS-compatible node name
 *
 * @param clusterName - Name of the cluster
 * @param role - Node role ("master" or "worker")
 * @param index - Index of the node within its role
 * @returns DNS-compatible node name (e.g., "master-lovelace", "node-galactus")
 */
export function generateNodeName(clusterName: string, role: string, index: number): string {
  // Create deterministic seed from cluster + role + index
  const seedString = `${clusterName}-${role}-${index}`;
  const hash = crypto.createHash('sha256').update(seedString).digest('hex');
  const seed = parseInt(hash.substring(0, 8), 16);

  // Generate name using seed (deterministic)
  const word = uniqueNamesGenerator({
    dictionaries: [names],  // Famous scientists, inventors, etc.
    seed: seed,
    length: 1,
    separator: '',
    style: 'lowerCase'
  });

  return `${role}-${word}`;
}

/**
 * Generates a deterministic, DNS-compatible node name based on a stable id
 *
 * @param clusterName - Name of the cluster
 * @param role - Node role ("master" or "worker")
 * @param id - Stable node id
 * @returns DNS-compatible node name (e.g., "master-alpha", "node-bravo")
 */
export function generateNodeNameFromId(clusterName: string, role: string, id: string): string {
  const seedString = `${clusterName}-${role}-${id}`;
  const hash = crypto.createHash('sha256').update(seedString).digest('hex');
  const seed = parseInt(hash.substring(0, 8), 16);

  const word = uniqueNamesGenerator({
    dictionaries: [names],
    seed: seed,
    length: 1,
    separator: '',
    style: 'lowerCase'
  });

  return `${role}-${word}`;
}

/**
 * Validates that a node name is DNS-compatible
 *
 * @param name - Node name to validate
 * @returns true if valid, false otherwise
 */
export function isValidNodeName(name: string): boolean {
  // DNS hostname requirements:
  // - Max 63 characters
  // - Lowercase alphanumeric and hyphens only
  // - Cannot start or end with hyphen
  const dnsRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  return dnsRegex.test(name) && name.length <= 63;
}

/**
 * Validates that all node names in a set are unique and DNS-compatible
 *
 * @param names - Array of node names to validate
 * @throws Error if names are not unique or not DNS-compatible
 */
export function validateNodeNames(names: string[]): void {
  // Check all names are DNS-compatible
  const invalidNames = names.filter(name => !isValidNodeName(name));
  if (invalidNames.length > 0) {
    throw new Error(
      `Invalid node names (must be DNS-compatible): ${invalidNames.join(', ')}\n` +
      `Names must be lowercase alphanumeric with hyphens, max 63 chars, and not start/end with hyphen.`
    );
  }

  // Check for duplicates
  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length) {
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    throw new Error(`Duplicate node names detected: ${duplicates.join(', ')}`);
  }
}
