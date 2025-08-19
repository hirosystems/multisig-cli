# Multisig CLI tool

Command line utility written in NodeJS for creating and signing Stacks multisig transactions with a Ledger device

## Dependencies

You will need to have `nodejs` and `npm` installed.
After cloning the repository, go to the project root and run:

```sh
npm install
```

## How to Run

### CLI

```sh
npm start -- <subcommand> [args]
```

| Subcommand        | Description                                                    |
| ----------------- | -------------------------------------------------------------- |
| `get_pub <path>`  | Get public key from Ledger                                     |
| `make_multi`      | Make multisig address from pubkeys                             |
| `check_multi`     | Check multisig addresses derived from pubkeys                  |
| `create_tx`       | Create unsigned STX multisig transaction                       |
| `create_token_tx` | Create unsigned SIP-10 token multisig transaction              |
| `create_sbtc_tx`  | Create unsigned sBTC multisig transaction                       |
| `sign`            | Sign multisig transaction with Ledger                          |
| `decode`          | Decode and print Stacks base64-encoded transaction             |
| `broadcast`       | Broadcast a transaction to the network                         |

| Flags                 | Subcommands                                         | Description                                           |
| --------------------- | ----------------------------------------------------|-------------------------------------------------------|
| `--json-inputs <path>`| `create_tx`, `create_token_tx`, `create_sbtc_tx`    | Read transaction inputs from JSON file                |
| `--csv-inputs <path>` | `create_tx`, `create_token_tx`, `create_sbtc_tx`    | Read transaction inputs from a CSV file               |
| `--json-txs <path>`   | `sign`, `broadcast`                                 | Allow bulk operations by reading JSON array from file |
| `--csv-keys <path>`   | `sign`                                              | Sign using pubkeys/paths from a CSV file              |
| `--out-file <path>`   | `create_tx`, `create_token_tx`, `create_sbtc_tx`, `sign`, `broadcast` | Output JSON directly to file |
| `--api-key <path>`    | `broadcast`                                         | Use Hiro API key to avoid rate limits                 |

## Examples

### Using Hiro API Key

To avoid rate limits when creating transactions or broadcasting them, you can use a Hiro API key:

1. Get an API key from [Hiro](https://docs.hiro.so/api)
2. Save your API key to a file
3. Use the `--api-key` flag with the relevant commands:
   ```sh
   # When broadcasting transactions
   npm start -- broadcast --api-key path/to/api-key-file
   ```

This is especially useful when working with multiple transactions to avoid hitting rate limits.

### Receiving Funds

1. Get any Ledger public keys needed
   ```sh
   npm start -- get_pub <path>
   ```
   If you are unsure of what `path` to use to generate the pubkey for your account, try `m/5757'/0'/0/0/0` or `m/44'/5757'/0/0/0`

2. Create a multisig address from pubkeys
   ```sh
   npm start -- make_multi
   ```

3. Use any wallet to send funds to the address

### Single STX Transaction Using User Input

While using this tool, inputs/outputs will be in base64-encoded JSON.
You will need to copy/paste this between steps to manage application state.

1. Create a transaction
   ```sh
   npm start -- create_tx
   ```

2. For each required signature, sign with Ledger
   ```sh
   npm start -- sign
   ```

3. **[Optional]** Print transaction as JSON to check
   ```sh
   npm start -- decode
   ```

4. Broadcast transaction
   ```sh
   npm start -- broadcast
   ```

### Single sBTC Transaction Using User Input

1. Create an sBTC transaction
   ```sh
   npm start -- create_sbtc_tx
   ```

2. For each required signature, sign with Ledger
   ```sh
   npm start -- sign
   ```

3. **[Optional]** Print transaction as JSON to check
   ```sh
   npm start -- decode
   ```

4. Broadcast transaction
   ```sh
   npm start -- broadcast
   ```

### Single SIP-10 Token Transaction Using User Input

For other SIP-10 tokens (not sBTC), you need to specify the contract details:

1. Create a token transaction
   ```sh
   npm start -- create_token_tx
   ```

2. For each required signature, sign with Ledger
   ```sh
   npm start -- sign
   ```

3. **[Optional]** Print transaction as JSON to check
   ```sh
   npm start -- decode
   ```

4. Broadcast transaction
   ```sh
   npm start -- broadcast
   ```

### Bulk STX Transactions

1. Create STX transactions from a CSV file and save outputs to file
   ```sh
   npm start -- create_tx --csv-inputs $CSV_INPUTS_FILE --out-file transactions.json
   ```

2. Sign the transactions and save outputs to file
   ```sh
   npm start -- sign --json-txs transactions.json --csv-keys $CSV_KEYS_FILE --out-file signed_transactions.json
   ```

3. Broadcast transactions
   ```sh
   npm start -- broadcast --json-txs signed_transactions.json --out-file broadcast_results.json
   ```

### Bulk sBTC Transactions

1. Create sBTC transactions from a CSV file and save outputs to file
   ```sh
   npm start -- create_sbtc_tx --csv-inputs $CSV_INPUTS_FILE --out-file sbtc_transactions.json
   ```

2. Sign the transactions and save outputs to file
   ```sh
   npm start -- sign --json-txs sbtc_transactions.json --csv-keys $CSV_KEYS_FILE --out-file signed_sbtc_transactions.json
   ```

3. Broadcast transactions
   ```sh
   npm start -- broadcast --json-txs signed_sbtc_transactions.json --out-file sbtc_broadcast_results.json
   ```

### Bulk SIP-10 Token Transactions

1. Create token transactions from a CSV file and save outputs to file
   ```sh
   npm start -- create_token_tx --csv-inputs $CSV_INPUTS_FILE --out-file token_transactions.json
   ```

2. Sign the transactions and save outputs to file
   ```sh
   npm start -- sign --json-txs token_transactions.json --csv-keys $CSV_KEYS_FILE --out-file signed_token_transactions.json
   ```

3. Broadcast transactions
   ```sh
   npm start -- broadcast --json-txs signed_token_transactions.json --out-file token_broadcast_results.json
   ```

## Input File Formats

### STX Transaction CSV Format
```csv
sender,recipient,amount,fee,nonce,network,memo,publicKeys/0,publicKeys/1,publicKeys/2,numSignatures
SP123...,SP456...,1000000,300,,mainnet,Hello,03abc...,03def...,03ghi...,2
```

### Token Transaction CSV Format
```csv
sender,recipient,amount,fee,nonce,network,memo,contractAddress,contractName,publicKeys/0,publicKeys/1,publicKeys/2,numSignatures
SP123...,SP456...,100000000,300,,mainnet,sBTC transfer,SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4,sbtc-token,03abc...,03def...,03ghi...,2
```

### JSON Input Format
For JSON files, use arrays of objects with the same field names as the CSV headers (but without the array notation for publicKeys):

```json
[
  {
    "sender": "SP123...",
    "recipient": "SP456...",
    "amount": "100000000",
    "contractAddress": "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4",
    "contractName": "sbtc-token",
    "publicKeys": ["03abc...", "03def...", "03ghi..."],
    "numSignatures": 2,
    "fee": "300",
    "network": "mainnet",
    "memo": "sBTC transfer"
  }
]
```

### CSV File Structure

The Key Path Map CSV file should have the following columns with the public key for each signer for each path 

| Column Name | Description |
| --- | --- |
| `key` | Derivation Path |
| `path` | Public Key for that Path a Given Signer |

## Using Docker

You will need Docker and `just` (can be installed by `cargo install just`)

### Building the Image

```sh
just build
```

### Running the Image

Run the same way you would run normally, but replace the `npm start --` prefix with:

```sh
just run [args...]
