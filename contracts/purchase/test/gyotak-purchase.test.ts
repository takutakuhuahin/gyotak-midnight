// Circuit tests for gyotak-purchase v3, run in the in-memory simulator with the
// dummy witnesses from ../witnesses.reference.ts. Every rejection tested here
// corresponds to an `assert` in gyotak-purchase.compact, matched by its message.

import { createHash } from 'node:crypto';
import { sampleContractAddress } from '@midnight-ntwrk/compact-runtime';
import { describe, expect, it } from 'vitest';
import { initialReferencePrivateState, witnesses } from '../witnesses.reference.js';
import { BLOCK_TIME, PurchaseSimulator, referenceOwnerKey } from './purchase-simulator.js';

// Owner public key of the deployed Mainnet contract, as published in the
// "Owner public key" section of the ecosus-co/gyotak-purchase README.
const PUBLISHED_OWNER_KEY = '20fc1d0d5c405e95c669158a3db32217e2be65247dbea06e243745832af2e1be';

const T = BigInt(BLOCK_TIME);
const WINDOW = 600n;
const SCHEMA = 1n;

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const fromHex = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'hex'));
const bytes32 = (fill: number): Uint8Array => new Uint8Array(32).fill(fill);
const ascii32 = (text: string): Uint8Array => {
  const bytes = new Uint8Array(32);
  bytes.set(new TextEncoder().encode(text));
  return bytes;
};

// A rejected call throws exactly `failed assert: <message>`, where <message> is
// the second argument of the `assert` in gyotak-purchase.compact.
const failedAssert = (message: string): RegExp => new RegExp(`^failed assert: ${message}$`);

// Test inputs. All of them are made up.
const PURCHASE_ID = bytes32(0x01);
const SECOND_PURCHASE_ID = bytes32(0x02);
const LOT_ID = bytes32(0x0a);
const HANDLE = ascii32('@reference_test');
const REFERRER_ID = new Uint8Array(32).fill(0xaa, 0, 16);
const OTHER_OWNER_KEY = bytes32(0x77);

// The value a reference witness hands to the circuit for `purchaseId`.
const witnessValue = (
  sim: PurchaseSimulator,
  name: 'getBuyerId' | 'getPurchaseNonce',
  purchaseId: Uint8Array,
): Uint8Array =>
  witnesses[name](
    {
      privateState: initialReferencePrivateState,
      ledger: sim.getLedger(),
      contractAddress: sampleContractAddress(),
    },
    purchaseId,
  )[1];

describe('constructor', () => {
  it('stores the initial owner and starts with no purchases or bindings', () => {
    const ledger = new PurchaseSimulator().getLedger();
    expect(ledger.owner).toEqual(referenceOwnerKey());
    expect(ledger.purchases.isEmpty()).toBe(true);
    expect(ledger.bindings.isEmpty()).toBe(true);
  });
});

describe('recordPurchase', () => {
  it('records a purchase with the lot, timestamp and schema it was given', () => {
    const ledger = new PurchaseSimulator().recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T);
    expect(ledger.purchases.size()).toBe(1n);
    expect(ledger.purchases.member(PURCHASE_ID)).toBe(true);
    const record = ledger.purchases.lookup(PURCHASE_ID);
    expect(record.lotId).toEqual(LOT_ID);
    expect(record.committedAt).toBe(T);
    expect(record.schema).toBe(SCHEMA);
  });

  it('stores the commitment SHA-256(nonce ‖ buyerId) of the witness values', () => {
    const sim = new PurchaseSimulator();
    const nonce = witnessValue(sim, 'getPurchaseNonce', PURCHASE_ID);
    const buyerId = witnessValue(sim, 'getBuyerId', PURCHASE_ID);
    const expected = createHash('sha256').update(nonce).update(buyerId).digest('hex');

    const record = sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T).purchases.lookup(PURCHASE_ID);
    expect(hex(record.purchaseCommitment)).toBe(expected);
  });

  it('accepts a timestamp at either edge of the ±600 s window', () => {
    const sim = new PurchaseSimulator();
    sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T + WINDOW);
    const ledger = sim.recordPurchase(SECOND_PURCHASE_ID, LOT_ID, SCHEMA, T - WINDOW);
    expect(ledger.purchases.size()).toBe(2n);
  });

  it('rejects a caller who is not the owner', () => {
    const sim = new PurchaseSimulator(OTHER_OWNER_KEY);
    expect(() => sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T)).toThrow(failedAssert('unauthorized'));
    expect(sim.getLedger().purchases.isEmpty()).toBe(true);
  });

  it('rejects a second record for the same purchaseId and keeps the first', () => {
    const sim = new PurchaseSimulator();
    sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T);
    expect(() => sim.recordPurchase(PURCHASE_ID, bytes32(0x0b), SCHEMA, T)).toThrow(failedAssert('purchase already recorded'));
    expect(sim.getLedger().purchases.size()).toBe(1n);
    expect(sim.getLedger().purchases.lookup(PURCHASE_ID).lotId).toEqual(LOT_ID);
  });

  it('rejects a timestamp more than 600 s ahead of the block time', () => {
    const sim = new PurchaseSimulator();
    expect(() => sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T + WINDOW + 1n)).toThrow(failedAssert('timestamp too far in the future'));
  });

  it('rejects a timestamp more than 600 s behind the block time', () => {
    const sim = new PurchaseSimulator();
    expect(() => sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T - WINDOW - 1n)).toThrow(failedAssert('timestamp too far in the past'));
  });
});

