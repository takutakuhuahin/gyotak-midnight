// Reads gyotak-purchase v3 records from the contract's serialized public state
// using @midnight-ntwrk/compact-runtime alone. It does not use the ledger()
// function that `compact compile` generates, so the page can be built without
// compiling the contract.
//
// Layout, from gyotak-purchase.compact: the ledger fields are stored in the
// order they are declared — purchases (0), bindings (1), owner (2) — and each
// map value holds its struct's fields in declaration order.

import {
  CompactTypeBytes,
  CompactTypeUnsignedInteger,
  ContractState,
  type StateValue,
  type Value,
} from '@midnight-ntwrk/compact-runtime';

const BYTES32 = new CompactTypeBytes(32);
const UINT64 = new CompactTypeUnsignedInteger(18446744073709551615n, 8);
const UINT8 = new CompactTypeUnsignedInteger(255n, 1);

const PURCHASES = 0;
const BINDINGS = 1;
const FIELD_COUNT = 3;

export type PurchaseRecord = {
  purchaseCommitment: Uint8Array;
  lotId: Uint8Array;
  committedAt: bigint;
  schema: bigint;
};

export type XBinding = {
  handle: Uint8Array;
  referrerId: Uint8Array;
  boundAt: bigint;
  schema: bigint;
};

export type PurchaseLedger = {
  purchase(id: Uint8Array): PurchaseRecord | undefined;
  binding(id: Uint8Array): XBinding | undefined;
};

// The map value stored under a Bytes<32> key, or undefined when the key is
// absent. fromValue() consumes the array it reads, so a copy is returned.
const mapValue = (map: StateValue, key: Uint8Array): Value | undefined => {
  const entry = map.asMap()?.get({ value: BYTES32.toValue(key), alignment: BYTES32.alignment() });
  return entry === undefined ? undefined : [...entry.asCell().value];
};

export const readPurchaseLedger = (serializedState: Uint8Array): PurchaseLedger => {
  const fields = ContractState.deserialize(serializedState).data.state.asArray();
  const purchases = fields?.[PURCHASES];
  const bindings = fields?.[BINDINGS];
  if (fields?.length !== FIELD_COUNT || purchases?.asMap() === undefined || bindings?.asMap() === undefined) {
    throw new Error('The contract data does not have the layout of gyotak-purchase v3.');
  }
  return {
    purchase(id) {
      const value = mapValue(purchases, id);
      return value && {
        purchaseCommitment: BYTES32.fromValue(value),
        lotId: BYTES32.fromValue(value),
        committedAt: UINT64.fromValue(value),
        schema: UINT8.fromValue(value),
      };
    },
    binding(id) {
      const value = mapValue(bindings, id);
      return value && {
        handle: BYTES32.fromValue(value),
        referrerId: BYTES32.fromValue(value),
        boundAt: UINT64.fromValue(value),
        schema: UINT8.fromValue(value),
      };
    },
  };
};
