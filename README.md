# Agent x Agent Demo

Two autonomous AI agents that meet, negotiate a freelance job, deliver work, and settle payment on-chain — all powered by the [`@0xgasless/agent-sdk`](https://www.npmjs.com/package/@0xgasless/agent-sdk).

## What This Demo Shows

A **startup founder** (Agent A) and a **freelance researcher** (Agent B) go through a full business interaction autonomously:

1. **Networking** — The agents introduce themselves at a blockchain industry event
2. **Discovery** — The founder describes a research task they need done
3. **Negotiation** — They agree on a price in USDT
4. **Work Delivery** — The freelancer delivers a research brief
5. **On-chain Payment** — The founder pays the freelancer via the x402 gasless payment protocol
6. **Closing** — Both agents wrap up professionally

Every step uses real on-chain infrastructure:

| Feature | Standard | Contract |
|---------|----------|----------|
| Agent Identity | ERC-8004 | [`0x372d...99f`](https://testnet.snowtrace.io/address/0x372d406040064a9794d14f3f8fec0f2e13e5b99f) |
| Payments | x402 Protocol | Gasless via facilitator relay |
| Token | USDT on Fuji | [`0x40dA...7BA`](https://testnet.snowtrace.io/address/0x40dAE5db31DD56F1103Dd9153bd806E00A2f07BA) |
| Network | Avalanche Fuji | Chain ID 43113 |

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Owner (You)                                    │
│  Privy-managed browser wallet                   │
│  Funds agents with AVAX + USDT                  │
└──────────┬─────────────────────┬────────────────┘
           │ fund                │ fund
           ▼                    ▼
┌─────────────────┐   ┌─────────────────┐
│  Agent A         │   │  Agent B         │
│  Employer        │   │  Freelancer      │
│  ethers.Wallet   │   │  ethers.Wallet   │
│  Signs autonomy  │   │  Signs autonomy  │
│  ERC-8004 ID: 17 │   │  ERC-8004 ID: 18 │
└────────┬─────────┘   └─────────┬───────┘
         │                       │
         │   x402 payment        │
         └───────────────────────┘
```

**Three wallets, three roles:**

| Wallet | Key Management | Purpose |
|--------|---------------|---------|
| Owner | Privy (no private key exposed) | Authenticate, fund agents, withdraw earnings |
| Agent A | `ethers.Wallet` in localStorage | Autonomous signing for registration + payments |
| Agent B | `ethers.Wallet` in localStorage | Autonomous signing for registration + receiving |

Agent wallets are generated once and persisted in `localStorage` so they survive page refreshes. The owner funds them explicitly — agents only hold what you give them.

## Tech Stack

- **React + TypeScript + Vite** — Frontend framework
- **Tailwind CSS + Shadcn UI** — Styling and components
- **Privy** — Wallet authentication (email, Google, or external wallet)
- **ethers.js v6** — Blockchain interaction
- **@0xgasless/agent-sdk** — Agent identity (ERC-8004) and gasless payments (x402)
- **OpenRouter** — AI conversation engine (GPT-4o-mini)

## Prerequisites

- [Bun](https://bun.sh/) (or Node.js 18+)
- A [Privy](https://privy.io/) app ID (free tier works)
- An [OpenRouter](https://openrouter.ai/) API key
- Testnet AVAX from the [Avalanche Faucet](https://faucet.avalanche.org/)

## Quick Start

### 1. Install dependencies

```bash
cd agent-frontend-demo
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your keys:

```
VITE_PRIVY_APP_ID=your-privy-app-id
VITE_OPENROUTER_API_KEY=your-openrouter-api-key
```

### 3. Run the dev server

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Use the demo

1. **Log in** with email, Google, or connect a wallet via Privy
2. **Fund agents** — Use the sidebar buttons to send AVAX (for gas) and USDT (for payments) to each agent
3. **Register agents** — Each agent mints an ERC-8004 identity NFT on Fuji
4. **Start conversation** — Watch the agents network, negotiate, deliver work, and pay each other
5. **Withdraw funds** — Transfer agent earnings back to your owner wallet

## Project Structure

```
src/
├── App.tsx                  # Main app — layout, conversation loop, wallet management
├── hooks/
│   └── useAgent.ts          # Agent hook — SDK integration, AI prompts, payment logic
├── services/
│   └── openrouter.ts        # OpenRouter API client
├── config/
│   └── fuji.ts              # Network config (re-exports from SDK)
├── types/
│   └── agent.ts             # TypeScript interfaces
├── components/ui/           # Shadcn components (button, card, badge, alert)
├── lib/
│   └── utils.ts             # Tailwind class merge utility
├── index.css                # Tailwind + custom theme variables
└── main.tsx                 # Entry point with PrivyProvider
```

## How It Works

### Agent Identity (ERC-8004)

Each agent registers on-chain by minting an NFT on the Identity Registry contract. This gives them a unique Agent ID that acts as their verifiable identity. Registration is checked on every page load using direct `balanceOf` + `ownerOf` view calls (no event logs, works with any RPC).

### Payments (x402 Protocol)

When Agent A pays Agent B:

1. Agent A signs an EIP-712 payment authorization off-chain
2. The payload is sent to the x402 facilitator for verification
3. The facilitator settles the payment on-chain via the relayer contract
4. Agent B receives USDT — no gas needed for the payment itself

### AI Conversation

The conversation uses phase-based system prompts (networking → discovery → negotiation → delivery → payment) with strict guardrails:

- Agents cannot roleplay the other party
- Agents cannot skip phases or defer work to "later"
- Payment amounts are capped to the agent's actual balance
- Conversation terminates cleanly after payment

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_PRIVY_APP_ID` | Yes | Your Privy application ID |
| `VITE_OPENROUTER_API_KEY` | Yes | OpenRouter API key for AI conversations |

## Contracts (Avalanche Fuji Testnet)

| Contract | Address |
|----------|---------|
| Identity Registry (ERC-8004) | [`0x372d406040064a9794d14f3f8fec0f2e13e5b99f`](https://testnet.snowtrace.io/address/0x372d406040064a9794d14f3f8fec0f2e13e5b99f) |
| USDT Token | [`0x40dAE5db31DD56F1103Dd9153bd806E00A2f07BA`](https://testnet.snowtrace.io/address/0x40dAE5db31DD56F1103Dd9153bd806E00A2f07BA) |

## License

MIT
