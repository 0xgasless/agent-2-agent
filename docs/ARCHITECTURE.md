# Architecture — Agent Frontend Demo

## Overview

This demo showcases two autonomous AI agents that communicate and transact on
Avalanche Fuji using the **@0xgasless/agent-sdk**. Every payment goes through
the **x402 protocol** (gasless signed authorizations settled by a facilitator).

## Wallet Architecture

```
Owner (Human)
├── Privy Embedded Wallet
│   ├── Funds agents with AVAX & USDT
│   └── Receives withdrawn funds
│
├── Agent A — Research AI  (ethers.Wallet, separate address)
│   ├── ERC-8004 identity (on-chain NFT)
│   ├── Receives USDT payments via x402
│   └── Can transfer funds back to owner
│
└── Agent B — Question Agent  (ethers.Wallet, separate address)
    ├── ERC-8004 identity (on-chain NFT)
    ├── Pays USDT via x402 authorization
    └── Can transfer funds back to owner
```

**Key**: Each agent has its **own wallet and address**. Payments are real
token transfers between two different on-chain addresses, verified and
settled by the x402 facilitator.

Agent private keys are stored in `localStorage` so that funded agents survive
page refreshes. These are testnet keys only — a production system would use
the SDK's `WalletManager` or server-managed keys.

## SDK Integration

### Initialization

```typescript
import { AgentSDK, fujiConfig } from '@0xgasless/agent-sdk';

const wallet = new Wallet(privateKey, rpcProvider);
const sdk = new AgentSDK({
  ...fujiConfig,
  signer: wallet,
});
```

The SDK is **wallet-agnostic** — it accepts any `ethers.Signer`. This demo
generates standard ethers `Wallet` instances so that agents can sign
transactions autonomously (no human approval popups during conversation).

### ERC-8004 Identity

Each agent registers on-chain via the ERC-8004 Identity Registry:

```typescript
const identity = sdk.erc8004.identity('fuji');
const tx = await identity.register('ipfs://QmAgentCard...');
```

This mints an NFT representing the agent's identity. The agent ID is
extracted from the transaction receipt logs.

### x402 Payment Flow

```
Agent B (payer)                    Facilitator                    On-chain
     │                                  │                            │
     ├─ createPaymentPayload() ─────────┤                            │
     │  (signs EIP-712 authorization)   │                            │
     │                                  │                            │
     ├─ facilitator.verify() ──────────►│                            │
     │  (checks signature validity)     │                            │
     │                                  │                            │
     ├─ facilitator.settle() ──────────►│── execute transfer ───────►│
     │  (settles on-chain via relayer)  │                            │
     │                                  │                            │
     ◄─ { transaction hash } ──────────┤                            │
```

1. **Agent B** signs a `TransferWithAuthorization` (EIP-712) — gasless
2. **Facilitator** verifies the signature is valid
3. **Facilitator** settles: the relayer contract transfers USDT from B → A
4. Agent B never pays gas for the payment itself

### Fund Management

Agents can transfer accumulated funds back to the owner:

- **USDT**: Standard ERC-20 `transfer()` call
- **AVAX**: Native transfer with gas estimation (subtracts gas cost from balance)

## Demo Flow

1. **Login** — Privy authentication (email / Google / wallet)
2. **Fund Agents** — Owner sends AVAX + USDT to agent wallets
3. **Register** — Each agent registers on ERC-8004 (on-chain tx, uses AVAX gas)
4. **Conversation** — Agents chat via OpenRouter AI, negotiate a price
5. **Payment** — Agent B pays Agent A via x402 (gasless for payer)
6. **Withdraw** — Owner recalls funds from agent wallets

## Files

| File | Purpose |
|---|---|
| `src/App.tsx` | Main UI, wallet generation, funding, conversation loop |
| `src/hooks/useAgent.ts` | Agent SDK wrapper (register, pay, transfer) |
| `src/config/fuji.ts` | Re-exports SDK's Fuji network config |
| `src/services/openrouter.ts` | AI conversation via OpenRouter API |
| `src/types/agent.ts` | TypeScript types for messages, state, transactions |
| `src/components/ui/*` | Shadcn UI components |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_PRIVY_APP_ID` | Yes | Privy application ID |
| `VITE_OPENROUTER_API_KEY` | Yes | OpenRouter API key for AI conversation |
