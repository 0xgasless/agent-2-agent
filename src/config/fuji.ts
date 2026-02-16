/**
 * Avalanche Fuji Testnet Configuration
 * Imported from @0xgasless/agent-sdk to ensure we use the canonical contract addresses.
 */
import { fujiConfig as sdkFujiConfig } from '@0xgasless/agent-sdk';

export const fujiConfig = sdkFujiConfig;

// Convenience constants derived from SDK config
export const FUJI_RPC_URL = fujiConfig.networks.fuji.rpcUrl;
export const USDT_TOKEN_ADDRESS = fujiConfig.networks.fuji.x402?.defaultToken || '0x40dAE5db31DD56F1103Dd9153bd806E00A2f07BA';
export const RELAYER_CONTRACT = fujiConfig.networks.fuji.x402?.verifyingContract || '';

// ERC-8004 Identity Registry (on-chain agent identity NFT)
export const IDENTITY_REGISTRY = '0x372d406040064a9794d14f3f8fec0f2e13e5b99f';
