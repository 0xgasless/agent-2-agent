# Privy Session Signers Setup Guide

## Overview

Privy Session Signers allow your app to execute transactions **in the background** without showing wallet approval modals. This creates a seamless web2-like experience for autonomous agents.

## How It Works

### Traditional Flow (Current)
1. Agent needs to make a transaction
2. Privy modal appears asking for approval
3. User must click "Approve"
4. Transaction executes

### Session Signers Flow (New)
1. Agent needs to make a transaction
2. Frontend sends transaction to server API
3. Server signs transaction using Privy's session signers
4. Transaction executes **without any user prompts**

## Prerequisites

1. ✅ Privy account with an app created
2. ✅ `@privy-io/react-auth` installed (already done)
3. ✅ Session signers enabled in Privy Dashboard

## Step-by-Step Setup

### Step 1: Install Server Dependencies

```bash
cd agent-frontend-demo/server
npm install
```

This will install:
- `@privy-io/server-auth` - Server-side Privy client
- `express` - API server
- `cors` - CORS middleware
- `tsx` - TypeScript execution

### Step 2: Get Your Privy App Secret

1. Go to [Privy Dashboard](https://console.privy.io/)
2. Select your app
3. Go to **Settings** → **API Keys**
4. Copy your **App Secret** (NOT the App ID)

### Step 3: Configure Environment Variables

Create a `.env` file in the `server/` directory:

```env
# Your Privy App ID (same as frontend)
PRIVY_APP_ID=your-privy-app-id-here

# Your Privy App Secret (from dashboard)
PRIVY_APP_SECRET=your-privy-app-secret-here

# Server port (optional, defaults to 3001)
PORT=3001
```

Also update your frontend `.env`:

```env
# Existing
VITE_PRIVY_APP_ID=your-privy-app-id-here
VITE_OPENROUTER_API_KEY=your-openrouter-key

# NEW: Session signer API URL
VITE_SESSION_SIGNER_API_URL=http://localhost:3001
```

### Step 4: Enable Session Signers in Privy Dashboard

1. Go to [Privy Dashboard](https://console.privy.io/)
2. Select your app
3. Navigate to **Wallets** → **Session Signers**
4. **Enable session signers** for your app
5. Configure signing permissions (optional)
6. Save configuration

### Step 5: Start the Server

```bash
cd agent-frontend-demo/server
npm run dev
```

You should see:
```
🚀 Privy Session Signer API running on http://localhost:3001
📋 Health check: http://localhost:3001/health
```

### Step 6: Start the Frontend

In a separate terminal:

```bash
cd agent-frontend-demo
npm run dev
```

### Step 7: Test Session Signers

1. Login to your app with Privy
2. The app will automatically check if session signers are available
3. When making payments, transactions will be signed in the background (no modals!)

## How Transactions Work Now

### Registration (ERC-8004)
- **Before**: Privy modal appears → User approves → Transaction executes
- **After**: Transaction signed server-side → Executes automatically

### Token Approval (x402)
- **Before**: Privy modal appears → User approves → Approval executes
- **After**: Approval signed server-side → Executes automatically

### Payment Signing (x402)
- **Note**: x402 payments use EIP-712 signing (not transactions)
- The `createPaymentPayload` function already signs messages, not transactions
- Only the **approval transaction** uses session signers

## API Endpoints

The server provides these endpoints:

### `POST /api/session-signer/sign`
Sign a single transaction

**Request:**
```json
{
  "identityToken": "user's-privy-token",
  "transaction": {
    "to": "0x...",
    "data": "0x...",
    "value": "0x0",
    "chainId": 43113
  }
}
```

**Response:**
```json
{
  "hash": "0x...",
  "success": true
}
```

### `POST /api/session-signer/sign-batch`
Sign multiple transactions in batch

### `POST /api/session-signer/wallets`
Get user's wallets with session signers enabled

## Code Changes

### Frontend Hook (`useSessionSigner.ts`)
- Provides `signTransaction()` function
- Automatically gets identity token from Privy
- Handles API communication

### Payment Flow (`useAgent.ts`)
- Checks if session signers are available
- Uses session signers for token approvals
- Falls back to direct signing if session signers fail

### Registration Flow
- Optional session signer mode
- Can be enabled per registration call

## Troubleshooting

### Error: "Session signers not available"
- ✅ Check if `@privy-io/server-auth` is installed in `server/` directory
- ✅ Verify `PRIVY_APP_SECRET` is set in server `.env`
- ✅ Restart the server after adding environment variables

### Error: "No session signer wallets found"
- ✅ Enable session signers in Privy Dashboard
- ✅ Ensure user has an embedded wallet
- ✅ Session signers must be explicitly enabled per wallet

### Error: "Authentication failed"
- ✅ Check if user is properly logged in
- ✅ Verify identity token is valid
- ✅ Check Privy app ID matches in both frontend and server

### Server not starting
- ✅ Check if port 3001 is available
- ✅ Verify all dependencies are installed
- ✅ Check TypeScript compilation errors

## Security Considerations

1. **Server Security**: Keep `PRIVY_APP_SECRET` secure and never expose it to the frontend
2. **Rate Limiting**: Consider adding rate limiting to API endpoints
3. **Authentication**: All requests require valid Privy identity tokens
4. **Error Handling**: Comprehensive error handling prevents information leakage

## Benefits

✅ **No User Interruption**: Transactions execute automatically  
✅ **Better UX**: Seamless, web2-like experience  
✅ **Autonomous Agents**: Agents can operate without constant user approval  
✅ **Batch Support**: Multiple transactions in one request  

## Next Steps

1. Install server dependencies
2. Configure environment variables
3. Enable session signers in Privy Dashboard
4. Start the server
5. Test with a small transaction
6. Monitor logs for any issues

## References

- [Privy Session Signers Docs](https://docs.privy.io/wallets/using-wallets/session-signers/use-session-signers)
- [Privy Server Auth Docs](https://docs.privy.io/server-auth)
- [Privy Dashboard](https://console.privy.io/)

