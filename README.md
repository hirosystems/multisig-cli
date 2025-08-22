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

| Subcommand        | Arguments | Input Type | Description                                                    |
| ----------------- | --------- | ---------- | -------------------------------------------------------------- |
| `get_pub <path>`  | Path required (quotes needed) | None | Get public key from Ledger. Path examples: `"m/5757'/0'/0/0/0"` or `"m/44'/5757'/0/0/0"` |
| `make_multi`      | None | Interactive prompts | Make multisig address. Choice to use existing pubkeys or generate from Ledger device |
| `check_multi`     | None | Interactive prompts | Check multisig addresses derived from pubkeys. Prompts for comma-separated pubkeys and required signatures |
| `create_tx`       | Optional flags | Interactive prompts or file | Create unsigned STX multisig transaction. Interactive mode prompts for all transaction details |
| `create_token_tx` | Optional flags | Interactive prompts or file | Create unsigned SIP-10 token multisig transaction. Interactive mode prompts for contract details |
| `create_sbtc_tx`  | Optional flags | Interactive prompts or file | Create unsigned sBTC multisig transaction. Interactive mode prompts for amount in satoshis |
| `sign`            | Optional flags | Interactive prompts or file | Sign multisig transaction with Ledger. Prompts for base64 transaction and HD paths |
| `decode`          | None | Interactive prompt | Decode and print Stacks base64-encoded transaction. Prompts for base64 input |
| `broadcast`       | Optional flags | Interactive prompt or file | Broadcast a transaction to the network. Prompts for base64 signed transaction |

| Flags                 | Subcommands                                         | Description                                           |
| --------------------- | ----------------------------------------------------|-------------------------------------------------------|
| `--json-inputs <path>`| `create_tx`, `create_token_tx`, `create_sbtc_tx`    | Read transaction inputs from JSON file                |
| `--csv-inputs <path>` | `create_tx`, `create_token_tx`, `create_sbtc_tx`    | Read transaction inputs from a CSV file               |
| `--json-txs <path>`   | `sign`, `broadcast`                                 | Allow bulk operations by reading JSON array from file |
| `--csv-keys <path>`   | `sign`                                              | Sign using pubkeys/paths from a CSV file              |
| `--out-file <path>`   | `create_tx`, `create_token_tx`, `create_sbtc_tx`, `sign`, `broadcast` | Output JSON directly to file |
| `--api-key <path>`    | `broadcast`                                         | Use Hiro API key to avoid rate limits                 |

## Input Requirements and Formats

### Interactive Input Guidelines

When running commands without file flags, the CLI will prompt for inputs interactively. Here are the format requirements:

**Public Keys:**
- Format: Comma-separated list (no quotes needed)
- Example: `03abc123..., 03def456..., 03ghi789...`
- Spaces after commas are automatically trimmed

**Addresses:**
- Format: Standard Stacks addresses (C32 encoded)
- Example: `SP1234567890ABCDEF...` or `SM1234567890ABCDEF...`

**Amounts:**
- STX amounts: In microSTX (1 STX = 1,000,000 microSTX)
- sBTC amounts: In satoshis (1 sBTC = 100,000,000 satoshis)
- Token amounts: In the smallest unit of the token

**HD Derivation Paths:**
- Format: Standard BIP44/BIP32 path (no quotes needed)
- Examples: `m/5757'/0'/0/0/0`, `m/44'/5757'/0/0/0`
- Use single quotes around hardened derivation numbers

**Base64 Transactions:**
- Format: Long base64-encoded string (no quotes needed)
- Copy/paste the entire encoded transaction output from previous commands

**Optional Fields:**
- Press Enter to skip optional fields (fee, nonce, memo, etc.)
- Empty responses are treated as "not provided"

### File Input Requirements

**File Paths:**
- Use absolute or relative paths
- No quotes needed around file paths in command line arguments
- Example: `npm start -- create_tx --csv-inputs ./transactions.csv`

### Sample Interactive Sessions

**Creating an sBTC transaction:**
```
$ npm start -- create_sbtc_tx
From Address (C32)? SM1QPJHSGMWH4NM346XS8Q2KVAB0DWPGZ5YFE1YVF
From public keys (comma separate)? 03205eaf..., 0338e02b...
Required signers (number)? 2
To Address (C32)? SP11DP8H1Y9B7JYXC0T5AEZWENDWSSBCVKETSQ1R3
sBTC amount to send (in satoshis)? 100
microSTX fee (optional)? [Enter to skip]
Nonce (optional)? [Enter to skip]
Network (optional) [testnet/mainnet]? mainnet
Memo (optional)? [Enter to skip]
```

