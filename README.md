# GYOTAK — ZK-verified provenance for sashimi-grade Thai seafood

GYOTAK is a working B2B seafood business in Pranburi, Prachuap Khiri Khan, Thailand. We buy directly from local boats, process and flash-freeze on site, and sell to restaurants, hotels and distributors.

This repository holds the Compact contracts behind that business. They are not a demo. Catch records and freezer temperatures are written to Midnight **mainnet** as part of daily operations, and purchase records are written there for each lot in a paid order.

## Why privacy is the requirement, not a feature

Our buyers want proof of where a fish came from and how cold it stayed on the way to them. At the same time:

- Fishing grounds are the livelihood of the boats we buy from. Publishing exact coordinates would hand them to anyone watching.
- Supplier terms and customer pricing cannot be public.
- A cold-chain claim is worthless if the seller can edit it after the fact.

Selective disclosure is the only mechanism that satisfies all three at once. That is why this runs on Midnight.

### What stays private, what is public, and why

For the three contracts running on mainnet (catch v3, temp-log and purchase v3), the table shows the main data each one handles: what goes on the public ledger, what stays off it, and why.

| What | On the ledger | Who can check it, and how | Why |
|---|---|---|---|
| **Catch** — exact fishing position (GPS coordinates) | Commitment only. The coordinates, and the nonce that hides them, are not written. | No one can read them from the ledger. We can reveal the coordinates and the nonce to a partner we choose, who recomputes the commitment and compares it with the one on the ledger. | Fishing grounds are the livelihood of the boats we buy from, and publishing exact coordinates would hand them to anyone watching. |
| **Catch** — region name shown with the catch | Public, as we write it. The contract does not check it against the GPS position. | Anyone can read it from the ledger by batch ID. It is a display label. | Buyers want to know where a fish came from, and a place name tells them without giving out exact coordinates. |
| **Catch** — species, catch manifest (species and weight), catch date and photo hash | Public. The photo itself is not written. | Anyone can enter the batch ID from an invoice on our catch verification page, or read the record from the public ledger themselves. | Customers and auditors can check a shipment against its catch record without having to trust us. |
| **Temp-log** — freezer storage temperature | Public, as an hourly average for each freezer with its sample count. Individual sensor readings are not written. | Anyone can read the records from the public Midnight indexer and decode them with our published procedure, without going through our server. An hourly average does not prove the temperature stayed within a limit at every moment. | Storage temperature is a quality signal for buyers, not a trade secret. |
| **Temp-log** — temperature measured in the quick-freeze check | Not written. Only the pass/fail result is public, with the lot, freezer, entry time and sample count. | Anyone can read the result from the ledger. The measured value is a private input we supply to the proof, which compares it with a fixed threshold set in the published contract. | Buyers can see whether each lot passed, while the measured temperatures, which reveal our freezer performance and freezing know-how, stay private. |
| **Temp-log** — hours with no temperature record | Left as gaps. We do not backfill them. | Anyone: a missing hour simply has no record in the public contract state, and a record written later would carry a write time well after the hour it covers. | A cold-chain record with no gaps in it, produced by hardware in a fish plant, would not be honest. |
| **Purchase** — who the buyer is | Commitment only. The buyer's identifier and the opening value are not written. | No one reading the ledger can tell who bought unless the buyer claims the purchase (see the binding row below). GYOTAK holds each buyer's identifier and opening value, so it can link each purchase to its customer. A buyer holding the opening value can recompute the commitment from it and their identifier with a plain SHA-256 hash, without Midnight tooling or help from GYOTAK. | A customer who never speaks publicly about a purchase is never named on the public ledger, yet the purchase is still on record. |
| **Purchase** — that a purchase was recorded (purchase ID, lot ID and time) | Public. | Anyone can read it from Midnight mainnet; the purchase lookup page in this repository does this, through GYOTAK's server by default or directly from Blockfrost with your own project ID (see [Purchase lookup page](#purchase-lookup-page)). It shows that GYOTAK recorded the purchase, not that the sale took place. | A purchase can be shown to have been on record at a fixed time without naming the buyer. |
| **Purchase** — the buyer's public account name and referral ID (a "binding") | Public. We write one only when the buyer asks to claim a purchase; the contract itself checks only that GYOTAK is the writer and that the purchase exists. It cannot be changed later. | Anyone can read it from the ledger. The full set of claimed account names and referral IDs is public, and one buyer's claims can be linked through their referral ID. The account name is self-reported; GYOTAK does not check that the account belongs to the buyer. | It is recorded only for buyers who choose to speak publicly about a purchase; a buyer who stays silent is never named. |
| **Purchase** — order contents beyond the lot ID (such as quantities), prices, payment amounts and other personal data | Not recorded. | Anyone can read the contract source in this repository: the records have no fields for them. | Customer pricing cannot be public, and a purchase can be checked without any personal data on the ledger. |
| **All three** — when each record was written | Public. Each record's write time must be close to the block time; dates inside a record, such as the catch date, are as we write them. The deployed contracts have no circuit that edits or deletes a record. | Anyone can read the write times from the ledger. | A record is worthless as evidence if the seller can back-date it or edit it after the fact. |

