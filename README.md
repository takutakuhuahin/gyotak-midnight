# GYOTAK — ZK-verified provenance for sashimi-grade Thai seafood

GYOTAK is a working B2B seafood business in Pranburi, Prachuap Khiri Khan, Thailand. We buy directly from local boats, process and flash-freeze on site, and sell to restaurants, hotels and distributors.

This repository holds the Compact contracts behind that business. They are not a demo. Catch records, freezer temperatures and anti-swap box fingerprints are written to Midnight **mainnet** as part of daily operations.

## Why privacy is the requirement, not a feature

Our buyers want proof of where a fish came from and how cold it stayed on the way to them. At the same time:

- Fishing grounds are the livelihood of the boats we buy from. Publishing exact coordinates would hand them to anyone watching.
- Supplier terms and customer pricing cannot be public.
- A cold-chain claim is worthless if the seller can edit it after the fact.

Selective disclosure is the only mechanism that satisfies all three at once. That is why this runs on Midnight.

## Contracts

| Path | Lines | What it does |
|---|---|---|
| `contracts/catch/` | 99 | Catch records (v3 — the version running on mainnet). Species and weight are public. The catch location is committed, not disclosed — the owner can later reveal exact coordinates to a chosen partner, who recomputes the commitment independently. |
| `contracts/temp-log/` | 162 | Cold-chain temperature logging. Each reading is committed with a range proof, so a buyer learns whether the chain held without seeing our freezer telemetry. |
| `contracts/komon/` | 124 | KOMON — physical fingerprint of a foam box. Detects substitution of the box between packing and delivery. |
| `contracts/purchase/` | 88 | Purchase records. The buyer is written as a commitment, not an identifier, alongside the lot ID and timestamp — so a purchase can be proven to have happened without exposing who made it. Threshold proofs over the amount are the next step, not yet implemented. |
| `contracts/fish/` | 54 | Shared fish record structures used by the contracts above. |
| `contracts/ratio-log/` | 139 | Yield ratio logging for processing. |

`history/` holds earlier iterations (catch v1, catch v2, and the original April traceability sketch), kept so the progression is visible rather than squashed.

## Status

| Contract | Network | Address |
|---|---|---|
| `catch` (v3) | **mainnet** | `bc33d8c05852decd4ef183201a8a9f3c25eabaa46a81786f306b95397ed118ab` |
| `temp-log` | **mainnet** | `39847629460066f7a572b1ae55d6c3a900cc347941e34b45c14457ba40f38611` |
| `komon` | preprod | — |
| `purchase` | preprod (under test) | — |

Both mainnet contracts are written to continuously by live operations, not by a demo script.

## Independent verification

Publishing contracts is easy. What matters is whether an outsider can check our claims without trusting us, and whether they can catch us if we lie. Our verification pages are built so they can.

**Catch records** — [verification page](https://line-harness.gyotak.workers.dev/verify/)

Enter a batch ID from an invoice and the page returns, before any check is run: the raw state SHA-256, the byte offset where that batch ID sits, and the raw record bytes at that offset. Those are falsifiable commitments — if the indexer returns a different state, the hash will not match and we are caught. The page then offers four independent ways to run the check yourself: an in-browser button, a console snippet, a terminal one-liner, and a prompt you can hand to an AI assistant. We state plainly that the button runs our code, so anyone wanting a check that depends on nothing of ours should use the snippet instead.

The extracted field list carries an explicit disclaimer: GYOTAK does not assert what each value means. The raw bytes are shown so a reader can decode them rather than take our reading of them.

**Cold-chain temperatures** — [example lot](https://line-harness.gyotak.workers.dev/gyotak/storage-trace/Katsuo%EF%BC%88suma%EF%BC%89/2026-09-06?status=skin%2Bsashimi%20fillet&until=2026-09-13)

The page documents the on-chain byte layout and the decoding procedure, with a worked example, so an agent can query the public Midnight indexer directly and decode temperatures without going through our server.

It also shows what is missing. For the lot above, 16 of 120 hourly readings are on-chain; the gaps correspond to periods when the sensor network or the mirroring service was down. We do not backfill them. A cold-chain record with no gaps in it, produced by hardware in a fish plant, would not be honest.

**What we do not claim.** Each temperature record is an hourly average. It does not prove the temperature stayed within a limit at every moment of that hour. GPS in catch v3 is a hiding commitment — district-level provenance is provable, exact coordinates are not disclosed unless the owner chooses to reveal them to a specific party.

## Built by

ECOSUS Co., Ltd. — Pranburi, Thailand.
The stack (Compact contracts, Midnight.js integration, Cloudflare Workers / D1 / Pages, and an MCP server that lets AI agents buy fish) is written and operated by one person alongside running the fish business.

## License

Apache-2.0
