import { useState } from 'react';
import { useNetworkStore } from './core/stores/networkStore';
import { useWalletStore } from './core/stores/walletStore';
import Onboarding from './ui/pages/Onboarding/Onboarding';
import Dashboard from './ui/pages/Dashboard/Dashboard';
import Send from './ui/pages/Send/Send';
import BatchSend from './ui/pages/BatchSend/BatchSend';
import MetadataPage from './ui/pages/Metadata/Metadata';
import MultisigPage from './ui/pages/Multisig/Multisig';
import RestrictionPage from './ui/pages/Restriction/Restriction';
import ExplorerPage from './ui/pages/Explorer/Explorer';
import type { Asset } from './core/types/asset';
import './ui/styles/global.css';

type Screen = 'dashboard' | 'send' | 'batch-send' | 'metadata' | 'multisig' | 'restriction' | 'explorer';

export default function App() {
  const { network, setNetwork } = useNetworkStore();
  const account = useWalletStore((s) => s.account);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  function openMetadata(asset: Asset) {
    setSelectedAsset(asset);
    setScreen('metadata');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">Symbol UX Wallet</span>
        <div className="network-toggle">
          <button data-active={network === 'mainnet'} onClick={() => setNetwork('mainnet')}>
            <span className="dot mainnet" />
            Mainnet
          </button>
          <button data-active={network === 'testnet'} onClick={() => setNetwork('testnet')}>
            <span className="dot testnet" />
            Testnet
          </button>
        </div>
      </header>
      <main className="content">
        {!account ? (
          <Onboarding />
        ) : screen === 'send' ? (
          <Send onBack={() => setScreen('dashboard')} />
        ) : screen === 'batch-send' ? (
          <BatchSend onBack={() => setScreen('dashboard')} />
        ) : screen === 'metadata' && selectedAsset ? (
          <MetadataPage
            asset={selectedAsset}
            onBack={() => setScreen('dashboard')}
            onOpenRestriction={() => setScreen('restriction')}
          />
        ) : screen === 'restriction' && selectedAsset ? (
          <RestrictionPage asset={selectedAsset} onBack={() => setScreen('metadata')} />
        ) : screen === 'multisig' ? (
          <MultisigPage onBack={() => setScreen('dashboard')} />
        ) : screen === 'explorer' ? (
          <ExplorerPage onBack={() => setScreen('dashboard')} />
        ) : (
          <Dashboard
            onSend={() => setScreen('send')}
            onBatchSend={() => setScreen('batch-send')}
            onOpenMetadata={openMetadata}
            onOpenMultisig={() => setScreen('multisig')}
            onOpenExplorer={() => setScreen('explorer')}
          />
        )}
      </main>
    </div>
  );
}