Anything marked public can be read by anyone from the public Midnight indexer.

## Contracts

| Path | Lines | What it does |
|---|---|---|
| `contracts/catch/` | 99 | Catch records (v3 — the version running on mainnet). Species and weight are public. The catch location is committed, not disclosed — the owner can later reveal exact coordinates to a chosen partner, who recomputes the commitment independently. |
| `contracts/temp-log/` | 162 | Cold-chain temperature logging. Storage temperatures are published as hourly averages; a quick-freeze check publishes only its pass/fail result and keeps the measured temperature private. |
| `contracts/komon/` | 124 | KOMON — physical fingerprint of a foam box. Detects substitution of the box between packing and delivery. |
| `contracts/purchase/` | 151 | Purchase records (v3 — the version running on mainnet). The buyer is written as a commitment, not an identifier, alongside the lot ID and timestamp — so the record shows that GYOTAK recorded the purchase, without exposing who made it. A buyer who chooses to speak publicly can add a binding that records their account handle and referral id. `witnesses.reference.ts` is a reference implementation of the three witnesses that matches their declarations and returns fixed dummy values; the production witnesses are not published while a patent application is being prepared. |
| `contracts/fish/` | 54 | Records a plaintext fish manifest — up to eight species:weight entries per batch ID — that only the owner can write and no one can overwrite. |
| `contracts/ratio-log/` | 139 | Yield ratio logging for processing. |

`history/` holds earlier iterations (catch v1, catch v2, and the original April traceability sketch), kept so the progression is visible rather than squashed.

## Status

| Contract | Network | Address |
|---|---|---|
| `catch` (v3) | **mainnet** | `bc33d8c05852decd4ef183201a8a9f3c25eabaa46a81786f306b95397ed118ab` |
| `temp-log` | **mainnet** | `39847629460066f7a572b1ae55d6c3a900cc347941e34b45c14457ba40f38611` |
| `komon` | preprod | — |
| `purchase` (v3) | **mainnet** | `d11d52bd5875ecc2e89e97149e0237db20a91c989f30268950e892655a2a2a57` |

The catch and temp-log contracts are written to continuously by live operations; purchase is written for each lot in a paid order. None of it comes from a demo script.

## Testing the purchase contract

`contracts/purchase/test/` runs the purchase contract's circuits in an in-memory simulator, using the JavaScript that `compact compile` generates from the contract and the dummy witnesses in `witnesses.reference.ts`. No node, indexer or proof server is involved. The tests cover the calls that must succeed and every rejection made by an `assert` in the contract.