**Creating a multisig address with existing pubkeys (default):**
```
$ npm start -- make_multi
Use existing public keys? (y/n, default: y)? [Enter for default]
Public keys (comma separated)? 03205eaf..., 0338e02b..., 0312a456...
Required signers (number)? 2
Making a 2-of-3 multisig address from provided keys...
Pubkeys: 03205eaf..., 0338e02b..., 0312a456...
Addr: SM1QPJHSGMWH4NM346XS8Q2KVAB0DWPGZ5YFE1YVF
```

**Creating a multisig address by generating keys from Ledger:**
```
$ npm start -- make_multi
Use existing public keys? (y/n, default: y)? n
Potential signers (number)? 3
Required signers (number)? 2
Making a 2-of-3 multisig address...
Pubkeys: 03205eaf..., 0338e02b..., 0312a456...
Paths: m/5757'/0'/0/0/0, m/5757'/0'/0/0/1, m/5757'/0'/0/0/2
Addr: SM1QPJHSGMWH4NM346XS8Q2KVAB0DWPGZ5YFE1YVF
```

**Signing a transaction:**
```
$ npm start -- sign
Unsigned or partially signed transaction input (base64)? AAAAAAEEBW9p...
HD derivation path for 03205eaf... (empty to skip for this key)? m/5757'/0'/0/0/0
    *** Please check and approve signing on Ledger ***
HD derivation path for 0338e02b... (empty to skip for this key)? m/5757'/0'/0/0/1
    *** Please check and approve signing on Ledger ***
```

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

**Option A: Using existing public keys from multiple Ledger devices**
1. Collect public keys from each participant's Ledger device:
   ```sh
   npm start -- get_pub "m/5757'/0'/0/0/0"
   ```
   **Note:** Path argument requires quotes due to shell interpretation of single quotes
   
   If you are unsure of what `path` to use, try `"m/5757'/0'/0/0/0"` or `"m/44'/5757'/0/0/0"`

2. Create a multisig address from the collected pubkeys:
   ```sh
   npm start -- make_multi
   # Choose "y" when prompted for existing public keys
   ```

**Option B: Generate all keys from a single Ledger device (testing only)**
1. Create a multisig address by generating keys from connected Ledger:
   ```sh
   npm start -- make_multi
   # Choose "n" when prompted for existing public keys
   ```

3. Use any wallet to send funds to the generated address

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

### Single sBTC or SIP-10 Token Transaction Using User Input

There is a special built in function for sBTC but for other SIP-10 tokens, you need to specify the contract details:

1. Create a token transaction
   ```sh
   npm start -- create_token_tx
   ```
   or, in the case of sBTC specifically
   ```sh
   npm start -- create_sbtc_tx
   ```

3. For each required signature, sign with Ledger
   ```sh
   npm start -- sign
   ```

4. **[Optional]** Print transaction as JSON to check
   ```sh
   npm start -- decode
   ```

5. Broadcast transaction
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

### Bulk SIP-10 Token Transactions

1. Create token transactions from a CSV file and save outputs to file
   ```sh
   npm start -- create_token_tx --csv-inputs $CSV_INPUTS_FILE --out-file token_transactions.json
   ```
   or, for sBTC
   ```sh
   npm start -- create_sbtc_tx --csv-inputs $CSV_INPUTS_FILE --out-file sbtc_transactions.json
   ```

3. Sign the transactions and save outputs to file
   ```sh
   npm start -- sign --json-txs token_transactions.json --csv-keys $CSV_KEYS_FILE --out-file signed_token_transactions.json
   ```

4. Broadcast transactions
   ```sh
   npm start -- broadcast --json-txs signed_token_transactions.json --out-file token_broadcast_results.json
   ```

## Input File Formats

### STX & sBTC Transaction CSV Format
```csv
sender,recipient,amount,fee,nonce,network,memo,publicKeys/0,publicKeys/1,publicKeys/2,numSignatures
SP123...,SP456...,1000000,300,,mainnet,Hello,03abc...,03def...,03ghi...,2
```

### SIP-10 Token Transaction CSV Format
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
