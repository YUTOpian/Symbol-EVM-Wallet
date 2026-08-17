import { create } from 'zustand';
import type { Account } from '../types/account';
import type { WalletProvider } from '../adapters/ChainAdapter';

interface WalletState {
  account: Account | null;
  provider: WalletProvider | null;
  setConnected: (account: Account, provider: WalletProvider) => void;
  clear: () => void;
}

/**
 * UI は account の有無だけを見て Onboarding / Dashboard を出し分ける。
 * provider が LocalWalletProvider か WalletStandardProvider かは
 * ここでは区別しない(account.source / account.providerName に表現済み)。
 */
export const useWalletStore = create<WalletState>((set) => ({
  account: null,
  provider: null,
  setConnected: (account, provider) => set({ account, provider }),
  clear: () => set({ account: null, provider: null }),
}));
