# Privy Setup Guide for Agent Demo

## Quick Answer

**You only need ONE Privy account (one email/login) for the demo!**

Both agents (Agent A and Agent B) will use the **same Privy wallet** from your logged-in account.

---

## How It Works

### Current Setup (Demo)
- **One Privy Login** → One Privy Wallet
- **Agent A** uses that wallet
- **Agent B** uses the same wallet
- Both agents have the same address
- They're just different "personas" with different roles

### Why This Works for Demo
- ✅ Simple setup - just one login
- ✅ Both agents can interact
- ✅ Payments work (Agent B pays Agent A from same wallet)
- ✅ Good for testing agent-to-agent conversations

---

## Setup Steps

### 1. Create Privy Account (One Time)
1. Go to [Privy Dashboard](https://dashboard.privy.io)
2. Sign up with **ONE email** (any email works)
3. Create a new app
4. Copy your **App ID**

### 2. Add to Environment
```bash
# .env file
VITE_PRIVY_APP_ID=your-privy-app-id-here
VITE_OPENROUTER_API_KEY=your-openrouter-key-here
```

### 3. Run the App
```bash
npm install
npm run dev
```

### 4. Login
- Click "Login with Privy"
- Use **any login method** (email, Google, etc.)
- **One login = Both agents initialized**

---

## Agent Behavior

### Same Wallet, Different Roles
- **Agent A (Research Agent)**: Sells research, receives payments
- **Agent B (Question Agent)**: Asks questions, makes payments
- **Same Address**: Both use your Privy wallet address
- **Different ERC-8004 IDs**: Each registers separately on-chain

### Payment Flow
When Agent B pays Agent A:
- Both are the same wallet
- Payment still works (it's a real transaction)
- You're essentially paying yourself
- Good for testing the payment flow

---

## Production Options

If you want **separate wallets** for each agent in production:

### Option 1: Session Keys (Recommended)
```typescript
// Create separate session key wallets from same parent wallet
const agentASessionKey = SessionKeyHelper.generateSessionKey({...});
const agentBSessionKey = SessionKeyHelper.generateSessionKey({...});

// Each agent gets its own constrained wallet
const agentAWallet = SessionKeyHelper.createWallet(agentASessionKey, provider);
const agentBWallet = SessionKeyHelper.createWallet(agentBSessionKey, provider);
```

### Option 2: Multiple Privy Accounts
- User logs in with Account 1 → Agent A
- User logs in with Account 2 → Agent B
- Requires two separate Privy accounts

### Option 3: Multiple Embedded Wallets
- One Privy account can have multiple embedded wallets
- Use different wallets for each agent

---

## FAQ

**Q: Do I need 2 Privy accounts?**  
A: No! One account is enough for the demo.

**Q: Why do both agents have the same address?**  
A: They share the same Privy wallet. This is fine for demo/testing.

**Q: Can I make them use different wallets?**  
A: Yes! Use session keys (see Option 1 above) or multiple Privy accounts.

**Q: Will payments work if they're the same wallet?**  
A: Yes! The transaction will execute (you're paying yourself), which is fine for testing.

---

## Summary

✅ **One Privy account** = One login  
✅ **One wallet** = Both agents use it  
✅ **Two agent IDs** = Separate ERC-8004 registrations  
✅ **Works for demo** = Perfect for testing

**For production**, consider using session keys to create separate agent wallets with spending limits!

