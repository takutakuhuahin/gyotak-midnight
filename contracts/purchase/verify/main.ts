// Read-only purchase lookup for gyotak-purchase v3 on Midnight mainnet.
//
// Fetches the contract's current public state from the Midnight mainnet indexer,
// decodes it with the ledger() function that `compact compile` generates from
// the contract, and shows one purchase. It only reads: it calls no circuit and
// sends no transaction.

import { ContractState } from '@midnight-ntwrk/compact-runtime';
import { type Ledger, ledger } from '../managed/contract/index.js';

// Public Midnight mainnet indexer. No API key is needed.
const INDEXER_URL = 'https://indexer.mainnet.midnight.network/api/v4/graphql';

// gyotak-purchase v3 on Midnight mainnet, as listed in the repository README.
const CONTRACT_ADDRESS = 'd11d52bd5875ecc2e89e97149e0237db20a91c989f30268950e892655a2a2a57';

const STATE_QUERY = `query PurchaseContractState($address: HexEncoded!) {
  contractAction(address: $address) {
    state
    transaction { block { height timestamp } }
  }
}`;

type Snapshot = { ledger: Ledger; blockHeight: number; blockTime: Date };

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));

// A purchase ID is a Bytes<32> key. Two forms are accepted, with surrounding
// spaces ignored:
//   - 64 hex characters, with or without a 0x prefix;
//   - the text form PB-YYYYMMDD-xxxxxxxx, used as its UTF-8 bytes right-padded
//     with zeros to 32 bytes. The text is used exactly as typed.
const parsePurchaseId = (input: string): Uint8Array | null => {
  const trimmed = input.trim();
  const hex = trimmed.replace(/^0x/i, '').toLowerCase();
  if (/^[0-9a-f]{64}$/.test(hex)) return fromHex(hex);
  if (/^PB-[0-9]{8}-[0-9A-Za-z]{8}$/.test(trimmed)) {
    const bytes = new Uint8Array(32);
    bytes.set(new TextEncoder().encode(trimmed));
    return bytes;
  }
  return null;
};

// Record times on the ledger are seconds since the Unix epoch.
const formatTime = (date: Date): string =>
  `${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date)} UTC`;

const fromSeconds = (seconds: bigint): Date => new Date(Number(seconds) * 1000);

// A handle is stored as ASCII, right-padded with zero bytes.
const decodeHandle = (bytes: Uint8Array): string => {
  const end = bytes.indexOf(0);
  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end));
};

// A referral id is `aff_` followed by 32 hex characters; the ledger stores the
// 16 bytes those characters encode, right-padded to 32.
const decodeReferralId = (bytes: Uint8Array): string => `aff_${toHex(bytes.subarray(0, 16))}`;

// Purchases with no catch record carry lotId = SHA-256("gyotak:lot:no-lot").
const noLotId = async (): Promise<string> =>
  toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('gyotak:lot:no-lot'))));

const fetchSnapshot = async (): Promise<Snapshot> => {
  const response = await fetch(INDEXER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: STATE_QUERY, variables: { address: CONTRACT_ADDRESS } }),
  });
  if (!response.ok) throw new Error(`The indexer answered with HTTP ${response.status}.`);
  const body = await response.json();
  if (body.errors) throw new Error(body.errors[0]?.message ?? 'The indexer returned an error.');
  const action = body.data?.contractAction;
  if (!action?.state) throw new Error('The indexer returned no state for the contract.');
  const state = ContractState.deserialize(fromHex(action.state));
  return {
    ledger: ledger(state.data),
    blockHeight: action.transaction.block.height,
    blockTime: new Date(action.transaction.block.timestamp),
  };
};

// ---- rendering -------------------------------------------------------------

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className !== undefined) node.className = className;
  return node;
};

const detailRow = (list: HTMLDListElement, label: string, value: string): void => {
  list.append(el('dt', label), el('dd', value, 'mono'));
};