You need the [Compact toolchain](https://docs.midnight.network/getting-started/installation) with compiler 0.30.0 (`compact update --no-set-default 0.30.0` installs it without changing your default compiler) and Node.js 20.19+, 22.12+ or 24+. Compile the contract first, then run the tests:

```bash
cd contracts/purchase
npm ci
npm run compile   # compact compile +0.30.0 --skip-zk gyotak-purchase.compact managed
npm test
```

The compiler output in `managed/` is not committed; `npm run compile` regenerates it. `npm run typecheck` type-checks the reference witnesses and the tests.

### Purchase lookup page

`contracts/purchase/verify/` is a minimal read-only page. Enter a purchase ID — as text in the form `PB-YYYYMMDD-xxxxxxxx` or as 64 hexadecimal characters — and it shows the purchase record and any public account attached to it. It sends no transactions.

Midnight's public mainnet indexer (`indexer.mainnet.midnight.network`) was shut down on 30 September 2026 at 22:00 UTC. Mainnet records are now served by Blockfrost, which requires a project ID. The page can get the contract's state in two ways:

- **Through GYOTAK's server (the default).** The page calls GYOTAK's read-only endpoint `GET https://line-harness.gyotak.workers.dev/gyotak/indexer-state?contract=<contract address>&network=mainnet`, which returns the contract's serialized state, the hash of the transaction that last changed it, and that transaction's block height. The endpoint answers only for GYOTAK's own mainnet contracts. The page says on screen that the record comes through GYOTAK's server.
- **Directly from Blockfrost, with your own project ID.** Open "Optional: read the record directly with your own Blockfrost project ID" on the page and enter a Blockfrost project ID for Midnight mainnet (the field shows `YOUR_BLOCKFROST_PROJECT_ID` as a placeholder). Your browser then sends the query straight to `https://midnight-mainnet.blockfrost.io/api/v0`, with the ID in the `project_id` header, and GYOTAK's server is not involved. The page does not save the ID, put it in the URL, log it, or show it.

The page reads the record's `schema` to explain the lot ID. With `schema = 1` (records written before 2026-10-04, Thailand time) there is one record per lot of an order, and the lot ID refers to a catch record, or is the fixed no-lot value. With `schema = 2` there is one record for the whole order, and the lot ID is SHA-256 of `gyotak:order-lots:v1:` followed by the order's manifest — the catch record IDs of the order's items, with `no-lot` for items not tied to exactly one catch record. The page says this on screen and, in the technical details, shows the formula, where GYOTAK publishes the manifest, and a terminal command to hash it yourself; it does not fetch the manifest or look up catch records. A `schema` other than 1 or 2 is shown as recorded, without a reading. The full rules and a worked example are in [Record format versions](https://github.com/ecosus-co/gyotak-purchase#record-format-versions-schema) in the `gyotak-purchase` README.

Either way, decoding the state and looking up the purchase happen in your browser, and the result says which way the state was read. Its technical details include the SHA-256 of the contract state as received, so reading both ways at the same block gives the same fingerprint. If the state cannot be read — a daily request limit, too many requests in a short time, a temporary block by Blockfrost, a failed connection, or a project ID that Blockfrost rejects — the page says why, and that this does not mean there is no record. "No record found" appears only when the state was read and has no entry for the ID.

The page decodes the state with `@midnight-ntwrk/compact-runtime` alone, following the ledger layout in `gyotak-purchase.compact` (see `verify/state.ts`). It does not import the compiled contract, so it does not need `npm run compile`. After `npm ci`:

```bash
npm run verify   # then open the http://localhost URL it prints
```

`npm run verify:build` writes the page as static files to `verify/dist/` (not committed), and `npm run verify:preview` serves them.

## Independent verification

Publishing contracts is easy. What matters is whether an outsider can check our claims without trusting us, and whether they can catch us if we lie. Our verification pages are built so they can.

**Catch records** — [verification page](https://line-harness.gyotak.workers.dev/verify/)

Enter a batch ID from an invoice and the page returns, before any check is run: the raw state SHA-256, the byte offset where that batch ID sits, and the raw record bytes at that offset. Those are falsifiable commitments — if the indexer returns a different state, the hash will not match and we are caught. The page then offers four independent ways to run the check yourself: an in-browser button, a console snippet, a terminal one-liner, and a prompt you can hand to an AI assistant. We state plainly that the button runs our code, so anyone wanting a check that depends on nothing of ours should use the snippet instead.

The extracted field list carries an explicit disclaimer: GYOTAK does not assert what each value means. The raw bytes are shown so a reader can decode them rather than take our reading of them.

**Cold-chain temperatures** — [example lot](https://line-harness.gyotak.workers.dev/gyotak/storage-trace/Katsuo%EF%BC%88suma%EF%BC%89/2026-09-06?status=skin%2Bsashimi%20fillet&until=2026-09-13)

The page documents the on-chain byte layout and the decoding procedure, with a worked example, so an agent can query the public Midnight indexer directly and decode temperatures without going through our server.

It also shows what is missing. For the lot above, 16 of 120 hourly readings are on-chain; the gaps correspond to periods when the sensor network or the mirroring service was down. We do not backfill them. A cold-chain record with no gaps in it, produced by hardware in a fish plant, would not be honest.

**What we do not claim.** Each temperature record is an hourly average. It does not prove the temperature stayed within a limit at every moment of that hour. GPS in catch v3 is a hiding commitment — the region name shown with a catch is not proven by the contract, and exact coordinates are not disclosed unless the owner chooses to reveal them to a specific party.

## Built by

ECOSUS Co., Ltd. — Pranburi, Thailand.
The stack (Compact contracts, Midnight.js integration, Cloudflare Workers / D1 / Pages, and an MCP server that lets AI agents buy fish) is written and operated by one person alongside running the fish business.

## License

Apache-2.0
