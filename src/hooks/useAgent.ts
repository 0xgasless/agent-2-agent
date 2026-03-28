import { useState, useCallback } from 'react';
import { AgentSDK } from '@0xgasless/agent-sdk';
import { Signer, Provider, Contract } from 'ethers';
import { AgentState, AgentMessage, TransactionLog } from '../types/agent';
import { fujiConfig, IDENTITY_REGISTRY } from '../config/fuji';
import { callOpenRouter, OpenRouterMessage } from '../services/openrouter';

/**
 * Reads agent registration directly from the on-chain ERC-721 identity contract.
 * Uses only simple `view` calls (balanceOf + ownerOf) — no event logs,
 * so it works with any RPC regardless of block-range limits.
 */
async function findAgentIdOnChain(walletAddress: string, provider: Provider): Promise<string | null> {
  const abi = [
    'function balanceOf(address owner) view returns (uint256)',
    'function ownerOf(uint256 tokenId) view returns (address)',
  ];
  const registry = new Contract(IDENTITY_REGISTRY, abi, provider);

  // Step 1: Quick check — does this address own any agent NFT?
  const balance: bigint = await registry.balanceOf(walletAddress);
  if (balance === 0n) return null;

  // Step 2: Find the highest existing token ID via binary search
  let low = 1;
  let high = 64; // Start with a reasonable upper bound
  // Expand upper bound until we find one that doesn't exist
  while (true) {
    try {
      await registry.ownerOf(high);
      high *= 2;
    } catch {
      break;
    }
  }
  // Binary search for exact max token ID
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    try {
      await registry.ownerOf(mid);
      low = mid;
    } catch {
      high = mid - 1;
    }
  }
  const maxId = low;

  // Step 3: Scan backwards (newest first) to find our token
  const target = walletAddress.toLowerCase();
  for (let id = maxId; id >= 1; id--) {
    try {
      const owner: string = await registry.ownerOf(id);
      if (owner.toLowerCase() === target) return id.toString();
    } catch {
      continue;
    }
  }

  return null;
}

