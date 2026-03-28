import { useState, useEffect, useCallback, useRef } from 'react';
import { OxGasAuth, OxGasClient, type WalletInfo } from '@0xgasless/core';
import {
  AbstractSigner,
  Wallet,
  JsonRpcProvider,
  Contract,
  parseEther,
  parseUnits,
  TypedDataEncoder,
  type Provider,
  type TransactionRequest,
  type TypedDataDomain,
  type TypedDataField,
} from 'ethers';
import { useAgent } from './hooks/useAgent';
import { AgentMessage } from './types/agent';
import { FUJI_RPC_URL, USDT_TOKEN_ADDRESS } from './config/fuji';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  Bot,
  Rocket,
  Loader2,
  ExternalLink,
  Pause,
  Play,
  Square,
  ArrowUpRight,
  Send,
  ChevronDown,
  CircleDot,
  Copy,
  Check,
} from 'lucide-react';

const TOKEN_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

const client = new OxGasClient({
  apiKey: import.meta.env.VITE_0XGAS_API_KEY || 'your-0xgas-api-key',
  chainId: 43113, // Fuji
  bundlerUrl: 'https://bundler.0xgasless.com/43113',
  paymasterUrl: `https://paymaster.0xgasless.com/v1/43113/rpc/${import.meta.env.VITE_0XGAS_API_KEY}`,
  debug: true,
});

/**
 * Adapter to make OxGasAuth compatible with ethers.Signer
 */
class OxGasEthersSigner extends AbstractSigner {
  private auth: OxGasAuth;
  private _address: string;

  constructor(auth: OxGasAuth, address: string, provider: Provider) {
    super(provider);
    this.auth = auth;
    this._address = address;
  }

  async getAddress(): Promise<string> {
    return this._address;
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const result = await this.auth.signMessage(message);
    return result.signature;
  }

  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string> {
    const digest = TypedDataEncoder.hash(domain, types, value);
    const result = await this.auth.signMessage(digest);
    return result.signature;
  }

