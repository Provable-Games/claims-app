import rewardsConfig from "../data/rewards_config.json";
import collectionsData from "../data/collections.json";

// Define types
interface Collection {
  name: string;
  contract_address: string;
  network: string;
}

interface RewardsConfig {
  contracts: Record<string, number[]>;
}

// Create a mapping from collection name to reward amount
const collectionRewards: Record<string, number> = {};

// Build the mapping
(collectionsData as Collection[]).forEach((collection) => {
  const contractAddress = collection.contract_address.toLowerCase();
  const rewards = (rewardsConfig as RewardsConfig).contracts[contractAddress];

  if (rewards && rewards.length > 0) {
    // Use the first reward value (they all seem to have single values)
    collectionRewards[collection.name] = rewards[0];
  }
});

// Special case for OG role (not in collections.json)
collectionRewards["OG"] = 10;

// Get reward amount for a collection
export function getCollectionReward(collectionName: string): number {
  // Hardcoded overrides
  if (collectionName === "Forgotten Rune") return 3;
  if (collectionName === "Smol Brains") return 2;
  if (collectionName === "Cool Cats") return 3;
  
  return collectionRewards[collectionName] || 1; // Default to 1 game if not found
}

// Export the mapping for debugging
export { collectionRewards };
