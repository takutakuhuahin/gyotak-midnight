// Reference implementation of the witnesses declared in gyotak-store-registry.compact.
//
// This file conforms to the nine `witness` declarations in the contract and to
// the `Witnesses<PS>` type that the Compact compiler generates from them. It
// shows the types and the calling shape, nothing more. The production witnesses
// are not published.
//
// Every value returned below is a fixed dummy. None of them is, or is derived
// from, a real key, signature, address or contract. The dummy keys are the
// identity point and the dummy signatures are zero, so `registerStore` and
// `recordReceipt` reject them: a call made with these witnesses fails its
// signature check by design.
//
// The imported types come from the compiled contract. Run this in this directory
// with compiler 0.36.0 (`compact update --no-set-default 0.36.0` installs it):
//   compact compile +0.36.0 --skip-zk gyotak-store-registry.compact managed

import type { Secp256k1Point, WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger, Witnesses } from './managed/contract/index.js';

// These dummies keep no private state. A real implementation defines its own.
export type ReferencePrivateState = Record<string, never>;

export const initialReferencePrivateState: ReferencePrivateState = {};

type Ctx = WitnessContext<Ledger, ReferencePrivateState>;
type EcdsaSignature = { r: bigint; s: bigint };

// Bytes<n> is a Uint8Array in TypeScript. The generated contract code rejects
// any other length at run time.
const zeros = (length: number): Uint8Array => new Uint8Array(length);

// Bytes<64> and Bytes<40> hold lowercase hex text. "0" repeated is valid hex,
// but it does not match the contract's own address or the given payout address,
// so the circuits reject it.
const hexZeros = (length: number): Uint8Array => new TextEncoder().encode('0'.repeat(length));

const DUMMY_KEY: Secp256k1Point = { x: 0n, y: 0n, identity: true };
const DUMMY_SIGNATURE: EcdsaSignature = { r: 0n, s: 0n };

export const witnesses: Witnesses<ReferencePrivateState> = {
  // witness ownerSecret(): Bytes<32>;
  // All zeros. It is not the secret behind the deployed contract's owner.
  ownerSecret: ({ privateState }: Ctx): [ReferencePrivateState, Uint8Array] => [privateState, zeros(32)],

  // witness contractHex(): Bytes<64>;
  contractHex: ({ privateState }: Ctx): [ReferencePrivateState, Uint8Array] => [privateState, hexZeros(64)],

  // witness payoutHex(): Bytes<40>;
  payoutHex: ({ privateState }: Ctx): [ReferencePrivateState, Uint8Array] => [privateState, hexZeros(40)],

  // witness newKey(): Secp256k1Point;
  newKey: ({ privateState }: Ctx): [ReferencePrivateState, Secp256k1Point] => [privateState, DUMMY_KEY],

  // witness newSignature(): Secp256k1EcdsaSignature;
  newSignature: ({ privateState }: Ctx): [ReferencePrivateState, EcdsaSignature] => [privateState, DUMMY_SIGNATURE],

  // witness approvingKey(): Secp256k1Point;
  approvingKey: ({ privateState }: Ctx): [ReferencePrivateState, Secp256k1Point] => [privateState, DUMMY_KEY],

  // witness approvingSignature(): Secp256k1EcdsaSignature;
  approvingSignature: ({ privateState }: Ctx): [ReferencePrivateState, EcdsaSignature] => [privateState, DUMMY_SIGNATURE],

  // witness receiptKey(): Secp256k1Point;
  receiptKey: ({ privateState }: Ctx): [ReferencePrivateState, Secp256k1Point] => [privateState, DUMMY_KEY],

  // witness receiptSignature(): Secp256k1EcdsaSignature;
  receiptSignature: ({ privateState }: Ctx): [ReferencePrivateState, EcdsaSignature] => [privateState, DUMMY_SIGNATURE],
};
