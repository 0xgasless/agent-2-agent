export interface AgentMessage {
  id: string;
  from: 'agentA' | 'agentB';
  to: 'agentA' | 'agentB';
  message: string;
  timestamp: Date;
  type: 'message' | 'transaction' | 'payment' | 'feedback';
  txHash?: string;
  status?: 'pending' | 'success' | 'failed';
}

export interface AgentState {
  id: string | null;
  domain: string | null;
  address: string;
  registered: boolean;
  balance: string;
  reputation: {
    totalFeedback: number;
    averageScore: number;
  };
  isValidator: boolean;
  stakedAmount: string;
}

export interface TransactionLog {
  id: string;
  type: 'register' | 'payment' | 'feedback' | 'stake' | 'validation';
  from: 'agentA' | 'agentB';
  to?: 'agentA' | 'agentB';
  txHash: string;
  status: 'pending' | 'success' | 'failed';
  timestamp: Date;
  details: string;
}

