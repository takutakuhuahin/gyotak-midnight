// Read-only purchase lookup for gyotak-purchase v3 on Midnight mainnet.
//
// Midnight's public mainnet indexer was shut down on 2026-09-30 at 22:00 UTC.
// The contract's public state is now read in one of two ways:
//   - through GYOTAK's read-only endpoint (the default);
//   - directly from Blockfrost, with a project ID the visitor enters. The ID is
//     sent only to Blockfrost, in the project_id header. It is not stored,
//     logged, put in the URL, or shown on the page.
// Either way, the state is hashed, decoded (see state.ts) and checked here in
// the browser. The page calls no circuit and sends no transaction.

import { type PurchaseLedger, type PurchaseRecord, readPurchaseLedger } from './state.js';

// gyotak-purchase v3 on Midnight mainnet, as listed in the repository README.
const CONTRACT_ADDRESS = 'd11d52bd5875ecc2e89e97149e0237db20a91c989f30268950e892655a2a2a57';

// GYOTAK's read-only endpoint. It answers only for GYOTAK's own mainnet
// contracts, with { state, tx_hash, block_height }.
const GYOTAK_STATE_URL =
  `https://line-harness.gyotak.workers.dev/gyotak/indexer-state?contract=${CONTRACT_ADDRESS}&network=mainnet`;

// Blockfrost's Midnight mainnet indexer: GraphQL over POST.
const BLOCKFROST_URL = 'https://midnight-mainnet.blockfrost.io/api/v0';

const STATE_QUERY = `query PurchaseContractState($address: HexEncoded!) {
  contractAction(address: $address) {
    state
    transaction { hash block { height timestamp } }
  }
}`;

type Source = 'gyotak' | 'blockfrost';

type RawState = { stateHex: string; blockHeight?: number; blockTime?: Date; txHash?: string };

type Snapshot = RawState & { source: Source; ledger: PurchaseLedger; stateSha256: string };

// Why the contract data could not be read. None of these means "no record".
type FailureReason =
  | 'daily-limit'
  | 'too-many-requests'
  | 'temporary-block'
  | 'connection'
  | 'upstream-connection'
  | 'project-id'
  | 'no-data'
  | 'unexpected';

class ReadFailure extends Error {
  constructor(
    readonly reason: FailureReason,
    readonly source: Source,
    detail: string,
  ) {
    super(detail);
  }
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array<ArrayBuffer> =>
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

// The indexer's block timestamp is a Unix timestamp; the schema does not state
// the unit, so a value too small to be milliseconds is read as seconds.
const fromBlockTimestamp = (value: unknown): Date | undefined =>
  typeof value === 'number' && value > 0 ? new Date(value < 1e11 ? value * 1000 : value) : undefined;

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

// ---- reading the contract state ---------------------------------------------

const fetchViaGyotak = async (): Promise<RawState> => {
  let response: Response;
  try {
    response = await fetch(GYOTAK_STATE_URL);
  } catch {
    throw new ReadFailure('connection', 'gyotak', "The request to GYOTAK's server did not get through.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof body?.error === 'string' ? body.error : '';
    const detail = `GYOTAK's server answered with HTTP ${response.status}${code ? ` (${code})` : ''}.`;
    if (code === 'quota') throw new ReadFailure('daily-limit', 'gyotak', detail);
    if (code === 'rate_limited' || response.status === 429) throw new ReadFailure('too-many-requests', 'gyotak', detail);
    if (code === 'network') throw new ReadFailure('upstream-connection', 'gyotak', detail);
    if (code === 'no_state') throw new ReadFailure('no-data', 'gyotak', detail);
    throw new ReadFailure('unexpected', 'gyotak', detail);
  }
  if (typeof body?.state !== 'string') {
    throw new ReadFailure('unexpected', 'gyotak', "GYOTAK's server sent an answer in an unexpected form.");
  }
  return {
    stateHex: body.state,
    blockHeight: typeof body.block_height === 'number' ? body.block_height : undefined,
    txHash: typeof body.tx_hash === 'string' ? body.tx_hash : undefined,
  };
};

const fetchViaBlockfrost = async (projectId: string): Promise<RawState> => {
  let response: Response;
  try {
    // redirect: 'error' keeps the project_id header from following a redirect to another host.
    response = await fetch(BLOCKFROST_URL, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', project_id: projectId },
      body: JSON.stringify({ query: STATE_QUERY, variables: { address: CONTRACT_ADDRESS } }),
    });
  } catch {
    throw new ReadFailure('connection', 'blockfrost', 'The request to Blockfrost did not get through.');
  }
  const detail = `Blockfrost answered with HTTP ${response.status}.`;
  if (response.status === 401 || response.status === 403) throw new ReadFailure('project-id', 'blockfrost', detail);
  if (response.status === 402) throw new ReadFailure('daily-limit', 'blockfrost', detail);
  if (response.status === 429) throw new ReadFailure('too-many-requests', 'blockfrost', detail);
  // Blockfrost answers 418 when it has temporarily blocked a project that kept sending requests after a limit.
  if (response.status === 418) throw new ReadFailure('temporary-block', 'blockfrost', detail);
  if (!response.ok) throw new ReadFailure('unexpected', 'blockfrost', detail);
  const body = await response.json().catch(() => null);
  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    throw new ReadFailure('unexpected', 'blockfrost', `Blockfrost reported an error: ${String(body.errors[0]?.message ?? 'no message')}`);
  }
  const action = body?.data?.contractAction;
  if (typeof action?.state !== 'string') {
    throw new ReadFailure('no-data', 'blockfrost', "Blockfrost's answer did not include the purchase contract's data.");
  }
  return {
    stateHex: action.state,
    blockHeight: typeof action.transaction?.block?.height === 'number' ? action.transaction.block.height : undefined,
    blockTime: fromBlockTimestamp(action.transaction?.block?.timestamp),
    txHash: typeof action.transaction?.hash === 'string' ? action.transaction.hash : undefined,
  };
};

