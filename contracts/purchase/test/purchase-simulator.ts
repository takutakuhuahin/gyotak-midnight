// In-memory test bed for gyotak-purchase v3.
//
// Runs the JavaScript that `compact compile` generates from the contract, with
// the dummy witnesses in ../witnesses.reference.ts. No node, indexer or proof
// server is involved and no proofs are produced: every call executes the same
// logic and assertions the circuits enforce on-chain, against local state.

import {
  type CircuitContext,
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, ledger, pureCircuits } from '../managed/contract/index.js';
import {
  type ReferencePrivateState,
  initialReferencePrivateState,
  witnesses,
} from '../witnesses.reference.js';

const COIN_PUBLIC_KEY = '0'.repeat(64);

// Block time for every simulated call, in seconds since the Unix epoch.
export const BLOCK_TIME = 1_800_000_000;

// The owner key that matches the reference witnesses' all-zero secret key.
export const referenceOwnerKey = (): Uint8Array => pureCircuits.publicKey(new Uint8Array(32));

export class PurchaseSimulator {
  readonly contract = new Contract<ReferencePrivateState>(witnesses);
  context: CircuitContext<ReferencePrivateState>;

  // `initialOwner` defaults to the reference key, so the reference witnesses
  // are authorized. Pass any other key to act as a caller who is not the owner.
  constructor(initialOwner: Uint8Array = referenceOwnerKey(), blockTime: number = BLOCK_TIME) {
    const { currentContractState, currentPrivateState, currentZswapLocalState } =
      this.contract.initialState(
        createConstructorContext(initialReferencePrivateState, COIN_PUBLIC_KEY),
        initialOwner,
      );
    this.context = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
      undefined,
      undefined,
      blockTime,
    );
  }

  getLedger(): Ledger {
    return ledger(this.context.currentQueryContext.state);
  }

  // Each call below replaces the context only when the circuit succeeds. A
  // rejected call throws and leaves the simulated state as it was.

  recordPurchase(purchaseId: Uint8Array, lotId: Uint8Array, schema: bigint, timestamp: bigint): Ledger {
    this.context = this.contract.impureCircuits.recordPurchase(
      this.context, purchaseId, lotId, schema, timestamp,
    ).context;
    return this.getLedger();
  }

  recordXBinding(
    purchaseId: Uint8Array,
    handle: Uint8Array,
    referrerId: Uint8Array,
    schema: bigint,
    timestamp: bigint,
  ): Ledger {
    this.context = this.contract.impureCircuits.recordXBinding(
      this.context, purchaseId, handle, referrerId, schema, timestamp,
    ).context;
    return this.getLedger();
  }

  rotateOwner(newOwner: Uint8Array): Ledger {
    this.context = this.contract.impureCircuits.rotateOwner(this.context, newOwner).context;
    return this.getLedger();
  }

  verifyPurchase(purchaseId: Uint8Array): void {
    this.context = this.contract.impureCircuits.verifyPurchase(this.context, purchaseId).context;
  }

  verifyXBinding(purchaseId: Uint8Array): void {
    this.context = this.contract.impureCircuits.verifyXBinding(this.context, purchaseId).context;
  }
}