describe('recordXBinding', () => {
  it('records a binding for a recorded purchase', () => {
    const sim = new PurchaseSimulator();
    sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T);
    const ledger = sim.recordXBinding(PURCHASE_ID, HANDLE, REFERRER_ID, SCHEMA, T);
    expect(ledger.bindings.size()).toBe(1n);
    const binding = ledger.bindings.lookup(PURCHASE_ID);
    expect(binding.handle).toEqual(HANDLE);
    expect(binding.referrerId).toEqual(REFERRER_ID);
    expect(binding.boundAt).toBe(T);
    expect(binding.schema).toBe(SCHEMA);
  });

  it('accepts a timestamp at either edge of the ±600 s window', () => {
    const sim = new PurchaseSimulator();
    sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T);
    sim.recordPurchase(SECOND_PURCHASE_ID, LOT_ID, SCHEMA, T);
    sim.recordXBinding(PURCHASE_ID, HANDLE, REFERRER_ID, SCHEMA, T + WINDOW);
    const ledger = sim.recordXBinding(SECOND_PURCHASE_ID, HANDLE, REFERRER_ID, SCHEMA, T - WINDOW);
    expect(ledger.bindings.size()).toBe(2n);
  });

  it('rejects a caller who is not the owner', () => {
    const sim = new PurchaseSimulator(OTHER_OWNER_KEY);
    expect(() => sim.recordXBinding(PURCHASE_ID, HANDLE, REFERRER_ID, SCHEMA, T)).toThrow(failedAssert('unauthorized'));
  });

  it('rejects a binding for a purchase that was never recorded', () => {
    const sim = new PurchaseSimulator();
    expect(() => sim.recordXBinding(PURCHASE_ID, HANDLE, REFERRER_ID, SCHEMA, T)).toThrow(failedAssert('purchase not found'));
    expect(sim.getLedger().bindings.isEmpty()).toBe(true);
  });

  it('rejects a second binding for the same purchase and keeps the first', () => {
    const sim = new PurchaseSimulator();
    sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T);
    sim.recordXBinding(PURCHASE_ID, HANDLE, REFERRER_ID, SCHEMA, T);
    expect(() =>
      sim.recordXBinding(PURCHASE_ID, ascii32('@someone_else'), REFERRER_ID, SCHEMA, T),
    ).toThrow(failedAssert('binding already recorded'));
    expect(sim.getLedger().bindings.lookup(PURCHASE_ID).handle).toEqual(HANDLE);
  });

  it('rejects a timestamp more than 600 s ahead of the block time', () => {
    const sim = new PurchaseSimulator();
    sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T);
    expect(() =>
      sim.recordXBinding(PURCHASE_ID, HANDLE, REFERRER_ID, SCHEMA, T + WINDOW + 1n),
    ).toThrow(failedAssert('timestamp too far in the future'));
  });

  it('rejects a timestamp more than 600 s behind the block time', () => {
    const sim = new PurchaseSimulator();
    sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T);
    expect(() =>
      sim.recordXBinding(PURCHASE_ID, HANDLE, REFERRER_ID, SCHEMA, T - WINDOW - 1n),
    ).toThrow(failedAssert('timestamp too far in the past'));
  });
});

describe('rotateOwner', () => {
  it('replaces the owner key', () => {
    const ledger = new PurchaseSimulator().rotateOwner(OTHER_OWNER_KEY);
    expect(ledger.owner).toEqual(OTHER_OWNER_KEY);
  });

  it('shuts out the previous key once the owner has been rotated', () => {
    const sim = new PurchaseSimulator();
    sim.rotateOwner(OTHER_OWNER_KEY);
    expect(() => sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T)).toThrow(failedAssert('unauthorized'));
  });

  it('rejects a caller who is not the owner', () => {
    const sim = new PurchaseSimulator(OTHER_OWNER_KEY);
    expect(() => sim.rotateOwner(referenceOwnerKey())).toThrow(failedAssert('unauthorized'));
    expect(sim.getLedger().owner).toEqual(OTHER_OWNER_KEY);
  });
});

describe('verifyPurchase and verifyXBinding', () => {
  it('verifyPurchase passes for a recorded purchase', () => {
    const sim = new PurchaseSimulator();
    sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T);
    expect(() => sim.verifyPurchase(PURCHASE_ID)).not.toThrow();
  });

  it('verifyPurchase rejects a purchaseId that was never recorded', () => {
    const sim = new PurchaseSimulator();
    expect(() => sim.verifyPurchase(PURCHASE_ID)).toThrow(failedAssert('purchase not found'));
  });

  it('verifyXBinding passes for a recorded binding', () => {
    const sim = new PurchaseSimulator();
    sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T);
    sim.recordXBinding(PURCHASE_ID, HANDLE, REFERRER_ID, SCHEMA, T);
    expect(() => sim.verifyXBinding(PURCHASE_ID)).not.toThrow();
  });

  it('verifyXBinding rejects a purchase that has no binding', () => {
    const sim = new PurchaseSimulator();
    sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T);
    expect(() => sim.verifyXBinding(PURCHASE_ID)).toThrow(failedAssert('binding not found'));
  });
});

describe('reference key and the deployed contract', () => {
  it('derives a public key that differs from the published Mainnet owner key', () => {
    const key = referenceOwnerKey();
    expect(key).toHaveLength(32);
    expect(hex(key)).not.toBe(PUBLISHED_OWNER_KEY);
  });

  it('cannot write to a contract whose owner is the published Mainnet owner key', () => {
    const sim = new PurchaseSimulator(fromHex(PUBLISHED_OWNER_KEY));
    expect(() => sim.recordPurchase(PURCHASE_ID, LOT_ID, SCHEMA, T)).toThrow(failedAssert('unauthorized'));
  });
});
