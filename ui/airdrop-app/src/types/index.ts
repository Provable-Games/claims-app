export interface User {
  id: number;
  wallet_address: string;
  email?: string;
  is_eligible: boolean;
  airdrop_amount: number;
  has_claimed: boolean;
  claimed_at?: string;
  created_at: string;
}

export interface Airdrop {
  id: number;
  name: string;
  description?: string;
  total_supply: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export interface UserAirdrop {
  id: number;
  user_id: number;
  airdrop_id: number;
  allocation: number;
  claimed: boolean;
  claimed_at?: string;
}

export interface EligibilityReason {
  collection: string;
  network: string;
  tokenCount: number;
}

export interface EligibilityResponse {
  eligible: boolean;
  walletAddress?: string;
  allocation?: number;
  claimed?: boolean;
  airdropName?: string;
  claimedAt?: string;
  message?: string;
  reasons?: EligibilityReason[];
}

export interface ClaimRequest {
  walletAddress: string;
}

export interface ClaimResponse {
  success: boolean;
  message: string;
  claimedAt?: string;
}

export interface ApiError {
  error: string;
}