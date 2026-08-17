import { Connection } from '@solana/web3.js';
import { resolve as resolveSnsDomain } from '@bonfida/spl-name-service';
import type { NetworkId } from '../../../core/types/network';
import type { NamespaceRecord } from '../../../core/types/namespace';
import { getConnection } from '../network/connectionFactory';

/**
 * SymbolのNamespace(@name)に近いUXを、Solana Name Service(SNS, .sol ドメイン)を使って再現する。
 * 注意: これはSymbolのNamespaceと同一の仕組みではない。SNSは既存の名前解決サービスであり、
 * 独自のNamespace階層・委任・有効期限管理をSymbolと同じ形で持っているわけではない。
 * また、SNSは主にMainnetで運用されているため、Testnetでは解決に失敗することがある。
 */

function normalizeToDomain(input: string): string {
  const trimmed = input.trim();
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return withoutAt.endsWith('.sol') ? withoutAt : `${withoutAt}.sol`;
}

/** UIの "To" 欄などで、入力が Namespace(@name / name.sol)かどうかを判定する */
export function looksLikeNamespaceInput(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith('@') || trimmed.endsWith('.sol');
}

export async function resolveNamespace(
  input: string,
  network: NetworkId,
): Promise<NamespaceRecord> {
  const domain = normalizeToDomain(input);
  const connection: Connection = getConnection(network);

  try {
    const owner = await resolveSnsDomain(connection, domain);
    return {
      name: domain.replace(/\.sol$/, ''),
      resolvedAddress: owner.toBase58(),
      provider: 'sns',
      network,
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(
      `"${domain}" を解決できませんでした(${reason})。Namespaceが存在しないか、このNetworkでは利用できない可能性があります。`,
    );
  }
}
