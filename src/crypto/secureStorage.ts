/**
 * 秘密鍵/Seed Phraseは平文で保存しない。
 * パスワード(ユーザーが設定するUnlock用パスワード)からWeb Crypto APIで鍵を導出し、
 * AES-GCMで暗号化した状態でのみ IndexedDB / localStorage に置く。
 *
 * 重要: このファイルの関数はネットワークに一切アクセスしない。
 * 外部サーバーへ秘密鍵・Seed Phraseを送信しないというセキュリティ要件を
 * このモジュール単位で担保する。
 */

const PBKDF2_ITERATIONS = 250_000;
const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12;

export interface EncryptedPayload {
  ciphertext: string; // base64
  salt: string; // base64
  iv: string; // base64
}

function toBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** TS5.6+のDOM型ではUint8Array<ArrayBufferLike>がBufferSourceに直接代入できないため、明示的にArrayBufferへ変換する */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptSecret(
  plaintext: string,
  password: string,
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const key = await deriveKey(password, salt);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    new TextEncoder().encode(plaintext),
  );

  return {
    ciphertext: toBase64(ciphertextBuffer),
    salt: toBase64(salt.buffer as ArrayBuffer),
    iv: toBase64(iv.buffer as ArrayBuffer),
  };
}

export async function decryptSecret(
  payload: EncryptedPayload,
  password: string,
): Promise<string> {
  const salt = fromBase64(payload.salt);
  const iv = fromBase64(payload.iv);
  const key = await deriveKey(password, salt);

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(fromBase64(payload.ciphertext)),
  );

  return new TextDecoder().decode(plaintextBuffer);
}