const readSnapshot = async (projectId: string): Promise<Snapshot> => {
  const source: Source = projectId ? 'blockfrost' : 'gyotak';
  const raw = projectId ? await fetchViaBlockfrost(projectId) : await fetchViaGyotak();
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(raw.stateHex)) {
    throw new ReadFailure('unexpected', source, 'The contract data is not in the expected hexadecimal form.');
  }
  const bytes = fromHex(raw.stateHex);
  const stateSha256 = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  let ledger: PurchaseLedger;
  try {
    ledger = readPurchaseLedger(bytes);
  } catch (error) {
    throw new ReadFailure('unexpected', source, `The contract data could not be decoded: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { ...raw, source, ledger, stateSha256 };
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

const sourceText = (snap: Snapshot): string =>
  snap.source === 'gyotak'
    ? "Read through GYOTAK's server. The calculation and the check were done in your browser."
    : "Read directly from Blockfrost with your own project ID. GYOTAK's server was not used.";

// Rows that say where the contract data came from, for both outcomes.
const sourceRows = (list: HTMLDListElement, snap: Snapshot): void => {
  detailRow(list, 'Read through', snap.source === 'gyotak' ? "GYOTAK's server" : 'Blockfrost, with your own project ID');
  detailRow(list, 'Read from', snap.source === 'gyotak' ? GYOTAK_STATE_URL : BLOCKFROST_URL);
  detailRow(list, 'Contract address', CONTRACT_ADDRESS);
  if (snap.blockHeight !== undefined) {
    detailRow(
      list,
      'Contract last changed in block',
      snap.blockTime ? `${snap.blockHeight} (${formatTime(snap.blockTime)})` : String(snap.blockHeight),
    );
  }
  if (snap.txHash) detailRow(list, 'Transaction that last changed the contract', snap.txHash);
  detailRow(list, 'Fingerprint of the contract data (SHA-256)', snap.stateSha256);
};

const fingerprintNote = (): HTMLParagraphElement =>
  el(
    'p',
    'The fingerprint is calculated in your browser from the contract data exactly as it was received. Reading through GYOTAK\'s server and reading with your own Blockfrost project ID give the same fingerprint, as long as the contract has not changed in between (same block).',
  );

const renderFound = (out: HTMLElement, id: Uint8Array, snap: Snapshot, record: PurchaseRecord, hasLot: boolean): void => {
  const recordedAt = fromSeconds(record.committedAt);
  const lotHex = toHex(record.lotId);

  out.append(el('h2', 'Purchase record found', 'found'));
  out.append(el('p', sourceText(snap), 'source'));
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

  const binding = snap.ledger.binding(id);
  if (binding) {
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
  sourceRows(list, snap);
  details.append(list, fingerprintNote());
  out.append(details);
};

const renderNotFound = (out: HTMLElement, id: Uint8Array, snap: Snapshot): void => {
  out.append(el('h2', 'No record found', 'missing'));
  out.append(el('p', sourceText(snap), 'source'));
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
  sourceRows(list, snap);
  details.append(list, fingerprintNote());
  out.append(details);
};

const OWN_ID_HINT = 'read the record directly with your own Blockfrost project ID (the option above the result)';

const failureMessages = (reason: FailureReason, source: Source): [string, string] => {
  const viaGyotak = source === 'gyotak';
  switch (reason) {
    case 'daily-limit':
      return viaGyotak
        ? ["GYOTAK's server has used up today's allowance for reading Midnight records.", `Please try again tomorrow, or ${OWN_ID_HINT}.`]
        : ['Your Blockfrost project has used up its daily allowance of requests.', "Try again after the allowance resets, or leave the project ID empty to read through GYOTAK's server."];
    case 'too-many-requests':
      return viaGyotak
        ? ["GYOTAK's server received too many requests in a short time.", 'Please wait a minute and try again.']
        : ['Blockfrost received too many requests from your project in a short time.', 'Please wait a minute and try again.'];
    case 'temporary-block':
      return ['Blockfrost has temporarily blocked requests from your project, because too many were sent after a limit was reached.', "Please try again later, or leave the project ID empty to read through GYOTAK's server."];
    case 'connection':
      return viaGyotak
        ? ["Could not connect to GYOTAK's server.", `Check your internet connection and try again, or ${OWN_ID_HINT}.`]
        : ['Could not connect to Blockfrost.', 'Check your internet connection and try again.'];
    case 'upstream-connection':
      return ["GYOTAK's server could not connect to the service that holds the Midnight records.", `Please try again in a few minutes, or ${OWN_ID_HINT}.`];
    case 'project-id':
      return ['Blockfrost did not accept this project ID.', 'Check that it is a project ID for Midnight mainnet and that it was copied in full.'];
    case 'no-data':
      return viaGyotak
        ? ["GYOTAK's server could not get the purchase contract's data.", `Please try again in a few minutes, or ${OWN_ID_HINT}.`]
        : ["Blockfrost did not return the purchase contract's data.", 'Please try again in a few minutes.'];
    case 'unexpected':
      return ['Something unexpected happened while reading the purchase records.', 'Please try again in a few minutes.'];
  }
};

// The project ID is never shown: it is masked out of any message before display.
const renderFailure = (out: HTMLElement, failure: ReadFailure, projectId: string): void => {
  const [what, next] = failureMessages(failure.reason, failure.source);
  const detail = projectId ? failure.message.split(projectId).join('[your project ID]') : failure.message;
  out.replaceChildren(
    el('h2', 'Could not check this purchase', 'error'),
    el('p', what),
    el('p', 'This does not mean there is no record for this purchase.', 'error'),
    el('p', next),
    el('p', detail, 'mono'),
  );
};

const form = document.querySelector<HTMLFormElement>('#lookup')!;
const input = document.querySelector<HTMLInputElement>('#purchase-id')!;
const projectInput = document.querySelector<HTMLInputElement>('#project-id')!;
const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
const out = document.querySelector<HTMLElement>('#result')!;

// Only the latest lookup may draw its result, so a slow earlier answer can never
// replace it. Check is also disabled while a lookup is running.
let latestLookup = 0;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const lookup = ++latestLookup;
  out.replaceChildren();
  const id = parsePurchaseId(input.value);
  if (!id) {
    out.append(el('p', 'Enter the purchase ID either as text in the form PB-YYYYMMDD-xxxxxxxx, or as 64 characters using only 0–9 and a–f.', 'error'));
    return;
  }
  const projectId = projectInput.value.trim();
  if (projectId && !/^[A-Za-z0-9]+$/.test(projectId)) {
    out.append(el('p', 'This does not look like a Blockfrost project ID: it should contain only letters and digits. Leave it empty to read through GYOTAK\'s server.', 'error'));
    return;
  }
  out.append(
    el(
      'p',
      projectId
        ? 'Reading the purchase records directly from Blockfrost…'
        : "Reading the purchase records through GYOTAK's server…",
      'status',
    ),
  );
  button.disabled = true;
  try {
    const snap = await readSnapshot(projectId);
    const record = snap.ledger.purchase(id);
    const hasLot = record !== undefined && toHex(record.lotId) !== (await noLotId());
    if (lookup !== latestLookup) return;
    out.replaceChildren();
    if (record) renderFound(out, id, snap, record, hasLot);
    else renderNotFound(out, id, snap);
  } catch (error) {
    if (lookup !== latestLookup) return;
    const failure =
      error instanceof ReadFailure
        ? error
        : new ReadFailure('unexpected', projectId ? 'blockfrost' : 'gyotak', error instanceof Error ? error.message : String(error));
    renderFailure(out, failure, projectId);
  } finally {
    if (lookup === latestLookup) button.disabled = false;
  }
});

// Check starts disabled in index.html, so it cannot submit the form the ordinary
// way before this script is ready.
button.disabled = false;