const renderFound = async (out: HTMLElement, id: Uint8Array, snap: Snapshot): Promise<void> => {
  const record = snap.ledger.purchases.lookup(id);
  const recordedAt = fromSeconds(record.committedAt);
  const lotHex = toHex(record.lotId);
  const hasLot = lotHex !== (await noLotId());

  out.append(el('h2', 'Purchase record found', 'found'));
  out.append(el('p', `This purchase was recorded on Midnight mainnet on ${formatTime(recordedAt)}.`));
  out.append(
    el(
      'p',
      "The buyer's identity is not stored — only a commitment: a one-way fingerprint made from the buyer's ID and a random secret number that GYOTAK keeps off the chain. The commitment alone does not reveal who the buyer is.",
    ),
  );
  out.append(
    el(
      'p',
      hasLot
        ? "GYOTAK linked this purchase to a recorded catch. The lot ID in the technical details refers to that catch in GYOTAK's catch records; this page does not look it up."
        : 'No catch record is linked to this purchase: GYOTAK could not match it to exactly one catch, so it was recorded without one.',
    ),
  );

  let binding: ReturnType<Ledger['bindings']['lookup']> | undefined;
  if (snap.ledger.bindings.member(id)) {
    binding = snap.ledger.bindings.lookup(id);
    out.append(
      el(
        'p',
        `At the buyer's request, GYOTAK added a public account name to this purchase: ${decodeHandle(binding.handle)}, with the buyer's GYOTAK referral ID ${decodeReferralId(binding.referrerId)}. This was recorded on ${formatTime(fromSeconds(binding.boundAt))}. GYOTAK does not check that the account belongs to the buyer.`,
      ),
    );
  } else {
    out.append(el('p', 'No public account is attached to this purchase.'));
  }

  const details = el('details');
  details.append(el('summary', 'Technical details'));
  const list = el('dl');
  detailRow(list, 'Purchase ID', toHex(id));
  detailRow(list, 'Lot ID', lotHex);
  detailRow(list, 'Commitment', toHex(record.purchaseCommitment));
  detailRow(list, 'Recorded at (Unix seconds)', record.committedAt.toString());
  detailRow(list, 'Record format version', record.schema.toString());
  if (binding) {
    detailRow(list, 'Handle (raw bytes)', toHex(binding.handle));
    detailRow(list, 'Referral ID (raw bytes)', toHex(binding.referrerId));
    detailRow(list, 'Public account attached at (Unix seconds)', binding.boundAt.toString());
    detailRow(list, 'Binding format version', binding.schema.toString());
  }
  detailRow(list, 'Contract address', CONTRACT_ADDRESS);
  detailRow(list, 'Contract last changed in block', `${snap.blockHeight} (${formatTime(snap.blockTime)})`);
  detailRow(list, 'Indexer', INDEXER_URL);
  details.append(list);
  out.append(details);
};

const renderNotFound = (out: HTMLElement, id: Uint8Array, snap: Snapshot): void => {
  out.append(el('h2', 'No record found', 'missing'));
  out.append(
    el(
      'p',
      "GYOTAK's purchase contract on Midnight mainnet has no record for this ID. Check that the full ID was copied. A very recent purchase may not be recorded yet.",
    ),
  );
  const details = el('details');
  details.append(el('summary', 'Technical details'));
  const list = el('dl');
  detailRow(list, 'Purchase ID', toHex(id));
  detailRow(list, 'Contract address', CONTRACT_ADDRESS);
  detailRow(list, 'Contract last changed in block', `${snap.blockHeight} (${formatTime(snap.blockTime)})`);
  details.append(list);
  out.append(details);
};

const form = document.querySelector<HTMLFormElement>('#lookup')!;
const input = document.querySelector<HTMLInputElement>('#purchase-id')!;
const out = document.querySelector<HTMLElement>('#result')!;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  out.replaceChildren();
  const id = parsePurchaseId(input.value);
  if (!id) {
    out.append(el('p', 'Enter the purchase ID either as text in the form PB-YYYYMMDD-xxxxxxxx, or as 64 characters using only 0–9 and a–f.', 'error'));
    return;
  }
  out.append(el('p', "Reading GYOTAK's purchase records from Midnight mainnet…", 'status'));
  try {
    const snap = await fetchSnapshot();
    out.replaceChildren();
    if (snap.ledger.purchases.member(id)) await renderFound(out, id, snap);
    else renderNotFound(out, id, snap);
  } catch (error) {
    out.replaceChildren(
      el('p', 'Could not read the contract from Midnight mainnet. Please try again in a moment.', 'error'),
      el('p', error instanceof Error ? error.message : String(error), 'mono'),
    );
  }
});
