import { create } from 'zustand';
import type { NetworkId } from '../types/network';

interface NetworkState {
  network: NetworkId;
  setNetwork: (network: NetworkId) => void;
}

/**
 * UI上部の Mainnet/Testnet バッジと、全画面のデータ取得ロジックがここを参照する。
 * ネットワークが切り替わったら、Asset/Transaction系のstoreは
 * 「使い回さず作り直す」方針(networkごとにキーをnamespace化しているため、
 * 実データはconnectionFactory / networkConfigのnamespacedKeyで自然に分離される)。
 */
export const useNetworkStore = create<NetworkState>((set) => ({
  network: 'mainnet',
  setNetwork: (network) => set({ network }),
}));