  async signTransaction(tx: TransactionRequest): Promise<string> {
    const result = await this.auth.signTransaction({
      to: tx.to as `0x${string}`,
      value: tx.value?.toString() || '0',
      data: tx.data as `0x${string}` || '0x',
      nonce: tx.nonce !== undefined && tx.nonce !== null ? Number(tx.nonce) : undefined,
      gas: tx.gasLimit !== undefined && tx.gasLimit !== null ? Number(tx.gasLimit) : undefined,
      gasPrice: tx.gasPrice !== undefined && tx.gasPrice !== null ? Number(tx.gasPrice) : undefined,
      maxFeePerGas: tx.maxFeePerGas !== undefined && tx.maxFeePerGas !== null ? Number(tx.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas !== undefined && tx.maxPriorityFeePerGas !== null ? Number(tx.maxPriorityFeePerGas) : undefined,
    });
    return result.rawTx;
  }

  async sendTransaction(tx: TransactionRequest): Promise<any> {
    const pop = await this.populateTransaction(tx);
    // AbstractSigner expects us to return signed hex from signTransaction, 
    // but we can just use signTransaction results here.
    const result = await this.auth.signTransaction({
      to: pop.to as `0x${string}`,
      value: pop.value?.toString() || '0',
      data: pop.data as `0x${string}` || '0x',
      nonce: pop.nonce !== undefined && pop.nonce !== null ? Number(pop.nonce) : undefined,
      gas: pop.gasLimit !== undefined && pop.gasLimit !== null ? Number(pop.gasLimit) : undefined,
      gasPrice: pop.gasPrice !== undefined && pop.gasPrice !== null ? Number(pop.gasPrice) : undefined,
      maxFeePerGas: pop.maxFeePerGas !== undefined && pop.maxFeePerGas !== null ? Number(pop.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: pop.maxPriorityFeePerGas !== undefined && pop.maxPriorityFeePerGas !== null ? Number(pop.maxPriorityFeePerGas) : undefined,
    });

    if (result.txHash) {
      const hash = result.txHash;
      // Return a partial TransactionResponse
      return {
        hash,
        wait: async () => this.provider!.waitForTransaction(hash),
      };
    }

    return this.provider!.broadcastTransaction(result.rawTx);
  }

  connect(provider: Provider | null): OxGasEthersSigner {
    return new OxGasEthersSigner(this.auth, this._address, provider!);
  }
}

function App() {
  return (
    <AgentDemo />
  );
}

// ---------- helpers ----------

async function fetchBalances(
  provider: Provider,
  address: string,
): Promise<{ avax: string; usdt: string }> {
  let avax = '0';
  let usdt = '0';
  try {
    const bal = await provider.getBalance(address);
    avax = (Number(bal) / 1e18).toFixed(4);
  } catch { /* ignore */ }
  try {
    const token = new Contract(USDT_TOKEN_ADDRESS, TOKEN_ABI, provider);
    const bal = await token.balanceOf(address);
    const dec = await token.decimals();
    usdt = (Number(bal) / 10 ** Number(dec)).toFixed(2);
  } catch { /* ignore */ }
  return { avax, usdt };
}

function truncAddr(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ---------- Main Demo ----------

function AgentDemo() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);

  useEffect(() => {
    setReady(true);
    setAuthenticated(client.isLoggedIn);
    setWallet(client.auth.getWalletInfo());

    const unsub = client.auth.on('stateChange', (state) => {
      setAuthenticated(state === 'connected');
      setWallet(client.auth.getWalletInfo());
    });

    return () => unsub();
  }, []);

  const login = async () => {
    try {
      const w = await client.login();
      setWallet(w);
      setAuthenticated(true);
    } catch (err) {
      console.error('Login failed:', err);
    }
  };
  const [openRouterKey] = useState(import.meta.env.VITE_OPENROUTER_API_KEY || '');
  const agentA = useAgent('agentA');
  const agentB = useAgent('agentB');

  const [rpcProvider] = useState(() => new JsonRpcProvider(FUJI_RPC_URL));
  const [ownerSigner, setOwnerSigner] = useState<OxGasEthersSigner | null>(null);
  const [ownerAddress, setOwnerAddress] = useState('');
  const [agentAWallet, setAgentAWallet] = useState<Wallet | null>(null);
  const [agentBWallet, setAgentBWallet] = useState<Wallet | null>(null);
  const [ownerBal, setOwnerBal] = useState({ avax: '0', usdt: '0' });
  const [agentABal, setAgentABal] = useState({ avax: '0', usdt: '0' });
  const [agentBBal, setAgentBBal] = useState({ avax: '0', usdt: '0' });
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [fundingInProgress, setFundingInProgress] = useState(false);
  const conversationCancelledRef = useRef(false);
  const conversationPausedRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ---- Generate / restore agent wallets ----
  useEffect(() => {
    let keyA = localStorage.getItem('0xgasless_agentA_pk');
    let keyB = localStorage.getItem('0xgasless_agentB_pk');
    if (!keyA) { const w = Wallet.createRandom(); keyA = w.privateKey; localStorage.setItem('0xgasless_agentA_pk', keyA); }
    if (!keyB) { const w = Wallet.createRandom(); keyB = w.privateKey; localStorage.setItem('0xgasless_agentB_pk', keyB); }
    setAgentAWallet(new Wallet(keyA, rpcProvider));
    setAgentBWallet(new Wallet(keyB, rpcProvider));
  }, [rpcProvider]);

  // ---- Refresh balances ----
  const refreshBalances = useCallback(async () => {
    const jobs: Promise<void>[] = [];
    if (ownerAddress) jobs.push(fetchBalances(rpcProvider, ownerAddress).then(setOwnerBal));
    if (agentAWallet) jobs.push(agentAWallet.getAddress().then(a => fetchBalances(rpcProvider, a)).then(setAgentABal));
    if (agentBWallet) jobs.push(agentBWallet.getAddress().then(a => fetchBalances(rpcProvider, a)).then(setAgentBBal));
    await Promise.allSettled(jobs);
  }, [rpcProvider, ownerAddress, agentAWallet, agentBWallet]);

  const refreshBalancesAfterTx = useCallback(async (txHash: string) => {
    if (!txHash) return;
    try {
      await rpcProvider.waitForTransaction(txHash, 1, 60_000);
      await new Promise(r => setTimeout(r, 2000));
      await refreshBalances();
    } catch { await refreshBalances(); }
  }, [rpcProvider, refreshBalances]);

  useEffect(() => {
    if (!initialized) return;
    refreshBalances();
    const id = setInterval(refreshBalances, 5000);
    return () => clearInterval(id);
  }, [initialized, refreshBalances]);

  // ---- Initialize ----
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!ready || !authenticated || !wallet || !agentAWallet || !agentBWallet || initialized) {
        console.log(`[Init Check] ready:${ready}, auth:${authenticated}, wallet:${!!wallet}, agentA:${!!agentAWallet}, agentB:${!!agentBWallet}, initialized:${initialized}`);
        return;
      }
      try {
        setInitError(null);

        console.log(`[Owner] Using wallet: ${wallet.address}`);

        // Create the custom ethers Signer adapter
        console.log(`[Owner] Creating OxGasEthersSigner adapter...`);
        const addr = wallet.address;
        const signer = new OxGasEthersSigner(client.auth, addr, rpcProvider);
        console.log(`[Owner] OxGasEthersSigner created successfully`);
        
        setOwnerSigner(signer);
        setOwnerAddress(addr);
        if (cancelled) { console.log(`[Init] Cancelled before agentA init`); return; }
        
        console.log(`[Init] Initializing Agent A with owner: ${addr}`);
        await agentA.initializeWithSigner(agentAWallet, rpcProvider, addr);
        console.log(`[Init] Agent A initialized successfully`);
        
        if (cancelled) { console.log(`[Init] Cancelled before agentB init`); return; }
        
        console.log(`[Init] Initializing Agent B with owner: ${addr}`);
        await agentB.initializeWithSigner(agentBWallet, rpcProvider, addr);
        console.log(`[Init] Agent B initialized successfully`);
        if (cancelled) return;
        console.log(`[Init] All agents initialized. Setting initialized=true`);
        setInitialized(true);
      } catch (e: any) { 
        console.error(`[Init] FATAL ERROR:`, e);
        setInitError(e.message || 'Unknown error'); 
      } finally {
        console.log(`[Init] Routine finished`);
      }
    }
    if (ready && authenticated && wallet && agentAWallet && agentBWallet && !initialized) init();
    return () => { cancelled = true; };
  }, [ready, authenticated, wallet, initialized, agentAWallet, agentBWallet]);

  // ---- Funding ----
  const fundAgent = useCallback(async (agentAddress: string, type: 'avax' | 'usdt', amount: string) => {
    if (!ownerSigner) return;
    setFundingInProgress(true);
    try {
      const signer = ownerSigner;
      if (type === 'avax') { const tx = await signer.sendTransaction({ to: agentAddress, value: parseEther(amount) }); await tx.wait(); }
      else { const token = new Contract(USDT_TOKEN_ADDRESS, TOKEN_ABI, signer); const tx = await token.transfer(agentAddress, parseUnits(amount, 6)); await tx.wait(); }
      await refreshBalances();
    } catch (e: any) { alert(`Funding failed: ${e.message}`); }
    finally { setFundingInProgress(false); }
  }, [ownerSigner, refreshBalances]);

  // ---- Payment detection ----
  const extractAmount = (text: string): number | null => {
    for (const p of [/(\d+\.?\d*)\s*usdt/i, /usdt[:\s]+(\d+\.?\d*)/i, /\$(\d+\.?\d*)/i, /payment[:\s]+(?:of\s+)?(\d+\.?\d*)/i, /(?:send|pay|transfer)\s+(\d+\.?\d*)/i]) {
      const m = text.match(p); if (m?.[1]) { const n = parseFloat(m[1]); if (!isNaN(n) && n > 0 && n <= 100) return n; }
    }
    return null;
  };

  const detectPaymentIntent = (message: string, history: Array<{ from: 'agentA' | 'agentB'; message: string }>): number | null => {
    const intentPatterns = [/(?:i'll|i will|i'm going to|let me)\s+(?:send|pay|transfer)/i, /sending\s+(?:you\s+)?(?:the\s+)?(?:payment|usdt|\d)/i, /great\s+work.*(?:send|pay)/i, /here(?:'s| is)\s+(?:the\s+)?(?:payment|your\s+payment)/i];
    if (!intentPatterns.some(p => p.test(message))) return null;
    let amount = extractAmount(message);
    if (amount) return amount;
    for (const msg of [...history].reverse().slice(0, 8)) { amount = extractAmount(msg.message); if (amount) return amount; }
    return null;
  };

  // ---- Conversation control ----
  const stopConversation = () => { conversationCancelledRef.current = true; conversationPausedRef.current = false; setIsRunning(false); setIsPaused(false); };
  const pauseConversation = () => { conversationPausedRef.current = true; setIsPaused(true); };
  const resumeConversation = () => { conversationPausedRef.current = false; setIsPaused(false); };

  // ---- Phase-managed conversation loop ----
  const startConversation = async () => {
    if (!agentA.state.registered) { await agentA.register(); await refreshBalances(); }
    if (!agentB.state.registered) { await agentB.register(); await refreshBalances(); }
    if (!openRouterKey) { alert('Set VITE_OPENROUTER_API_KEY in .env'); return; }

    conversationCancelledRef.current = false;
    setIsRunning(true);
    setIsPaused(false);

    const history: Array<{ from: 'agentA' | 'agentB'; message: string }> = [];
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const cancelled = () => conversationCancelledRef.current;
    const waitIfPaused = async () => { while (conversationPausedRef.current && !cancelled()) await delay(400); };

    // Budget = Agent A's current USDT balance (capped so AI doesn't overpromise)
    const budget = Math.min(Math.floor(Number(agentABal.usdt)), 15);

    // Tighter phase structure: networking(1), discovery(1), negotiation(2), delivery(2), payment(1)
    const phases: Array<{ name: string; exchanges: number }> = [
      { name: 'networking', exchanges: 1 },
      { name: 'discovery', exchanges: 1 },
      { name: 'negotiation', exchanges: 2 },
      { name: 'delivery', exchanges: 2 },
      { name: 'payment', exchanges: 1 },
    ];

    let turn = 0;
    const ctx = (phase: string) => ({ phase, turnNumber: ++turn, budget });

    // Helper: one exchange = A speaks, then B responds
    const exchange = async (phase: string): Promise<{ aMsg: AgentMessage; bMsg: AgentMessage } | null> => {
      await waitIfPaused();
      if (cancelled()) return null;
      const aMsg = await agentA.sendAIMessage('agentB', history, openRouterKey, ctx(phase));
      history.push({ from: 'agentA', message: aMsg.message });
      await delay(2000);

      if (cancelled()) return null;
      await waitIfPaused();
      const bMsg = await agentB.sendAIMessage('agentA', history, openRouterKey, ctx(phase));
      history.push({ from: 'agentB', message: bMsg.message });
      await delay(2000);
      return { aMsg, bMsg };
    };

    // Run through conversation phases
    for (const phase of phases) {
      if (cancelled()) break;

      for (let ex = 0; ex < phase.exchanges; ex++) {
        if (cancelled()) break;

        // Payment phase is special — A speaks, then we execute payment before B responds
        if (phase.name === 'payment') {
          await waitIfPaused();
          if (cancelled()) break;

          const aMsg = await agentA.sendAIMessage('agentB', history, openRouterKey, ctx('payment'));
          history.push({ from: 'agentA', message: aMsg.message });
          await delay(1500);

          // Detect payment amount from Agent A's message
          const payAmount = detectPaymentIntent(aMsg.message, history);
          const cappedAmount = payAmount
            ? Math.min(payAmount, Math.floor(Number(agentABal.usdt)))
            : Math.min(budget, Math.floor(Number(agentABal.usdt)));

          if (cappedAmount > 0 && agentB.state.address) {
            // Show "Initiating payment..." status pill
            agentA.addMessage({
              from: 'agentA', to: 'agentB',
              message: `Initiating payment of ${cappedAmount} USDT…`,
              type: 'payment', status: 'pending',
            });

            try {
              const txHash = await agentA.sendPayment(
                agentB.state.address,
                (cappedAmount * 1e6).toString()
              );
              if (txHash) {
                await refreshBalancesAfterTx(txHash);

                // Freelancer thanks
                await delay(1500);
                if (!cancelled()) {
                  const thankMsg = await agentB.sendAIMessage('agentA', history, openRouterKey, ctx('payment'));
                  history.push({ from: 'agentB', message: thankMsg.message });
                }

                // Employer closes
                await delay(1500);
                if (!cancelled()) {
                  const closeMsg = await agentA.sendAIMessage('agentB', history, openRouterKey, ctx('closing'));
                  history.push({ from: 'agentA', message: closeMsg.message });
                }
              }
            } catch (e: any) {
              console.error('[Payment] Failed:', e.message);
            }
          }

          // Done — conversation complete
          setIsRunning(false);
          setIsPaused(false);
          conversationCancelledRef.current = false;
          conversationPausedRef.current = false;
          return;
        }

        // Normal exchange for all other phases
        const result = await exchange(phase.name);
        if (!result || cancelled()) break;
      }
    }

    setIsRunning(false);
    setIsPaused(false);
    conversationCancelledRef.current = false;
    conversationPausedRef.current = false;
  };

  // ---- Auto-scroll ----
  const msgCount = agentA.messages.length + agentB.messages.length;
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgCount]);

  // ---- Collect data ----
  const allMessages = [...agentA.messages, ...agentB.messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const allTransactions = [...agentA.transactions, ...agentB.transactions].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const agentAAddr = agentA.state.address;
  const agentBAddr = agentB.state.address;
  // Owner address is fetched from Privy wallet dynamically — always the real connected wallet

  // ================================================================
  //  RENDER
  // ================================================================

  if (!ready) return (
    <div className="h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
    </div>
  );

  if (!authenticated) return (
    <div className="h-screen bg-background flex flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Bot className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Agent&thinsp;x&thinsp;Agent</h1>
        <p className="text-sm text-muted-foreground max-w-xs text-center">Autonomous AI agents that network, negotiate jobs, and settle payments onchain.</p>
      </div>
      <Button onClick={login} size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-8">
        Get started
      </Button>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="font-normal text-[11px]">ERC-8004</Badge>
        <Badge variant="outline" className="font-normal text-[11px]">x402 Protocol</Badge>
        <Badge variant="outline" className="font-normal text-[11px]">Avalanche Fuji</Badge>
      </div>
    </div>
  );

  // ---- Main layout: sidebar + chat ----
  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">

      {/* ====== Top bar ====== */}
      <header className="shrink-0 h-14 flex items-center justify-between px-5 bg-background">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">Agent&thinsp;x&thinsp;Agent</span>
          <Badge variant="outline" className="ml-1 text-[10px] font-normal hidden sm:inline-flex">Fuji Testnet</Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {ownerAddress && (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-muted-foreground">Owner:</span>
              <CopyAddress address={ownerAddress} />
            </div>
          )}
          {initialized && (
            <span className="font-medium text-foreground">{ownerBal.avax} AVAX · {ownerBal.usdt} USDT</span>
          )}
          {initialized && Number(ownerBal.avax) < 0.05 && (
            <a href="https://faucet.avalanche.org/" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
              Faucet <ExternalLink className="inline h-3 w-3" />
            </a>
          )}
        </div>
      </header>

      {/* ====== Body: Sidebar + Chat ====== */}
      <div className="flex-1 flex overflow-hidden">

        {/* ---- Sidebar ---- */}
        <aside className="w-[320px] shrink-0 flex flex-col overflow-y-auto bg-muted/30 hidden lg:flex">
          <div className="p-4 space-y-4">

            {/* Alerts (compact) */}
            {!initialized && authenticated && wallet && (
              <div className={`rounded-lg p-3 text-xs ${initError ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  {initError ? initError : 'Initializing agents…'}
                </div>
              </div>
            )}
            {!openRouterKey && (
              <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                Missing VITE_OPENROUTER_API_KEY
              </div>
            )}

            {/* Agent A — Employer */}
            <AgentCard
              label="Employer"
              sublabel="Startup founder · pays for work"
              address={agentAAddr}
              balance={agentABal}
              registered={agentA.state.registered}
              agentId={agentA.state.id}
              initialized={initialized}
              color="violet"
              fundActions={[
                { label: '0.05 AVAX', disabled: fundingInProgress || Number(ownerBal.avax) < 0.02, onClick: () => fundAgent(agentAAddr, 'avax', '0.05') },
                { label: '20 USDT', disabled: fundingInProgress || Number(ownerBal.usdt) < 1, onClick: () => fundAgent(agentAAddr, 'usdt', '20') },
              ]}
              withdrawActions={[
                { label: 'USDT', disabled: Number(agentABal.usdt) === 0, onClick: async () => { const tx = await agentA.transferFundsToOwner(ownerAddress, USDT_TOKEN_ADDRESS); if (tx) await refreshBalancesAfterTx(tx); } },
                { label: 'AVAX', disabled: Number(agentABal.avax) < 0.001, onClick: async () => { const tx = await agentA.transferFundsToOwner(ownerAddress); if (tx) await refreshBalancesAfterTx(tx); } },
              ]}
              onRegister={async () => { await agentA.register(); await refreshBalances(); }}
            />

            {/* Agent B — Freelancer */}
            <AgentCard
              label="Freelancer"
              sublabel="Researcher · earns USDT for work"
              address={agentBAddr}
              balance={agentBBal}
              registered={agentB.state.registered}
              agentId={agentB.state.id}
              initialized={initialized}
              color="emerald"
              fundActions={[
                { label: '0.05 AVAX', disabled: fundingInProgress || Number(ownerBal.avax) < 0.02, onClick: () => fundAgent(agentBAddr, 'avax', '0.05') },
                { label: '5 USDT', disabled: fundingInProgress || Number(ownerBal.usdt) < 1, onClick: () => fundAgent(agentBAddr, 'usdt', '5') },
              ]}
              withdrawActions={[
                { label: 'USDT', disabled: Number(agentBBal.usdt) === 0, onClick: async () => { const tx = await agentB.transferFundsToOwner(ownerAddress, USDT_TOKEN_ADDRESS); if (tx) await refreshBalancesAfterTx(tx); } },
                { label: 'AVAX', disabled: Number(agentBBal.avax) < 0.001, onClick: async () => { const tx = await agentB.transferFundsToOwner(ownerAddress); if (tx) await refreshBalancesAfterTx(tx); } },
              ]}
              onRegister={async () => { await agentB.register(); await refreshBalances(); }}
            />

            {/* Transaction log */}
            {allTransactions.length > 0 && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Transactions</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {allTransactions.map(tx => (
                    <div key={tx.id} className={`rounded-md px-2.5 py-1.5 text-[11px] border ${tx.status === 'success' ? 'border-green-200 bg-green-50/60' : tx.status === 'failed' ? 'border-red-200 bg-red-50/60' : 'border-border bg-muted/40'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium uppercase">{tx.type}</span>
                        {tx.status === 'success' && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                        {tx.status === 'failed' && <XCircle className="h-3 w-3 text-destructive" />}
                        {tx.status === 'pending' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      </div>
                      {tx.txHash && (
                        <a href={`https://testnet.snowtrace.io/tx/${tx.txHash}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {tx.txHash.slice(0, 14)}… <ExternalLink className="inline h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ---- Chat area ---- */}
        <main className="flex-1 flex flex-col min-w-0">

          {/* Pre-flight banners (inline, compact) */}
          {initialized && (Number(agentABal.avax) < 0.01 || Number(agentBBal.avax) < 0.01) && (
            <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Fund each agent with AVAX using the sidebar buttons before starting.
            </div>
          )}
          {initialized && Number(agentABal.usdt) === 0 && Number(agentABal.avax) >= 0.01 && Number(agentBBal.avax) >= 0.01 && (
            <div className="px-5 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Employer (Agent A) needs USDT to pay the freelancer. Fund via sidebar.
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 bg-gray-100">
            <div className="max-w-2xl mx-auto space-y-4">

              {allMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center gap-3">
                  <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center">
                    <Bot className="h-8 w-8 text-primary/40" />
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Fund agents in the sidebar, then start a conversation to watch them network, negotiate a job, and settle payment onchain.
                  </p>
                </div>
              )}

              {allMessages.map((msg, idx) => {
                const isA = msg.from === 'agentA';
                const isPayment = msg.type === 'payment';

                // Payment status pills (centered)
                if (isPayment && msg.status === 'success') {
                  return (
                    <div key={msg.id ?? idx} className="flex justify-center">
                      <div className="inline-flex items-center gap-2 rounded-full bg-green-50 border border-green-200 px-4 py-2 text-xs text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span className="font-medium">Payment sent</span>
                        {msg.txHash && (
                          <a
                            href={`https://testnet.snowtrace.io/tx/${msg.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-green-600 hover:text-green-800 underline underline-offset-2"
                          >
                            {msg.txHash.slice(0, 10)}… <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <span className="opacity-50">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  );
                }
                if (isPayment && msg.status === 'failed') {
                  return (
                    <div key={msg.id ?? idx} className="flex justify-center">
                      <div className="inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-200 px-4 py-2 text-xs text-red-700">
                        <XCircle className="h-3.5 w-3.5" />
                        <span className="font-medium">Payment failed</span>
                        <span className="opacity-70">{msg.message.replace(/^❌\s*/, '').slice(0, 60)}</span>
                      </div>
                    </div>
                  );
                }
                if (isPayment && msg.status === 'pending') {
                  // Hide the "Initiating payment" pill once a success/failure message exists
                  const hasOutcome = allMessages.some(m => m.type === 'payment' && (m.status === 'success' || m.status === 'failed') && m.timestamp >= msg.timestamp);
                  if (hasOutcome) return null;
                  return (
                    <div key={msg.id ?? idx} className="flex justify-center">
                      <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 border border-violet-200 px-4 py-2 text-xs text-violet-700">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="font-medium">{msg.message}</span>
                      </div>
                    </div>
                  );
                }

                // Chat bubble
                return (
                  <div key={msg.id ?? idx} className={`flex ${isA ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] ${isA ? 'order-1' : ''}`}>
                      {/* Agent label */}
                      <div className={`flex items-center gap-1.5 mb-1 ${isA ? 'justify-end' : ''}`}>
                        <CircleDot className={`h-3 w-3 ${isA ? 'text-violet-500' : 'text-emerald-500'}`} />
                        <span className={`text-[11px] font-medium ${isA ? 'text-violet-600' : 'text-emerald-600'}`}>
                          {isA ? 'Employer' : 'Freelancer'}
                        </span>
                      </div>
                      {/* Bubble */}
                      <div className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                        isA
                          ? 'bg-violet-50 text-foreground rounded-tr-md'
                          : 'bg-muted text-foreground rounded-tl-md'
                      }`}>
                        {msg.message}
                      </div>
                      {/* Meta */}
                      <div className={`flex items-center gap-2 mt-1 ${isA ? 'justify-end' : ''}`}>
                        <span className="text-[10px] text-muted-foreground/60">
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.txHash && (
                          <a href={`https://testnet.snowtrace.io/tx/${msg.txHash}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary/60 hover:text-primary font-mono">
                            {msg.txHash.slice(0, 8)}… <ExternalLink className="inline h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div ref={chatEndRef} />
            </div>
          </div>

          {/* ====== Bottom control bar ====== */}
          <div className="shrink-0 px-5 py-2 mb-2 ">
            <div className="max-w-2xl mx-auto flex items-center gap-2">
              {!isRunning ? (
                <Button
                  onClick={startConversation}
                  disabled={!initialized || !openRouterKey || Number(agentABal.avax) < 0.005 || Number(agentBBal.avax) < 0.005 || Number(agentABal.usdt) === 0}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl py-1 px-5 text-sm"
                >
                  <Rocket className="h-4 w-4 mr-1.5" />
                  Start conversation
                </Button>
              ) : (
                <>
                  {isPaused ? (
                    <Button onClick={resumeConversation} className="bg-green-600 text-white hover:bg-green-700 rounded-xl h-10 px-4 text-sm">
                      <Play className="h-4 w-4 mr-1" /> Resume
                    </Button>
                  ) : (
                    <Button onClick={pauseConversation} variant="outline" className="rounded-xl h-10 px-4 text-sm border-amber-300 text-amber-600 hover:bg-amber-50">
                      <Pause className="h-4 w-4 mr-1" /> Pause
                    </Button>
                  )}
                  <Button onClick={stopConversation} variant="outline" className="rounded-xl h-10 px-4 text-sm border-red-300 text-red-500 hover:bg-red-50">
                    <Square className="h-4 w-4 mr-1" /> Stop
                  </Button>
                </>
              )}

              {isRunning && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  {isPaused ? 'Paused' : 'Agents talking…'}
                </div>
              )}

              {!isRunning && initialized && (
                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="ghost" size="sm" onClick={async () => { await agentA.register(); await refreshBalances(); }} disabled={agentA.state.registered} className="text-xs border border-primary py-1 px-2 rounded-lg">
                    {agentA.state.registered ? <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" /> : null} Register Agent A
                  </Button>
                  <Button variant="ghost" size="sm" onClick={async () => { await agentB.register(); await refreshBalances(); }} disabled={agentB.state.registered} className="text-xs border border-primary py-1 px-2 rounded-lg">
                    {agentB.state.registered ? <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" /> : null} Register Agent B
                  </Button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ================================================================
//  Sidebar Agent Card
// ================================================================

function AgentCard({ label, sublabel, address, balance, registered, agentId, initialized, color, fundActions, withdrawActions, onRegister }: {
  label: string;
  sublabel: string;
  address: string;
  balance: { avax: string; usdt: string };
  registered: boolean;
  agentId: string | null;
  initialized: boolean;
  color: 'violet' | 'emerald';
  fundActions: Array<{ label: string; disabled: boolean; onClick: () => void }>;
  withdrawActions: Array<{ label: string; disabled: boolean; onClick: () => Promise<void> }>;
  onRegister: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const dot = color === 'violet' ? 'bg-violet-500' : 'bg-emerald-500';
  const ring = color === 'violet' ? 'ring-violet-200' : 'ring-emerald-200';

  return (
    <div className="rounded-xl border bg-background p-3 space-y-2.5">
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between group">
        <div className="flex items-center gap-2.5">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ring-2 ${ring} bg-background`}>
            <div className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          </div>
          <div className="text-left">
            <p className="text-[13px] font-semibold leading-tight">{label}</p>
            <p className="text-[10px] text-muted-foreground">{sublabel}</p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Always visible: balance + status */}
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5">
          {address ? (
            <CopyAddress address={address} />
          ) : (
            <span className="text-muted-foreground">Not initialized</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {registered ? (
            <span className="inline-flex items-center gap-0.5 text-green-600 font-medium">
              <CheckCircle2 className="h-3 w-3" /> ID:{agentId}
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
              <XCircle className="h-3 w-3" /> Unregistered
            </span>
          )}
        </div>
      </div>

      {initialized && (
        <div className="flex items-center gap-3 text-[11px] font-medium">
          <span>{balance.avax} AVAX</span>
          <span className="text-muted-foreground">·</span>
          <span>{balance.usdt} USDT</span>
        </div>
      )}

      {/* Expanded: actions */}
      {expanded && initialized && address && (
        <div className="space-y-2 pt-1 border-t">
          <div className="flex flex-wrap gap-1.5">
            {fundActions.map(a => (
              <Button key={a.label} size="sm" variant="outline" disabled={a.disabled} onClick={a.onClick} className="text-[10px] h-7 rounded-lg px-2.5">
                <Send className="h-3 w-3 mr-1" /> {a.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {withdrawActions.map(a => (
              <Button key={a.label} size="sm" variant="ghost" disabled={a.disabled} onClick={a.onClick} className="text-[10px] h-7 rounded-lg px-2.5 text-muted-foreground">
                <ArrowUpRight className="h-3 w-3 mr-1" /> Withdraw {a.label}
              </Button>
            ))}
          </div>
          {!registered && (
            <Button size="sm" variant="outline" onClick={onRegister} className="text-[10px] h-7 rounded-lg w-full">
              Register on ERC-8004
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================
//  Copy-to-clipboard address chip
// ================================================================

function CopyAddress({ address, label }: { address: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      title={address}
    >
      {label || truncAddr(address)}
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3 opacity-40 hover:opacity-100" />
      )}
    </button>
  );
}

export default App;
