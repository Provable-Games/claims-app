export function bigintToHex(bigint: bigint): string {
  return `0x${bigint.toString(16)}`;
}

export function truncateAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}