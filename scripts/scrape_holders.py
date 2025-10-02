#!/usr/bin/env python3
"""
Script to scrape NFT holder addresses from a Starknet collection using Blast API.
Outputs in the same format as the snapshot files used by process.ts
"""

import requests
import json
import time
import argparse
from typing import Dict, List, Optional, Set, Tuple
import sys
from collections import defaultdict


def get_collection_holders(
    contract_address: str,
    api_url: str,
    network: str,
    collection_name: str,
    description: str,
    start_token_id: Optional[str] = None,
    end_token_id: Optional[str] = None,
    page_size: int = 100,
    delay_ms: int = 200,
    block_height: Optional[int] = None,
) -> Dict:
    """
    Fetch all NFT holders from a collection using pagination.

    Args:
        contract_address: The NFT collection contract address
        api_url: The Blast API URL
        network: Network name (ethereum, starknet, etc.)
        collection_name: Name of the collection
        description: Description for the snapshot
        start_token_id: Optional starting token ID
        end_token_id: Optional ending token ID
        page_size: Number of items per page (max 100)
        delay_ms: Delay between requests in milliseconds
        block_height: Block height for snapshot

    Returns:
        Dict containing the snapshot data
    """
    # Track holders and their token IDs
    holders_tokens: Dict[str, Set[str]] = defaultdict(set)
    page_key = None
    page_count = 0

    print(f"Fetching NFT holders from collection: {contract_address}")
    print(f"API URL: {api_url}")

    while True:
        # Build query parameters
        params = {
            "contractAddress": contract_address,
            "pageSize": str(page_size),
        }

        # Add optional parameters
        if start_token_id:
            params["startTokenId"] = start_token_id
        if end_token_id:
            params["endTokenId"] = end_token_id
        if page_key:
            params["pageKey"] = page_key

        # Make GET request with query parameters
        try:
            response = requests.get(
                api_url, params=params, headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()

            result = response.json()

            if "error" in result:
                print(f"API Error: {result['error']}")
                break

            # The response structure might be different for GET request
            # Try to handle both wrapped and unwrapped responses
            if "result" in result:
                data = result.get("result", {})
            else:
                data = result
                
            nfts = data.get("nfts", [])

            # Extract holder addresses and token IDs from NFTs
            for nft in nfts:
                # Get owner address - try different possible field names
                owner_address = None
                if "ownerAddress" in nft:
                    owner_address = nft["ownerAddress"]
                elif "owner_address" in nft:
                    owner_address = nft["owner_address"]
                elif "owner" in nft:
                    owner_address = nft["owner"]
                
                # Get token ID - try different possible field names
                token_id = None
                if "tokenId" in nft:
                    token_id = nft["tokenId"]
                elif "token_id" in nft:
                    token_id = nft["token_id"]
                elif "id" in nft:
                    token_id = nft["id"]
                
                if owner_address and token_id:
                    # Ensure consistent formatting
                    if not owner_address.startswith("0x"):
                        owner_address = "0x" + owner_address
                    owner_address = owner_address.lower()
                    
                    # For Starknet, remove padding (leading zeros after 0x)
                    if network.lower() == "starknet":
                        # Remove 0x prefix, strip leading zeros, then add 0x back
                        owner_address = "0x" + owner_address[2:].lstrip("0")
                        # Handle edge case where address might be all zeros
                        if owner_address == "0x":
                            owner_address = "0x0"
                    
                    # Store token ID as hex string
                    if isinstance(token_id, int):
                        token_id_hex = hex(token_id)
                    elif isinstance(token_id, str) and not token_id.startswith("0x"):
                        token_id_hex = hex(int(token_id))
                    else:
                        token_id_hex = token_id
                    
                    holders_tokens[owner_address].add(token_id_hex)

            page_count += 1
            print(
                f"Page {page_count}: Processed {len(nfts)} NFTs (Total unique holders: {len(holders_tokens)})"
            )

            # Check if there are more pages
            next_page_key = data.get("nextPageKey")
            if not next_page_key or len(nfts) == 0:
                break

            page_key = next_page_key

            # Rate limiting delay
            if delay_ms > 0:
                time.sleep(delay_ms / 1000.0)

        except requests.exceptions.RequestException as e:
            print(f"Request error: {e}")
            break
        except Exception as e:
            print(f"Unexpected error: {e}")
            break

    # Convert to snapshot format
    snapshot_data = []
    for address, token_ids in sorted(holders_tokens.items()):
        # Sort token IDs for consistent output
        sorted_token_ids = sorted(list(token_ids), key=lambda x: int(x, 16))
        snapshot_data.append([address, sorted_token_ids])
    
    # Determine chain_id based on network
    chain_id_map = {
        "ethereum": "0x1",
        "starknet": "0x534e5f4d41494e",
        "base": "0x2105",
        "arbitrum": "0xa4b1"
    }
    
    # Build the complete snapshot structure
    snapshot = {
        "block_height": block_height or 0,  # You may want to fetch this dynamically
        "chain_id": chain_id_map.get(network.lower(), "0x1"),
        "claim_contract": "0x1",
        "contract_address": contract_address.lower(),
        "description": description,
        "entrypoint": "claim_from_forwarder",
        "name": collection_name,
        "network": network.capitalize(),
        "snapshot": snapshot_data
    }
    
    return snapshot


def save_snapshot(snapshot: Dict, output_file: str):
    """
    Save snapshot to a file in JSON format.

    Args:
        snapshot: The snapshot data
        output_file: Output file path
    """
    print(f"\nSaving snapshot to {output_file}")
    
    with open(output_file, "w") as f:
        json.dump(snapshot, f, indent=2)
    
    print(f"Snapshot saved successfully!")
    print(f"Total unique holders: {len(snapshot['snapshot'])}")
    
    # Calculate total NFTs
    total_nfts = sum(len(holder[1]) for holder in snapshot["snapshot"])
    print(f"Total NFTs tracked: {total_nfts}")


def main():
    parser = argparse.ArgumentParser(
        description="Scrape NFT holder addresses from a collection"
    )
    parser.add_argument(
        "--contract-address", required=True, help="The NFT collection contract address"
    )
    parser.add_argument(
        "--name", required=True, help="Name of the collection"
    )
    parser.add_argument(
        "--network",
        required=True,
        choices=["ethereum", "starknet", "base", "arbitrum"],
        help="Network name"
    )
    parser.add_argument(
        "--api-url",
        default="https://starknet-mainnet.blastapi.io/5ef61753-e7c1-4593-bc62-97fdf96f8de5/builder/getCollectionNFTs",
        help="Blast API URL (default: provided Starknet mainnet URL)",
    )
    parser.add_argument(
        "--output",
        help="Output file path (default: {name}_snapshot_{network}.json)",
    )
    parser.add_argument(
        "--description",
        help="Description for the snapshot (default: '{name} snapshot')",
    )
    parser.add_argument("--start-token-id", help="Starting token ID (optional)")
    parser.add_argument("--end-token-id", help="Ending token ID (optional)")
    parser.add_argument(
        "--page-size",
        type=int,
        default=100,
        help="Number of items per page (default: 100, max: 100)",
    )
    parser.add_argument(
        "--delay-ms",
        type=int,
        default=200,
        help="Delay between requests in milliseconds (default: 200)",
    )
    parser.add_argument(
        "--block-height",
        type=int,
        help="Block height for the snapshot",
    )

    args = parser.parse_args()

    # Generate default output filename if not provided
    if not args.output:
        name_snake = args.name.lower().replace(" ", "_")
        args.output = f"{name_snake}_snapshot_{args.network}.json"
    
    # Generate default description if not provided
    if not args.description:
        args.description = f"{args.name} snapshot"

    # Validate page size
    if args.page_size > 100:
        print("Warning: page_size cannot exceed 100, setting to 100")
        args.page_size = 100

    # Scrape holders
    snapshot = get_collection_holders(
        contract_address=args.contract_address,
        api_url=args.api_url,
        network=args.network,
        collection_name=args.name,
        description=args.description,
        start_token_id=args.start_token_id,
        end_token_id=args.end_token_id,
        page_size=args.page_size,
        delay_ms=args.delay_ms,
        block_height=args.block_height,
    )

    if snapshot["snapshot"]:
        # Save to file
        save_snapshot(snapshot, args.output)
    else:
        print("\nNo holders found!")
        sys.exit(1)


if __name__ == "__main__":
    main()