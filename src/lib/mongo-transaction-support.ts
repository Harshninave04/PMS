const TRANSACTION_CAPABLE_TOPOLOGIES = new Set([
  "ReplicaSetWithPrimary",
  "Sharded",
  "LoadBalanced",
]);

export function supportsMongoTransactions(topologyType: string | undefined): boolean {
  return topologyType !== undefined && TRANSACTION_CAPABLE_TOPOLOGIES.has(topologyType);
}
