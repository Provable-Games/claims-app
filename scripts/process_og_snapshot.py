#!/usr/bin/env python3
import csv
import json

def process_og_snapshot():
    # Read the CSV file
    all_addresses = []
    sepolia_addresses = []
    mainnet_addresses = []
    ethereum_mainnet_addresses = []
    empty_addresses = []
    
    with open('scripts/OG_snapshot.csv', 'r') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            wallet_address = row['starknetWalletAddress'].strip()
            network = row['starknetNetwork']
            
            # Track all addresses
            all_addresses.append((network, wallet_address))
            
            # Categorize by network
            if not wallet_address:
                empty_addresses.append(row['discordMemberId'])
            elif network == 'sepolia' and wallet_address:
                sepolia_addresses.append(wallet_address)
            elif network == 'mainnet' and wallet_address:
                mainnet_addresses.append(wallet_address)
            elif network == 'ethereum-mainnet':
                ethereum_mainnet_addresses.append(row['discordMemberId'])
    
    # Remove duplicates from sepolia addresses while preserving order
    unique_sepolia_addresses = []
    seen = set()
    duplicate_count = 0
    for addr in sepolia_addresses:
        if addr not in seen:
            seen.add(addr)
            unique_sepolia_addresses.append(addr)
        else:
            duplicate_count += 1
    
    # Create the snapshot structure matching bayc_snapshot_ethereum.json
    snapshot_data = {
        "block_height": 0,  # Update this with actual block height if needed
        "chain_id": "0x534e5f5345504f4c4941",  # Sepolia chain ID in hex
        "claim_contract": "0x1",  # Update with actual claim contract address
        "contract_address": "0x1",  # Update with actual contract address
        "description": "OG snapshot for Sepolia",
        "entrypoint": "claim_from_forwarder",
        "name": "OG",
        "network": "Sepolia",
        "snapshot": []
    }
    
    # Convert addresses to the snapshot format
    # Each entry is [address, [token_ids]]
    # Since we don't have token IDs from the CSV, we'll use sequential IDs
    for idx, address in enumerate(unique_sepolia_addresses):
        # Format: [address, [token_id_in_hex]]
        snapshot_data["snapshot"].append([
            address,
            [hex(idx + 1)]  # Sequential token IDs starting from 1
        ])
    
    # Save to JSON file
    output_path = 'snapshots/og_snapshot_sepolia_starknet.json'
    with open(output_path, 'w') as jsonfile:
        json.dump(snapshot_data, jsonfile, indent=2)
    
    # Print detailed statistics
    print("\n=== OG Snapshot Processing Statistics ===")
    print(f"Total rows in CSV: {len(all_addresses)}")
    print(f"\nBreakdown by network:")
    print(f"  - Sepolia addresses: {len(sepolia_addresses)}")
    print(f"  - Mainnet addresses: {len(mainnet_addresses)}")
    print(f"  - Ethereum-mainnet entries: {len(ethereum_mainnet_addresses)}")
    print(f"  - Empty addresses: {len(empty_addresses)}")
    print(f"\nSepolia processing:")
    print(f"  - Total Sepolia entries: {len(sepolia_addresses)}")
    print(f"  - Duplicate addresses removed: {duplicate_count}")
    print(f"  - Unique Sepolia addresses: {len(unique_sepolia_addresses)}")
    print(f"\nSnapshot saved to: {output_path}")

if __name__ == "__main__":
    process_og_snapshot()