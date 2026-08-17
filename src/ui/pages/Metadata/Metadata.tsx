import { useEffect, useState } from 'react';
import { useNetworkStore } from '../../../core/stores/networkStore';
import { useWalletStore } from '../../../core/stores/walletStore';
import {
  getAssetMetadataEntries,
  setMetadataField,
  removeMetadataField,
  type TokenMetadataInfo,
} from '../../../adapters/solana/metadata/tokenMetadata';
import type { Asset } from '../../../core/types/asset';

interface Props {
  asset: Asset;
  onBack: () => void;
  onOpenRestriction: () => void;
}

export default function Metadata({ asset, onBack, onOpenRestriction }: Props) {
  const network = useNetworkStore((s) => s.network);
  const account = useWalletStore((s) => s.account);
  const provider = useWalletStore((s) => s.provider);

  const [info, setInfo] = useState<TokenMetadataInfo | null | undefined>(undefined); // undefined = 読み込み中
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const isToken2022 = asset.tokenProgram === 'token-2022';

  async function load() {
    if (!asset.mint) return;
    setError(null);
    try {
      const result = await getAssetMetadataEntries(asset.mint, network);
      setInfo(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Metadataの取得に失敗しました');
      setInfo(null);
    }
  }

  useEffect(() => {
    if (!isToken2022 || !asset.mint) {
      setInfo(null);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.mint, network]);

  if (!account || !provider) return null;
  const walletProvider = provider;

  const canEdit = !!info?.updateAuthority && info.updateAuthority === account.address;

  async function handleSave() {
    if (!asset.mint || !info?.updateAuthority) return;
    if (!newKey.trim()) {
      setError('Keyを入力してください');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setMetadataField(asset.mint, info.updateAuthority, newKey.trim(), newValue, network, walletProvider);
      setNewKey('');
      setNewValue('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(key: string) {
    if (!asset.mint || !info?.updateAuthority) return;
    setBusy(true);
    setError(null);
    try {
      await removeMetadataField(asset.mint, info.updateAuthority, key, network, walletProvider);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="back-link" onClick={onBack}>
        ← 戻る
      </button>
      <h1 className="page-title">Metadata</h1>
      <p className="page-sub">
        {asset.name} ({asset.symbol}) のKey/Value Metadataです。Token-2022のMetadata Extensionを利用しています。
      </p>

      {!isToken2022 && (
        <div className="warning-banner">
          このAssetはToken-2022ではないため、Metadata機能は利用できません(SPL Token旧プログラムは非対応)。
        </div>
      )}

      {isToken2022 && (
        <button className="btn-link" style={{ paddingLeft: 0, marginBottom: 8 }} onClick={onOpenRestriction}>
          → Asset Restrictionsを見る
        </button>
      )}

      {isToken2022 && info === undefined && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>読み込み中…</p>
      )}

      {isToken2022 && info === null && !error && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          このmintにはMetadata Extensionが初期化されていません。
        </p>
      )}

      {error && <div className="error-banner">{error}</div>}

      {isToken2022 && info && (
        <>
          <div className="section-title">Entries</div>
          {info.entries.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>登録されているKey/Valueはありません。</p>
          )}
          {info.entries.map((entry) => (
            <div className="asset-row" key={entry.key}>
              <div>
                <div className="asset-name">{entry.key}</div>
                <div className="asset-type">{entry.value}</div>
              </div>
              {canEdit && (
                <button className="btn-link" disabled={busy} onClick={() => handleRemove(entry.key)}>
                  削除
                </button>
              )}
            </div>
          ))}

          {canEdit ? (
            <>
              <div className="section-title">Key/Valueを追加・更新</div>
              <div className="field">
                <label>Key</label>
                <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="twitter" />
              </div>
              <div className="field">
                <label>Value</label>
                <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="@example" />
              </div>
              <button className="btn btn-primary" disabled={busy} onClick={handleSave}>
                {busy ? '保存中…' : '保存'}
              </button>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 16 }}>
              このAssetのUpdate Authorityではないため、編集はできません(閲覧のみ)。
            </p>
          )}
        </>
      )}
    </div>
  );
}
