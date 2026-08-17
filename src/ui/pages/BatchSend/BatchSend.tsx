import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useNetworkStore } from '../../../core/stores/networkStore';
import { useWalletStore } from '../../../core/stores/walletStore';
import { getAllAssets } from '../../../adapters/solana/asset';
import { planBatchGroups, executeBatch, type BatchGroup } from '../../../adapters/solana/tx/batch';
import { getNetworkConfig } from '../../../adapters/solana/network/networkConfig';
import type { Asset } from '../../../core/types/asset';

interface Row {
  key: number;
  assetId: string;
  to: string;
  amount: string;
}

type Step = 'form' | 'confirm' | 'sending' | 'done';

interface Props {
  onBack: () => void;
}

let rowKeySeq = 0;
function newRow(defaultAssetId: string): Row {
  return { key: rowKeySeq++, assetId: defaultAssetId, to: '', amount: '' };
}

export default function BatchSend({ onBack }: Props) {
  const network = useNetworkStore((s) => s.network);
  const account = useWalletStore((s) => s.account);
  const provider = useWalletStore((s) => s.provider);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<BatchGroup[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [signatures, setSignatures] = useState<string[]>([]);

  useEffect(() => {
    if (!account) return;
    getAllAssets(account.address, network)
      .then((list) => {
        const sendable = list.filter((a) => a.type !== 'nft');
        setAssets(sendable);
        if (sendable.length > 0) setRows([newRow(sendable[0].id)]);
      })
      .catch(() => {});
  }, [account, network]);

  if (!account || !provider) return null;
  const acc = account;
  const walletProvider = provider;

  function addRow() {
    setRows((r) => [...r, newRow(assets[0]?.id ?? '')]);
  }

  function removeRow(key: number) {
    setRows((r) => r.filter((row) => row.key !== key));
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function goConfirm() {
    setError(null);
    if (rows.length === 0) {
      setError('送金項目を1件以上追加してください');
      return;
    }
    for (const [i, row] of rows.entries()) {
      const asset = assets.find((a) => a.id === row.assetId);
      if (!asset) {
        setError(`${i + 1}行目: Assetを選択してください`);
        return;
      }
      try {
        // eslint-disable-next-line no-new
        new PublicKey(row.to.trim());
      } catch {
        setError(`${i + 1}行目: 送金先Addressが正しくありません`);
        return;
      }
      const amt = Number(row.amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        setError(`${i + 1}行目: 金額が正しくありません`);
        return;
      }
    }

    try {
      const items = rows.map((row) => ({
        asset: assets.find((a) => a.id === row.assetId)!,
        toAddress: row.to.trim(),
        amount: row.amount,
      }));
      const planned = await planBatchGroups(items, acc.address);
      setGroups(planned);
      setStep('confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'プランの作成に失敗しました');
    }
  }

  async function doExecute() {
    setStep('sending');
    setError(null);
    setProgress({ done: 0, total: groups.length });
    try {
      const results = await executeBatch(groups, acc.address, network, walletProvider, (done, total) =>
        setProgress({ done, total }),
      );
      setSignatures(results.map((r) => r.signature));
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : '送信に失敗しました(一部が既に確定している可能性があります)');
      setStep('confirm');
    }
  }

  if (step === 'done') {
    const explorer = getNetworkConfig(network).explorer;
    return (
      <div>
        <h1 className="page-title">Batch Send 完了</h1>
        <p className="page-sub">{signatures.length}件のTransactionが確定しました。</p>
        {signatures.map((sig, i) => (
          <a
            key={sig}
            className="btn btn-secondary"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: 8 }}
            href={`${explorer}/tx/${sig}${network === 'testnet' ? '?cluster=testnet' : ''}`}
            target="_blank"
            rel="noreferrer"
          >
            Transaction {i + 1} をExplorerで確認
          </a>
        ))}
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onBack}>
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
        <h1 className="page-title">Batch Send 確認</h1>
        <p className="page-sub">
          {rows.length}件の送金を{groups.length}件のTransactionにまとめて実行します。
        </p>
        {groups.length > 1 && (
          <div className="warning-banner">
            サイズ上限のため複数Transactionに分割されます。グループ間の原子性は保証されません(先のグループが確定した後、後のグループが失敗する可能性があります)。
          </div>
        )}

        {groups.map((group, gi) => (
          <div key={gi} className="account-card">
            <div className="name">Transaction {gi + 1}</div>
            {group.itemIndexes.map((idx) => {
              const row = rows[idx];
              const asset = assets.find((a) => a.id === row.assetId);
              return (
                <div key={idx} className="address" style={{ marginTop: 4 }}>
                  {idx + 1}. {row.amount} {asset?.symbol} → {row.to.trim()}
                </div>
              );
            })}
          </div>
        ))}

        {error && <div className="error-banner">{error}</div>}
        {progress && step === 'sending' && (
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            送信中… {progress.done} / {progress.total}
          </p>
        )}

        <button className="btn btn-primary" disabled={step === 'sending'} onClick={doExecute}>
          {step === 'sending' ? '送信中…' : 'Execute All'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <button className="back-link" onClick={onBack}>
        ← 戻る
      </button>
      <h1 className="page-title">Batch Send</h1>
      <p className="page-sub">
        複数の送金をまとめて実行します。可能な範囲で1つのTransactionにまとめ、上限を超える場合のみ分割します。
      </p>

      {rows.map((row, i) => (
        <div key={row.key} className="account-card">
          <div className="name">{i + 1}.</div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Asset</label>
            <select
              value={row.assetId}
              onChange={(e) => updateRow(row.key, { assetId: e.target.value })}
              style={{
                width: '100%',
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 12px',
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
              }}
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol} — {a.balance}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>To</label>
            <input value={row.to} onChange={(e) => updateRow(row.key, { to: e.target.value })} placeholder="Address" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Amount</label>
            <input
              value={row.amount}
              onChange={(e) => updateRow(row.key, { amount: e.target.value })}
              placeholder="1.0"
            />
          </div>
          {rows.length > 1 && (
            <button className="btn-link" onClick={() => removeRow(row.key)}>
              この行を削除
            </button>
          )}
        </div>
      ))}

      <button className="btn btn-secondary" style={{ marginBottom: 16 }} onClick={addRow}>
        + 送金項目を追加
      </button>

      {error && <div className="error-banner">{error}</div>}

      <button className="btn btn-primary" onClick={goConfirm}>
        次へ(内容確認)
      </button>
    </div>
  );
}
