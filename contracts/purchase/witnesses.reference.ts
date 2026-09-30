// Reference implementation of the witnesses declared in gyotak-purchase.compact.
//
// This file conforms to the three `witness` declarations in the contract and to
// the `Witnesses<PS>` type that the Compact compiler generates from them. It
// shows the types and the calling shape, nothing more. The production witnesses
// are not published: their implementation is withheld while a patent
// application is being prepared.
//
// Every value returned below is a fixed dummy. None of them is, or is derived
// from, a real key, seed or identifier. Do not use them for real records: a
// fixed, published nonce makes every purchase commitment trivially openable.
//
// The imported types come from the compiled contract. Run this in this directory:
//   npm run compile   # compact compile +0.30.0 --skip-zk gyotak-purchase.compact managed

import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger, Witnesses } from './managed/contract/index.js';

// These dummies keep no private state. A real implementation defines its own.
export type ReferencePrivateState = Record<string, never>;

export const initialReferencePrivateState: ReferencePrivateState = {};

// Bytes<32> is a Uint8Array in TypeScript. The generated contract code rejects
// any length other than 32 at run time.
const BYTES_32 = 32;

// A 32-byte test value: the UTF-8 bytes of `label`, right-padded with zeros.
const dummyBytes32 = (label: string): Uint8Array => {
  const encoded = new TextEncoder().encode(label);
  if (encoded.length > BYTES_32) {
    throw new Error(`dummy label is longer than ${BYTES_32} bytes: ${label}`);
  }
  const bytes = new Uint8Array(BYTES_32);
  bytes.set(encoded);
  return bytes;
};

export const witnesses: Witnesses<ReferencePrivateState> = {
  // witness getBuyerId(purchaseId: Bytes<32>): Bytes<32>;
  // The dummy ignores `purchaseId` and returns the same value for every purchase.
  getBuyerId: (
    { privateState }: WitnessContext<Ledger, ReferencePrivateState>,
    _purchaseId: Uint8Array,
  ): [ReferencePrivateState, Uint8Array] => [privateState, dummyBytes32('DUMMY buyer id (reference only)')],

  // witness getPurchaseNonce(purchaseId: Bytes<32>): Bytes<32>;
  // The dummy ignores `purchaseId` and returns the same value for every purchase.
  getPurchaseNonce: (
    { privateState }: WitnessContext<Ledger, ReferencePrivateState>,
    _purchaseId: Uint8Array,
  ): [ReferencePrivateState, Uint8Array] => [privateState, dummyBytes32('DUMMY nonce (reference only)')],

  // witness localSecretKey(): Bytes<32>;
  // All zeros. It is not the secret key behind the deployed contract's owner.
  localSecretKey: (
    { privateState }: WitnessContext<Ledger, ReferencePrivateState>,
  ): [ReferencePrivateState, Uint8Array] => [privateState, new Uint8Array(BYTES_32)],
};
