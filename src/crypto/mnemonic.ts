import * as bip39 from 'bip39';

/** 12語のSeed Phraseを生成する(128bit entropy) */
export function generateMnemonic(): string {
  return bip39.generateMnemonic(128);
}

export function isValidMnemonic(phrase: string): boolean {
  return bip39.validateMnemonic(phrase.trim());
}

/**
 * Seed Phraseからシードバイト列を導出する。
 * ここで得たバイト列は呼び出し元がメモリ上で最短時間だけ保持し、
 * 鍵導出後は速やかに破棄すること(secureStorage.tsで暗号化して永続化する)。
 */
export async function mnemonicToSeed(phrase: string, passphrase = ''): Promise<Buffer> {
  return bip39.mnemonicToSeed(phrase.trim(), passphrase);
}
