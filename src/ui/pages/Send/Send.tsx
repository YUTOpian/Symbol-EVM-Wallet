import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useNetworkStore } from '../../../core/stores/networkStore';
import { useWalletStore } from '../../../core/stores/walletStore';
import { getAllAssets } from '../../../adapters/solana/asset';
import { buildAndSendTransaction } from '../../../adapters/solana/tx/send';
import { getNetworkConfig } from '../../../adapters/solana/network/networkConfig';
import { looksLikeNamespaceInput, resolveNamespace } from '../../../adapters/solana/namespace/nameService';
import type { Asset } from '../../../core/types/asset';

type Step = 'form' | 'confirm' | 'sending' | 'done';

interface Props {
  onBack: () => void;
}

export default function Send({ onBack }: Props) {
  const network = useNetworkStore((s) => s.network);
  const account = useWalletStore((s) => s.account);
  const provider = useWalletStore((s) => s.provider);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);

  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [to, setTo] = useState('');
  const [resolvedTo, setResolvedTo] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    getAllAssets(account.address, network)
      .then((list) => {
        // NFTは今回のSend画面では一旦除外(数量指定の概念が異なるため別UIで扱う)
        const sendable = list.filter((a) => a.type !== 'nft');
        setAssets(sendable);
        if (sendable.length > 0) setSelectedAssetId(sendable[0].id);
      })
      .catch(() => {
        // 一覧取得に失敗しても送金フォーム自体は表示できるようにする
      });
  }, [account, network]);

  // Toの入力が変わったら解決結果をリセットする(古い解決結果のまま送信してしまうことを防ぐ)
  useEffect(() => {
    setResolvedTo(null);
  }, [to]);

  if (!account || !provider) return null;

  const isNamespace = looksLikeNamespaceInput(to);
  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  async function validateAndGoConfirm() {
    setError(null);
    if (!selectedAsset) {
      setError('送金するAssetを選択してください');
      return;
    }

    let destination: string;
    if (isNamespace) {
      setResolving(true);
      try {
        const record = await resolveNamespace(to, network);
        destination = record.resolvedAddress;
        setResolvedTo(destination);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Namespaceを解決できませんでした');
        return;
      } finally {
        setResolving(false);
      }
    } else {
      destination = to.trim();
      try {
        // eslint-disable-next-line no-new
        new PublicKey(destination);
      } catch {
        setError('送金先Addressが正しくありません');
        return;
      }
      setResolvedTo(destination);
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('金額が正しくありません');
      return;
    }
    if (amt > Number(selectedAsset.balance)) {
      setError('残高が不足しています');
      return;
    }
    setStep('confirm');
  }

  async function executeSend() {
    if (!selectedAsset || !account || !provider || !resolvedTo) return;
    setStep('sending');
    setError(null);
    try {
      const sig = await buildAndSendTransaction(
        {
          asset: selectedAsset,
          fromAddress: account.address,
          toAddress: resolvedTo,
          amount,
          memo,
          network,
        },
        provider,
      );
      setSignature(sig);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : '送信に失敗しました');
      setStep('confirm');
    }
  }

  if (step === 'done' && signature) {
    const explorer = getNetworkConfig(network).explorer;
    return (
      <div>
        <h1 className="page-title">送信しました</h1>
        <p className="page-sub">Transactionがネットワークに承認されました。</p>
        <div className="account-card">
          <div className="name">Signature</div>
          <div className="address">{signature}</div>
        </div>
        <a
          className="btn btn-secondary"
          style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: 10 }}
          href={`${explorer}/tx/${signature}${network === 'testnet' ? '?cluster=testnet' : ''}`}
          target="_blank"
          rel="noreferrer"
        >
          Explorerで確認
        </a>
        <button className="btn btn-primary" onClick={onBack}>
          Dashboardに戻る
        </button>
      </div>
    );
  }

  if (step === 'confirm' || step === 'sending') {
    return (
      <div>
        <button className="back-link" onClick={() => setStep('form')} disabled={step === 'sending'}>
          ← 内容を修正
        </button>
        <h1 className="page-title">送信内容の確認</h1>
        <p className="page-sub">内容をよく確認してから送信してください。一度送信すると取り消せません。</p>

        <div className="account-card">
          <div className="name">To</div>
          <div className="address">{to.trim()}</div>
        </div>
        {isNamespace && resolvedTo && (
          <div className="account-card">
            <div className="name">Resolved Address</div>
            <div className="address">{resolvedTo}</div>
          </div>
        )}
        <div className="account-card">
          <div className="name">Asset</div>
          <div className="address">
            {selectedAsset?.name} ({selectedAsset?.symbol})
          </div>
        </div>
        <div className="account-card">
          <div className="name">Amount</div>
          <div className="address">
            {amount} {selectedAsset?.symbol}
          </div>
        </div>
        {memo.trim() && (
          <div className="account-card">
            <div className="name">Memo</div>
            <div className="address">{memo.trim()}</div>
          </div>
        )}
        <div className="account-card">
          <div className="name">Network</div>
          <div className="address">{network}</div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <button className="btn btn-primary" disabled={step === 'sending'} onClick={executeSend}>
          {step === 'sending' ? '送信中…' : 'この内容で送信する'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <button className="back-link" onClick={onBack}>
        ← 戻る
      </button>
      <h1 className="page-title">Send</h1>

      <div className="field">
        <label>To</label>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Address または @namespace / name.sol"
        />
        {isNamespace && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Namespaceとして解決します(Solana Name Service経由。Mainnetのみ対応の可能性があります)。
          </p>
        )}
      </div>

      <div className="field">
        <label>Asset</label>
        <select
          value={selectedAssetId}
          onChange={(e) => setSelectedAssetId(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 12px',
            color: 'var(--text)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
          }}
        >
          {assets.length === 0 && <option value="">送金可能なAssetがありません</option>}
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.symbol} — {a.balance}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Amount</label>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1.0" />
      </div>

      <div className="field">
        <label>Message (Optional)</label>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="" />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <button className="btn btn-primary" disabled={resolving} onClick={validateAndGoConfirm}>
        {resolving ? 'Namespaceを解決中…' : '次へ(内容確認)'}
      </button>
    </div>
  );
}
