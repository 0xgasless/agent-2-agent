/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_A_PRIVATE_KEY: string;
  readonly VITE_AGENT_B_PRIVATE_KEY: string;
  readonly VITE_OPENROUTER_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