export function useAgent(name: 'agentA' | 'agentB') {
  const [sdk, setSDK] = useState<AgentSDK | null>(null);
  const [ownerAddress, setOwnerAddress] = useState<string>('');
  const [state, setState] = useState<AgentState>({
    id: null,
    domain: null,
    address: '',
    registered: false,
    balance: '0',
    reputation: { totalFeedback: 0, averageScore: 0 },
    isValidator: false,
    stakedAmount: '0',
  });
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);

  // Initialize with any ethers Signer (Privy, ethers.Wallet, etc.)
  const initializeWithSigner = useCallback(async (signer: Signer, provider: Provider, ownerAddr?: string) => {
    try {
      console.log(`🔐 [${name}] Initializing agent wallet...`);
      
      // Create SDK with signer
      console.log(`📡 [${name}] Network config:`, fujiConfig.networks);
      
      const agentSDK = new AgentSDK({
        networks: fujiConfig.networks,
        defaultNetwork: fujiConfig.defaultNetwork,
        signer,
        provider,
      });
      
      console.log(`✅ [${name}] AgentSDK instance created`);
      setSDK(agentSDK);
      
      const address = await agentSDK.getAddress();
      setState(prev => ({ ...prev, address }));
      // Owner address is where funds can be withdrawn to
      setOwnerAddress(ownerAddr || address);
      console.log(`✅ [${name}] Wallet address:`, address);

      // Check on-chain registration via direct contract view calls
      // (no event logs — works with any RPC, no block-range limits)
      try {
        console.log(`🔍 [${name}] Checking on-chain registration for address: ${address}...`);
        const agentId = await findAgentIdOnChain(address, provider);
        console.log(`🔍 [${name}] findAgentIdOnChain result:`, agentId);

        if (agentId) {
          setState(prev => ({
            ...prev,
            id: agentId,
            domain: `agent-${agentId}`,
            registered: true,
          }));
          console.log(`✅ [${name}] On-chain registration verified — Agent ID: ${agentId}`);
        } else {
          console.log(`ℹ️ [${name}] Not registered on-chain — will need to register`);
        }
      } catch (err: any) {
        console.warn(`⚠️ [${name}] Could not verify on-chain registration:`, err.message);
        console.error(err);
      }
    } catch (error: any) {
      console.error(`Error initializing ${name}:`, error.message);
    }
  }, [name]);

  const addMessage = useCallback((msg: Omit<AgentMessage, 'id' | 'timestamp'>) => {
    const newMessage: AgentMessage = {
      ...msg,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
    };
    console.log(`📨 [${name}] Message added:`, {
      type: newMessage.type,
      from: newMessage.from,
      to: newMessage.to,
      status: newMessage.status,
      hasTxHash: !!newMessage.txHash,
      preview: newMessage.message.substring(0, 50) + '...',
    });
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  }, [name]);

  const addTransaction = useCallback((tx: Omit<TransactionLog, 'id' | 'timestamp'>) => {
    const newTx: TransactionLog = {
      ...tx,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
    };
    console.log(`📝 [${name}] Transaction added:`, {
      type: newTx.type,
      from: newTx.from,
      to: newTx.to,
      status: newTx.status,
      hash: newTx.txHash,
      details: newTx.details,
      timestamp: newTx.timestamp.toISOString(),
    });
    setTransactions(prev => [...prev, newTx]);
  }, [name]);

  const updateTransaction = useCallback((txHash: string, status: 'success' | 'failed') => {
    console.log(`🔄 [${name}] Transaction updated:`, {
      hash: txHash,
      newStatus: status,
    });
    setTransactions(prev =>
      prev.map(tx => {
        if (tx.txHash === txHash) {
          console.log(`  ✅ Updated transaction ${txHash.slice(0, 10)}... from ${tx.status} to ${status}`);
          return { ...tx, status };
        }
        return tx;
      })
    );
  }, [name]);

  const register = useCallback(async () => {
    if (!sdk) {
      console.error(`[${name}] SDK not initialized`);
      return;
    }

    try {
      const address = await sdk.getAddress();
      console.log(`${name} wallet address:`, address);

      const identity = sdk.erc8004.identity('fuji');
      const domain = `${name}-${Date.now()}`;
      const agentCardURI = `ipfs://Qm${name}Example123`;
      
      console.log(`${name} registering with domain:`, domain);
      
      // Direct signing (will show Privy modal)
      const tx = await identity.register(agentCardURI);
      
      console.log(`${name} registration TX:`, tx.hash);
      
      addTransaction({
        type: 'register',
        from: name,
        txHash: tx.hash,
        status: 'pending',
        details: `Registering agent with URI: ${agentCardURI}`,
      });

      console.log(`⏳ [${name}] Waiting for transaction confirmation...`);
      const receipt = await tx.wait();
      if (receipt) {
        console.log(`✅ [${name}] Transaction confirmed!`, {
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed?.toString(),
          status: receipt.status,
        });
      }
      
      // Try to get Agent ID directly from receipt logs first (Faster & avoids RPC query limits)
      let agentId = null;
      if (receipt) {
        try {
          // Event: Registered(uint256 indexed agentId, string agentURI, address indexed owner)
          // Topic 0: 0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a
          const REGISTERED_TOPIC = '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a';
          
          const registeredLog = receipt.logs.find((log: any) => log.topics[0] === REGISTERED_TOPIC);
          if (registeredLog) {
            // agentId is first indexed param (topic 1)
            const idHex = registeredLog.topics[1];
            agentId = BigInt(idHex).toString();
            console.log(`✅ [${name}] Found Agent ID in receipt logs: ${agentId}`);
          }
        } catch (parseError) {
          console.warn(`⚠️ [${name}] Failed to parse receipt logs, falling back to query:`, parseError);
        }
      }

      // Fallback to query if not found in receipt
      if (!agentId) {
        agentId = await identity.getAgentIdByOwner(await sdk.getAddress());
      }
      
      if (agentId) {
        console.log(`✅ [${name}] Agent registered successfully:`, {
          id: agentId,
          domain: domain,
          owner: address,
        });
        setState(prev => ({
          ...prev,
          id: agentId,
          domain: domain,
          registered: true,
        }));

        updateTransaction(tx.hash, 'success');
        addMessage({
          from: name,
          to: name,
          message: `✅ Successfully registered as agent! ID: ${agentId}`,
          type: 'transaction',
          txHash: tx.hash,
          status: 'success',
        });
      }
    } catch (error: any) {
      console.error(`\n❌ [${name}] Registration Error:`, {
        errorType: error.constructor.name,
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      const errorMsg = error.message || String(error);
      addMessage({
        from: name,
        to: name,
        message: `❌ Registration failed: ${errorMsg}`,
        type: 'transaction',
        status: 'failed',
      });
      
      if (error.transaction?.hash) {
        addTransaction({
          type: 'register',
          from: name,
          txHash: error.transaction.hash,
          status: 'failed',
          details: `Registration failed: ${errorMsg}`,
        });
      }
    }
  }, [sdk, name, addMessage, addTransaction, updateTransaction]);

  const sendPayment = useCallback(async (toAddress: string, amount: string) => {
    if (!sdk) {
      console.error(`[${name}] SDK not initialized`);
      return null;
    }

    console.log(`\n💳 [${name}] ========== Payment Process Started ==========`);
    console.log(`📍 Recipient: ${toAddress}`);
    console.log(`💵 Amount: ${amount} (${(Number(amount) / 1e6).toFixed(6)} USDT)`);
    
    try {
      const facilitator = sdk.getFacilitator('fuji');
      const network = sdk.getNetwork('fuji');
      console.log(`🌐 Network: ${network.name} (Chain ID: ${network.chainId})`);
      console.log(`🔗 Facilitator URL: ${network.x402?.facilitatorUrl}`);
      
      // Approve relayer if needed
      const signer = sdk.getSigner();
      const tokenAddress = network.x402?.defaultToken || '';
      const relayerAddress = network.x402?.verifyingContract || '';
      
      console.log(`🔐 Checking token approval...`);
      console.log(`  Token: ${tokenAddress}`);
      console.log(`  Relayer: ${relayerAddress}`);
      
      if (tokenAddress && relayerAddress) {
        const tokenABI = [
          'function allowance(address owner, address spender) view returns (uint256)',
          'function approve(address spender, uint256 amount) returns (bool)',
          'function balanceOf(address owner) view returns (uint256)',
          'function decimals() view returns (uint8)',
        ];
        // Use signer directly - it's already connected to the provider
        // JsonRpcSigner doesn't support connect(), so we use it as-is
        const tokenContract = new Contract(tokenAddress, tokenABI, signer);
        const walletAddress = await signer.getAddress();
        
        // Check balance first
        const balance = await tokenContract.balanceOf(walletAddress);
        const decimals = await tokenContract.decimals();
        const requiredAmount = BigInt(amount);
        
        console.log(`💰 Balance check:`);
        console.log(`  Current balance: ${balance.toString()} (${(Number(balance) / 10**Number(decimals)).toFixed(6)} USDT)`);
        console.log(`  Required amount: ${requiredAmount.toString()} (${(Number(requiredAmount) / 10**Number(decimals)).toFixed(6)} USDT)`);
        
        if (balance < requiredAmount) {
          const errorMsg = `Insufficient balance! Need ${(Number(requiredAmount) / 10**Number(decimals)).toFixed(6)} USDT but only have ${(Number(balance) / 10**Number(decimals)).toFixed(6)} USDT`;
          console.error(`  ❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
        console.log(`  ✅ Sufficient balance`);
        
        // Check allowance
        const currentAllowance = await tokenContract.allowance(walletAddress, relayerAddress);
        console.log(`🔐 Allowance check:`);
        console.log(`  Current allowance: ${currentAllowance.toString()} (${(Number(currentAllowance) / 10**Number(decimals)).toFixed(6)} USDT)`);
        console.log(`  Required amount: ${requiredAmount.toString()} (${(Number(requiredAmount) / 10**Number(decimals)).toFixed(6)} USDT)`);
        
        if (currentAllowance < requiredAmount) {
          console.log(`  ⚠️ Insufficient allowance, approving...`);
          
          // Direct signing (will show Privy modal)
          const approveTx = await tokenContract.approve(relayerAddress, '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
          
          console.log(`  📝 Approval TX: ${approveTx.hash}`);
          const approveReceipt = await approveTx.wait();
          if (approveReceipt) {
            console.log(`  ✅ Approval confirmed in block: ${approveReceipt.blockNumber}`);
          }
        } else {
          console.log(`  ✅ Sufficient allowance`);
        }
      }

      const requirements = {
        scheme: 'exact' as const,
        network: 'fuji' as any,
        asset: network.x402?.defaultToken || '',
        payTo: toAddress,
        maxAmountRequired: amount,
        maxTimeoutSeconds: 3600,
        description: `Payment from ${name}`,
        relayerContract: network.x402?.verifyingContract || '',
      };

      console.log(`📋 Payment requirements:`, requirements);

      const { createPaymentPayload } = await import('@0xgasless/agent-sdk');
      console.log(`🔐 Creating payment payload...`);
      const payload = await createPaymentPayload(requirements, signer as any, network);
      console.log(`✅ Payment payload created`);
      
      console.log(`🔍 Verifying payment with facilitator...`);
      const verifyResult = await facilitator.verify(payload, requirements);
      console.log(`📊 Verification result:`, {
        isValid: verifyResult.isValid,
      });
      
      if (verifyResult.isValid) {
        console.log(`💰 Settling payment...`);
        const settleResult = await facilitator.settle(payload, requirements);
        console.log(`📊 Settlement result:`, {
          success: settleResult.success,
          transaction: settleResult.transaction,
        });
        
        if (settleResult.success && settleResult.transaction) {
          console.log(`✅ Payment settled successfully!`);
          console.log(`🔗 Transaction hash: ${settleResult.transaction}`);
          addTransaction({
            type: 'payment',
            from: name,
            txHash: settleResult.transaction,
            status: 'success',
            details: `Paid ${amount} tokens to ${toAddress.slice(0, 10)}...`,
          });
          
          addMessage({
            from: name,
            to: name,
            message: `💰 Payment sent! TX: ${settleResult.transaction.slice(0, 10)}...`,
            type: 'payment',
            txHash: settleResult.transaction,
            status: 'success',
          });
          
          return settleResult.transaction;
        } else {
          const errorReason = settleResult.errorReason || 'Unknown error';
          console.error(`\n❌ Settlement failed!`);
          console.error(`   Error reason: ${errorReason}`);
          
          addMessage({
            from: name,
            to: name,
            message: `❌ Payment failed: ${errorReason}`,
            type: 'payment',
            status: 'failed',
          });
          
          throw new Error(`Settlement failed: ${errorReason}`);
        }
      } else {
        const invalidReason = verifyResult.invalidReason || 'Unknown reason';
        console.error(`\n❌ Verification failed!`);
        console.error(`   Reason: ${invalidReason}`);
        
        addMessage({
          from: name,
          to: name,
          message: `❌ Payment verification failed: ${invalidReason}`,
          type: 'payment',
          status: 'failed',
        });
        
        throw new Error(`Verification failed: ${invalidReason}`);
      }
    } catch (error: any) {
      console.error(`\n❌ [${name}] Payment Error:`, {
        errorType: error.constructor.name,
        message: error.message,
        code: error.code,
        response: error.response?.data,
        stack: error.stack,
      });
      addMessage({
        from: name,
        to: name,
        message: `❌ Payment failed: ${error.message}`,
        type: 'payment',
        status: 'failed',
      });
      
      return null;
    }
  }, [sdk, name, addMessage, addTransaction]);

  const sendMessage = useCallback((to: 'agentA' | 'agentB', message: string) => {
    return addMessage({
      from: name,
      to,
      message,
      type: 'message',
    });
  }, [name, addMessage]);

  /**
   * Sanitize AI response to prevent hallucination artifacts.
   */
  const sanitizeResponse = (text: string, phase: string): string => {
    let clean = text;

    // Strip markdown bold/italic/headers
    clean = clean.replace(/#{1,3}\s+/g, '');
    clean = clean.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
    clean = clean.replace(/_{1,2}([^_]+)_{1,2}/g, '$1');

    // Strip lines that look like the agent roleplaying the other side
    const lines = clean.split('\n').filter(line => {
      const trimmed = line.trim();
      if (/^(Employer|Agent A|You):/i.test(trimmed) && name === 'agentB') return false;
      if (/^(Freelancer|Agent B|You):/i.test(trimmed) && name === 'agentA') return false;
      if (/^---+$/.test(trimmed)) return false;
      return true;
    });

    clean = lines.join('\n').trim();
    clean = clean.replace(/^\*?\*?(You|Agent [AB]|Employer|Freelancer):\*?\*?\s*/i, '');

    // Delivery phase gets more room; everything else is capped tighter
    const maxLen = phase === 'delivery' ? 1200 : 500;
    if (clean.length > maxLen) clean = clean.slice(0, maxLen).trim();

    return clean || 'Thanks for sharing!';
  };

  const sendAIMessage = useCallback(async (
    to: 'agentA' | 'agentB',
    conversationHistory: Array<{ from: 'agentA' | 'agentB'; message: string }>,
    apiKey: string,
    context?: { phase: string; turnNumber: number; budget?: number }
  ) => {
    try {
      const phase = context?.phase ?? 'networking';
      const budget = context?.budget ?? 10;

      const RULES = [
        ``,
        `STRICT RULES:`,
        `- You are ONE person. NEVER write the other person's response or dialogue.`,
        `- NEVER write labels like "You:", "Employer:", "Agent A:", etc.`,
        `- NEVER use markdown (no **, ##, ---, bullets).`,
        `- Write ONLY plain text. One short response. 2-3 sentences max.`,
        `- Do NOT say goodbye or end the conversation.`,
        `- Do NOT skip ahead to a future phase.`,
        `- Do NOT promise to do work "later" or "within a week" — everything happens NOW in this conversation.`,
      ].join('\n');

      const RULES_DELIVERY = [
        ``,
        `STRICT RULES:`,
        `- You are ONE person. NEVER write the other person's response.`,
        `- NEVER write labels like "You:", "Employer:", etc.`,
        `- NEVER use markdown (no **, ##, ---, bullets).`,
        `- Write plain text only. For this delivery, you may write 6-10 sentences.`,
        `- Do NOT say goodbye or end the conversation.`,
        `- Deliver the ACTUAL research right now — not a promise to deliver later.`,
      ].join('\n');

      const phaseInstructions: Record<string, Record<'agentA' | 'agentB', string>> = {
        networking: {
          agentA: [
            `You are a tech startup founder at a blockchain networking event.`,
            `PHASE: First meeting.`,
            `Introduce yourself in 2 sentences. You run an AI startup and are looking for freelance talent. Ask what the other person does.`,
            RULES,
          ].join('\n'),
          agentB: [
            `You are a freelance researcher specializing in AI and blockchain analysis.`,
            `PHASE: First meeting.`,
            `Respond to the intro in 2-3 sentences. You do research and analysis on AI/blockchain topics for clients. Ask what kind of work they need.`,
            RULES,
          ].join('\n'),
        },
        discovery: {
          agentA: [
            `You are a tech startup founder chatting with a freelance researcher.`,
            `PHASE: Exploring collaboration.`,
            `You need a research brief on a specific topic (pick one: "AI agents in decentralized finance", "on-chain AI identity standards", or "gasless payment protocols for AI agents"). Describe what you need in 2-3 sentences and ask if they can handle it.`,
            RULES,
          ].join('\n'),
          agentB: [
            `You are a freelance researcher talking to a potential client.`,
            `PHASE: Exploring collaboration.`,
            `They mentioned a research topic. Respond with enthusiasm — you've done similar work before. Ask about scope and budget so you can quote a rate.`,
            RULES,
          ].join('\n'),
        },
        negotiation: {
          agentA: [
            `You are a startup founder hiring a freelance researcher.`,
            `PHASE: Price negotiation.`,
            `Your maximum budget is ${budget} USDT for this task. If they haven't quoted yet, ask for their rate. If they quoted, accept if within budget or counter-offer. Be direct with numbers.`,
            RULES,
          ].join('\n'),
          agentB: [
            `You are a freelance researcher negotiating a rate.`,
            `PHASE: Price negotiation.`,
            `Quote your rate: ${Math.max(3, budget - 3)} USDT for this research brief. If they counter, be flexible. Once a price is agreed, confirm you'll start working on it right now.`,
            RULES,
          ].join('\n'),
        },
        delivery: {
          agentA: [
            `You are a startup founder. The freelancer you hired is about to deliver research results.`,
            `PHASE: Awaiting delivery.`,
            `If the freelancer just delivered work, acknowledge it and say the research looks great. If they haven't delivered yet, ask them to share the results now.`,
            `Keep your response to 2 sentences.`,
            RULES,
          ].join('\n'),
          agentB: [
            `You are a freelance researcher who has completed the agreed research task.`,
            `PHASE: Delivering work RIGHT NOW.`,
            `You MUST deliver the actual research in THIS message. Do NOT say you will deliver later. Write a professional research summary (6-10 sentences) on the topic discussed in the conversation. Include:`,
            `- Key findings with specific data points or percentages`,
            `- Current trends and market dynamics`,
            `- Practical implications or recommendations`,
            `This is your deliverable. Make it substantive and insightful.`,
            RULES_DELIVERY,
          ].join('\n'),
        },
        payment: {
          agentA: [
            `You are a startup founder who just received excellent research from a freelancer.`,
            `PHASE: Sending payment.`,
            `You are satisfied with the work. Say exactly: "Great work! I'll send ${budget} USDT now" — use that exact phrasing with the number ${budget}. Nothing else.`,
            RULES,
          ].join('\n'),
          agentB: [
            `You are a freelance researcher. Payment was just confirmed.`,
            `PHASE: Payment received.`,
            `Thank them briefly for the payment in 1-2 sentences. Mention you're open to future work.`,
            RULES,
          ].join('\n'),
        },
        closing: {
          agentA: [
            `You are a startup founder who just paid a freelancer.`,
            `PHASE: Closing.`,
            `Write one final sentence thanking them. This is your LAST message.`,
            RULES,
          ].join('\n'),
          agentB: [
            `You are a freelance researcher who just got paid.`,
            `PHASE: Closing.`,
            `Write one final sentence of thanks. This is your LAST message.`,
            RULES,
          ].join('\n'),
        },
      };

      const systemPrompt = phaseInstructions[phase]?.[name] || phaseInstructions.networking[name];

      const messages: OpenRouterMessage[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-10).map(msg => ({
          role: (msg.from === name ? 'assistant' : 'user') as 'user' | 'assistant',
          content: msg.message,
        })),
      ];

      const raw = await callOpenRouter(messages, apiKey);
      const response = sanitizeResponse(raw, phase);

      return addMessage({
        from: name,
        to,
        message: response,
        type: 'message',
      });
    } catch (error: any) {
      return addMessage({
        from: name,
        to,
        message: `❌ AI error: ${error.message}`,
        type: 'message',
        status: 'failed',
      });
    }
  }, [name, addMessage]);

  // Transfer funds from agent wallet back to owner wallet
  const transferFundsToOwner = useCallback(async (ownerWalletAddress: string, tokenAddress?: string) => {
    if (!sdk) {
      console.error(`[${name}] SDK not initialized`);
      return null;
    }

    try {
      const signer = sdk.getSigner();
      const provider = sdk.getProvider();
      const agentAddress = await signer.getAddress();

      console.log(`\n💸 [${name}] ========== Transfer Funds to Owner ==========`);
      console.log(`📍 Agent address: ${agentAddress}`);
      console.log(`📍 Owner address: ${ownerWalletAddress}`);

      if (tokenAddress) {
        // Transfer ERC20 token (USDT/USDC)
        console.log(`🪙 Transferring ERC20 token: ${tokenAddress}`);
        const tokenABI = [
          'function balanceOf(address owner) view returns (uint256)',
          'function transfer(address to, uint256 amount) returns (bool)',
          'function decimals() view returns (uint8)',
        ];
        const tokenContract = new Contract(tokenAddress, tokenABI, signer);
        const balance = await tokenContract.balanceOf(agentAddress);
        const decimals = await tokenContract.decimals();
        const balanceFormatted = Number(balance) / 10 ** Number(decimals);

        console.log(`💰 Agent balance: ${balanceFormatted} tokens`);

        if (balance === 0n) {
          console.log(`⚠️ No tokens to transfer`);
          addMessage({
            from: name,
            to: name,
            message: `No tokens available to transfer to owner`,
            type: 'transaction',
            status: 'failed',
          });
          return null;
        }

        addTransaction({
          type: 'payment',
          from: name,
          txHash: '',
          status: 'pending',
          details: `Transferring ${balanceFormatted} tokens to owner ${ownerWalletAddress.slice(0, 10)}...`,
        });

        const tx = await tokenContract.transfer(ownerWalletAddress, balance);
        console.log(`📝 Transfer TX: ${tx.hash}`);

        const receipt = await tx.wait();
        if (receipt && receipt.status === 1) {
          console.log(`✅ Transfer confirmed in block ${receipt.blockNumber}`);
          updateTransaction(tx.hash, 'success');
          addMessage({
            from: name,
            to: name,
            message: `✅ Transferred ${balanceFormatted} tokens to owner wallet`,
            type: 'transaction',
            txHash: tx.hash,
            status: 'success',
          });
          return tx.hash;
        } else {
          throw new Error('Transfer transaction failed');
        }
      } else {
        // Transfer native token (AVAX) — reserve gas so the tx doesn't revert
        console.log(`💎 Transferring native AVAX`);
        const balance = await provider.getBalance(agentAddress);
        const balanceInAvax = Number(balance) / 1e18;

        console.log(`💰 Agent balance: ${balanceInAvax} AVAX`);

        if (balance === 0n) {
          console.log(`⚠️ No AVAX to transfer`);
          addMessage({
            from: name,
            to: name,
            message: `No AVAX available to transfer to owner`,
            type: 'transaction',
            status: 'failed',
          });
          return null;
        }

        // Estimate gas cost so we don't try to send the entire balance
        const gasEstimate = await provider.estimateGas({
          to: ownerWalletAddress,
          from: agentAddress,
          value: balance / 2n,
        });
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || 25000000000n;
        const maxGasCost = gasEstimate * gasPrice * 2n;
        const transferAmount = balance - maxGasCost;

        if (transferAmount <= 0n) {
          console.log(`⚠️ Balance too low to cover gas`);
          addMessage({
            from: name,
            to: name,
            message: `AVAX balance too low to cover transfer gas costs`,
            type: 'transaction',
            status: 'failed',
          });
          return null;
        }

        const transferAmountInAvax = Number(transferAmount) / 1e18;
        addTransaction({
          type: 'payment',
          from: name,
          txHash: '',
          status: 'pending',
          details: `Transferring ${transferAmountInAvax.toFixed(6)} AVAX to owner ${ownerWalletAddress.slice(0, 10)}...`,
        });

        const tx = await signer.sendTransaction({
          to: ownerWalletAddress,
          value: transferAmount,
        });
        console.log(`📝 Transfer TX: ${tx.hash}`);

        const receipt = await tx.wait();
        if (receipt && receipt.status === 1) {
          console.log(`✅ Transfer confirmed in block ${receipt.blockNumber}`);
          updateTransaction(tx.hash, 'success');
          addMessage({
            from: name,
            to: name,
            message: `✅ Transferred ${transferAmountInAvax.toFixed(6)} AVAX to owner wallet`,
            type: 'transaction',
            txHash: tx.hash,
            status: 'success',
          });
          return tx.hash;
        } else {
          throw new Error('Transfer transaction failed');
        }
      }
    } catch (error: any) {
      console.error(`\n❌ [${name}] Transfer Error:`, {
        errorType: error.constructor.name,
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      addMessage({
        from: name,
        to: name,
        message: `❌ Transfer failed: ${error.message}`,
        type: 'transaction',
        status: 'failed',
      });
      return null;
    }
  }, [sdk, name, addMessage, addTransaction, updateTransaction]);

  return {
    sdk,
    state,
    messages,
    transactions,
    ownerAddress,
    initializeWithSigner,
    register,
    sendPayment,
    sendMessage,
    sendAIMessage,
    addMessage,
    transferFundsToOwner,
  };
}
