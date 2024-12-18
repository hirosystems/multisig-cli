
//import SpecTransport from "@ledgerhq/hw-transport-node-speculos";
//import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";

import StxApp from "@zondax/ledger-blockstack";
import { LedgerError } from "@zondax/ledger-blockstack";
import Papa from 'papaparse';

import * as btc from "bitcoinjs-lib";
import * as C32 from "c32check";
import { createTransactionAuthField, TransactionAuthField, StacksTransaction } from "@stacks/transactions";
import * as StxTx from "@stacks/transactions";
import * as StxNet from "@stacks/network";
import { StacksNetworkName } from "@stacks/network";
import { bytesToHex } from '@stacks/common';
import * as fsPromises from 'node:fs/promises';
import * as base64 from 'base64-js';

// This will generate pubkeys using
//  the format: m/44'/5757'/0'/0/x
const XPUB_PATH = `m/44'/5757'/0'`;

// This will generate pubkeys using
//  the format: m/5757'/0'/0/0/x
const BTC_MULTISIG_SCRIPT_PATH = `m/5757'/0'/0`;

export interface MultisigTxInput {
  sender?: string  // Optional. Can be used to check address generation from pubkeys
  recipient: string
  fee?: string
  // If both `amount` and `amount_stx` are present, they are added together
  amount?: string // Amount in uSTX
  amount_stx?: string // Amount in STX
  publicKeys: string[]
  numSignatures: number
  nonce?: string
  network?: string
  memo?: string
}

// Export `StacksTransaction` as base64-encoded string
export function txEncode(tx: StacksTransaction): string {
  return base64.fromByteArray(tx.serialize());
}

// Import `StacksTransaction` from base64-encoded string
export function txDecode(b64: string): StacksTransaction {
  const tx = StxTx.deserializeTransaction(base64.toByteArray(b64));
  // This is a workaround because tx deserializes with extra null bytes
  // See https://github.com/hirosystems/stacks.js/issues/1575
  //(tx.payload as any).memo?.content?.replace(/^[\0]*/g, ''); // Trim leading null bytes
  //console.log(`content.length=${(tx.payload as any).memo.content.length}`);
  return tx;
}

// Export an object as base64-encoded string
export function b64Encode(obj: object): string {
  return window.btoa(JSON.stringify(obj));
}

// Import an object from base64-encoded string
export function b64Decode(b64: string): object {
  return JSON.parse(window.atob(b64));
}

// TODO: I don't know if something like this is already in Stacks.js (I couldn't find it), but it should be
export function parseNetworkName(input: string | undefined): StacksNetworkName | undefined {
  const allowedNames: StacksNetworkName[] = ['mainnet', 'testnet'];
  for (const n of allowedNames) {
    if (input?.toLowerCase().includes(n)) {
      return n;
    }
  }
  return undefined;
}

// Create new `StacksNetwork` for mainnet or testnet, depending on contents of transaction
export function getStacksNetworkFromTx(tx: StacksTransaction, opts?: Partial<StxNet.NetworkConfig> | undefined): StxNet.StacksNetwork {
  switch (tx.version) {
    case StxTx.TransactionVersion.Mainnet:
      return new StxNet.StacksMainnet(opts);
    case StxTx.TransactionVersion.Testnet:
      return new StxNet.StacksTestnet(opts);
    default:
      console.log(`Unknown value for \`tx.version\`: ${tx.version}. Assuming testnet`);
      return new StxNet.StacksTestnet(opts);
  }
}

export async function getPubKey(app: StxApp, path: string): Promise<string> {
  const amt = await app.getAddressAndPubKey(path, StxTx.AddressVersion.TestnetSingleSig);
  return amt.publicKey.toString('hex');
}

export async function getPubKeySingleSigStandardIndex(app: StxApp, index: number): Promise<string> {
  const path = `${XPUB_PATH}/0/${index}`;
  return getPubKey(app, path);
}

export async function getPubKeyMultisigStandardIndex(app: StxApp, index: number): Promise<{ pubkey: string, path: string }> {
  const path = `${BTC_MULTISIG_SCRIPT_PATH}/0/${index}`;
  return { pubkey: await getPubKey(app, path), path };
}

// Wrapper around any cached objects
export const cache = {
  nonces: new Map<string, bigint>,

  // Avoid duplicating `getNonce()` calls to the network, which will give incorrect results if generating multiple txs from a single address
  async getNonce(addr: string): Promise<bigint> {
    let nonce;
    const cachedNonce = this.nonces.get(addr);
    if (cachedNonce === undefined) {
      nonce = await StxTx.getNonce(addr);
    } else {
      nonce = cachedNonce + 1n;
    }
    this.nonces.set(addr, nonce)
    return nonce;
  },

  // Clear `this`
  clear() {
    this.nonces.clear()
  }
};

export async function generateMultiSigAddr(app: StxApp, signers: number, requiredSignatures: number) {
  // Get pubkey/path pairs from device
  const keypaths = [];
  for (let i = 0; i < signers; i++) {
    const kp = await getPubKeyMultisigStandardIndex(app, i);
    keypaths.push(kp);
  }

  // Sort by pubkey
  keypaths.sort((a, b) => a.pubkey.localeCompare(b.pubkey));
  const pubkeys = keypaths.map(kp => kp.pubkey);
  const paths = keypaths.map(kp => kp.path);

  console.log(`Making a ${requiredSignatures}-of-${keypaths.length} multisig address...`);
  console.log(`Pubkeys: ${pubkeys.join(', ')}`);
  console.log(`Paths: ${paths.join(', ')}`);

  return makeMultiSigAddr(pubkeys, requiredSignatures);
}

export function makeMultiSigAddrRaw(pubkeys: string[], required: number): string {
  const authorizedPKs = pubkeys.slice().map(k => Buffer.from(k, 'hex'));
  const redeem = btc.payments.p2ms({ m: required, pubkeys: authorizedPKs });
  const btcAddr = btc.payments.p2sh({ redeem }).address;
  if (!btcAddr) {
    throw Error(`Failed to construct BTC address from pubkeys`);
  }
  return btcAddr;
}

export function makeMultiSigAddr(pubkeys: string[], required: number): string {
  const btcAddr = makeMultiSigAddrRaw(pubkeys, required);
  const c32Addr = C32.b58ToC32(btcAddr);
  return c32Addr;
}

// Check that pubkeys match sender address and return in correct order
export function checkAddressPubKeyMatch(pubkeys: string[], required: number, address: string): string[] {
  // first try in sorted order
  let authorizedPKs = pubkeys.slice().sort().map(k => Buffer.from(k, 'hex'));
  let redeem = btc.payments.p2ms({ m: required, pubkeys: authorizedPKs });
  let btcAddr = btc.payments.p2sh({ redeem }).address;
  if (!btcAddr) {
    throw Error(`Failed to construct BTC address from pubkeys`);
  }
  const c32Addr1 = C32.b58ToC32(btcAddr);
  if (c32Addr1 === address) {
    return authorizedPKs.map(k => k.toString('hex'));
  }

  // try in order given
  authorizedPKs = pubkeys.slice().map(k => Buffer.from(k, 'hex'));
  redeem = btc.payments.p2ms({ m: required, pubkeys: authorizedPKs });
  btcAddr = btc.payments.p2sh({ redeem }).address;
  if (!btcAddr) {
    throw Error(`Failed to construct BTC address from pubkeys`);
  }
  const c32Addr2 = C32.b58ToC32(btcAddr);
  if (c32Addr2 === address) {
    return authorizedPKs.map(k => k.toString('hex'));
  }

  throw `Public keys did not match expected address. Expected ${address}, but pubkeys correspond to ${c32Addr1} or ${c32Addr2}`;
}

/// Builds spending condition fields out of an array of public key hex strings
function makeSpendingConditionFields(keys: string[]): TransactionAuthField[] {
  return keys
    .map(StxTx.createStacksPublicKey)
    .map(key => StxTx.createTransactionAuthField(StxTx.PubKeyEncoding.Compressed, key));
}

function setMultisigTransactionSpendingConditionFields(tx: StacksTransaction, fields: TransactionAuthField[]) {
  if (!tx.auth.spendingCondition) {
    throw new Error(`Multisig transaction cannot be finalized: did not have enough information in multisig data to initialize spending condition`);
  }
  if (StxTx.isSingleSig(tx.auth.spendingCondition)) {
    throw new Error(`Multisig transaction cannot be finalized: supplied information initialized a singlesig transaction`);
  }
  (tx.auth.spendingCondition as StxTx.MultiSigSpendingCondition).fields = fields;
}

// Create transactions from file path
export async function makeKeyPathMapFromCSVFile(file: string): Promise<Map<string, string>> {
  const data = await fsPromises.readFile(file, { encoding: 'utf8' });
  return makeKeyPathMapFromCSVText(data);
}

// Create transactions from raw string data (must be JSON array of `MultisigTxInput`)
export function makeKeyPathMapFromCSVText(text: string): Map<string, string> {
  const { data, errors } = Papa.parse(text, {
    delimiter: ',',
    header: true,
    skipEmptyLines: true
  });

  if (errors.length) {
    console.dir(errors, {depth: null, colors: true});
    throw Error('Errors parsing CSV data');
  }

  if (!Array.isArray(data)) {
    throw Error('Data is not an array');
  }

  interface Line {
    key: string,
    path: string,
  }

  const keyPaths = new Map<string, string>();
  for (const line of data) {
    const l = line as Line;
    keyPaths.set(l.key, l.path);
  }
  return keyPaths;
}

// Create transactions from file path
export async function makeTxInputsFromCSVFile(file: string): Promise<MultisigTxInput[]> {
  const data = await fsPromises.readFile(file, { encoding: 'utf8' });
  return makeTxInputsFromCSVText(data);
}

// Create transactions from raw string data (must be JSON array of `MultisigTxInput`)
export function makeTxInputsFromCSVText(text: string): MultisigTxInput[] {
  const { data, errors } = Papa.parse(text, {
    delimiter: ',',
    header: true,
    skipEmptyLines: true
  });

  if (errors.length) {
    console.dir(errors, {depth: null, colors: true});
    throw Error('Errors parsing CSV data');
  }

  if (!Array.isArray(data)) {
    throw Error('Data is not array');
  }

  // Everything is parsed as strings. Need to fix up the data here...
  data.forEach((line: any) => {
    Object.keys(line).forEach(k => {
      const v = line[k];
      if (v === undefined || v === null  || v === '') {
        // Delete null, undefined, or empty string fields
        delete line[k];
      } else if (k.includes('/')) {
        // Build arrays out of keys with '/'
        const [ arr, index, ...rest ] = k.split('/');
        if (rest.length) {
          throw Error('Multidimensional arrays not supported');
        }
        const i = parseInt(index);
        line[arr] ??= [];
        line[arr][i] = v;
        delete line[k];
      }
    });

    // Conversions
    line['numSignatures'] = parseInt(line['numSignatures']);
  });
  //console.dir(data, {depth: null, colors: true});

  return validateTxInputs(data as object[]);
}

// Create transactions from file path
export async function makeTxInputsFromFile(file: string): Promise<MultisigTxInput[]> {
  const data = await fsPromises.readFile(file, { encoding: 'utf8' });
  return makeTxInputsFromText(data);
}

// Create transactions from raw string data (must be JSON array of `MultisigTxInput`)
export function makeTxInputsFromText(text: string): MultisigTxInput[] {
  const data = JSON.parse(text);
  return validateTxInputs(data);
}

export function validateTxInputs(data: object[]): MultisigTxInput[] {
  const errorPrefix = 'Transaction input validation failed';
  const inputs = data as MultisigTxInput[];

  if (!Array.isArray(data)) {
    throw Error(`${errorPrefix}: Data is not an array`);
  }
  for (const i in inputs) {
    const input = inputs[i];
    const t = typeof input;
    if (t !== 'object') {
      throw Error(`${errorPrefix}: Element at index ${i} is of type '${t}'`);
    }
    if (typeof input.recipient !== 'string') {
      throw Error(`${errorPrefix}: Property 'recipient' of element ${i} not valid: ${input.recipient}'`);
    }
    if (input.amount && typeof input.amount !== 'string') {
      throw Error(`${errorPrefix}: Property 'amount' of element ${i} not valid: ${input.amount}'`);
    }
    if (input.amount_stx && typeof input.amount_stx !== 'string') {
      throw Error(`${errorPrefix}: Property 'amount_stx' of element ${i} not valid: ${input.amount_stx}'`);
    }
    // Must contain at least one, can contain both
    if (!input.amount && !input.amount_stx) {
      throw Error(`${errorPrefix}: Property 'amount' and/or 'amount_stx' must be defined'`);
    }
    if (!Array.isArray(input.publicKeys)) {
      throw Error(`${errorPrefix}: Property 'publicKeys' of element ${i} not valid: ${input.publicKeys}'`);
    }
    for (const e of input.publicKeys) {
      if (typeof e !== 'string') {
        throw Error(`${errorPrefix}: Property 'publicKeys' of element ${i} contains invalid element: ${e}'`);
      }
    }
    if (typeof input.numSignatures !== 'number') {
      throw Error(`${errorPrefix}: Property 'numSignatures' of element ${i} not valid: ${input.numSignatures}'`);
    }
    if (input.fee && typeof input.fee !== 'string') {
      throw Error(`${errorPrefix}: Property 'fee' of element ${i} not valid: ${input.fee}'`);
    }
    if (input.nonce && typeof input.nonce !== 'string') {
      throw Error(`${errorPrefix}: Property 'nonce' of element ${i} not valid: ${input.nonce}'`);
    }
    if (input.sender && typeof input.sender !== 'string') {
      throw Error(`${errorPrefix}: Property 'sender' of element ${i} not valid: ${input.sender}'`);
    }
    if (input.memo && typeof input.memo !== 'string') {
      throw Error(`${errorPrefix}: Property 'memo' of element ${i} not valid: ${input.memo}'`);
    }
    // TODO: Network
  }

  return data as MultisigTxInput[];
}

// Create transactions from `MultisigTxInput[]`
export async function makeStxTokenTransfers(inputs: MultisigTxInput[]): Promise<StacksTransaction[]> {
  // Use Promise.all to process inputs in parallel
  return await Promise.all(inputs.map(makeStxTokenTransfer));
}

/// Builds an unsigned transfer out of a multisig data serialization
export async function makeStxTokenTransfer(input: MultisigTxInput): Promise<StacksTransaction> {
  let { publicKeys } = input;
  const { sender, recipient, numSignatures, memo } = input;
  const anchorMode = StxTx.AnchorMode.Any;

  // Calculate amount in μSTX
  let amount = 0n;
  if (input.amount) {
    amount += BigInt(input.amount);
  }
  if (input.amount_stx) {
    amount += BigInt(input.amount_stx) * 1_000_000n;
  }

  // Validate sender address if present
  // This may re-order publicKeys to match address
  if (sender) {
    publicKeys = checkAddressPubKeyMatch(publicKeys, numSignatures, sender);
  }

  const options: StxTx.UnsignedMultiSigTokenTransferOptions = { anchorMode, amount, numSignatures, publicKeys, recipient, memo };

  // Conditional fields
  if (input.nonce) {
    options.nonce = BigInt(input.nonce);
  } else {
    // Shouldn't Stacks.js automatically set nonce if not given?
    const addr = makeMultiSigAddr(publicKeys, numSignatures);
    options.nonce = await cache.getNonce(addr);
  }

  if (input.fee) {
    options.fee = BigInt(input.fee);
  }

  const network = parseNetworkName(input.network);
  if (network) {
    options.network = network;
  }

  // Always use SIP-027 (non-sequential) transactions. No reason to use legacy (sequential) type
  options.useNonSequentialMultiSig = true;

  const unsignedTx = await StxTx.makeUnsignedSTXTokenTransfer(options);

  // Set public keys in auth fields
  // TODO: Is this necessary to set auth fields or already done by `makeUnsignedSTXTokenTransfer()`
  const authFields = makeSpendingConditionFields(publicKeys);
  setMultisigTransactionSpendingConditionFields(unsignedTx, authFields);

  return unsignedTx;
}

export interface AuthFieldInfo {
  authFields: number,
  pubkeys: string[],
  signatures: number,
  signaturesRequired: number,
}

export function getAuthFieldInfo(tx: StacksTransaction): AuthFieldInfo {
  let authFields = 0;
  let signatures = 0;
  const pubkeys: string[] = [];

  const spendingCondition = tx.auth.spendingCondition as StxTx.MultiSigSpendingCondition;
  spendingCondition.fields.forEach(f => {
    authFields += 1;
    const type = f.contents.type;
    switch (type) {
    case StxTx.StacksMessageType.PublicKey:
      pubkeys.push(bytesToHex(f.contents.data));
      break;
    case StxTx.StacksMessageType.MessageSignature:
      signatures += 1;
      break;
    default:
      console.error(`Unknown auth field type: ${type}`);
    }
  });

  return {
    authFields,
    pubkeys,
    signatures,
    signaturesRequired: spendingCondition.signaturesRequired,
  };
}

// Get signers after given pubkey that have signed transaction
export function getSignersAfter(pubkey: string, authFields: TransactionAuthField[]): number[] | null {
  // Find index of pubkey in auth fields
  const pkIndex = authFields
    .findIndex(f => f.contents.type === StxTx.StacksMessageType.PublicKey && bytesToHex(f.contents.data) === pubkey);

  // pubkey isn't in signer set or has already signed
  if (pkIndex < 0) {
    return null;
  }

  // Find all signatures after pubkey
  return authFields
    .map((field, index) => ({ field, index })) // Keep track of index for each authField
    .slice(pkIndex + 1) // Ignore field with pubkey and those before it
    .filter(e => e.field.contents.type === StxTx.StacksMessageType.MessageSignature)
    .map(e => e.index);
}

// Create transactions from file path
export async function encodedTxsFromFile(file: string): Promise<string[]> {
  const data = await fsPromises.readFile(file, { encoding: 'utf8' });
  return encodedTxsFromText(data);
}

// Create transactions from raw string data (must be JSON array of `MultisigTxInput`)
export function encodedTxsFromText(str: string): string[] {
  const errorPrefix = 'Expected array of base64-encoded strings';
  const txsEncoded = JSON.parse(str);

  // Do some basic type checking
  if (!Array.isArray(txsEncoded)) {
    throw Error(`${errorPrefix}: Data is not an array`);
  }
  for (const i in txsEncoded) {
    const tx = txsEncoded[i];
    const t = typeof tx;
    if (t !== 'string') {
      throw Error(`${errorPrefix}: Found '${t}' at index ${i}`);
    }
  }

  return txsEncoded as string[];
}

export async function ledgerSignMultisigTx(app: StxApp, path: string, tx: StacksTransaction): Promise<StacksTransaction> {
  const pubkey = await getPubKey(app, path);

  // Check transaction is correct type
  const spendingCondition = tx.auth.spendingCondition as StxTx.MultiSigSpendingCondition;
  if (StxTx.isSingleSig(spendingCondition)) {
    throw new Error(`Tx has single signature spending condition`);
  }

  const authFields = spendingCondition.fields;
  if (!authFields) {
    throw new Error(`Tx has no auth fields, not a valid multisig transaction`);
  }

  // Match pubkey in auth fields
  const pubkeys = authFields.map(f => {
    if (f.contents.type === StxTx.StacksMessageType.PublicKey) {
      return bytesToHex(f.contents.data);
    } else {
      return null;
    }
  });
  const index = pubkeys.indexOf(pubkey);

  if (index < 0) {
    throw new Error(`Pubkey ${pubkey} not found in spending auth fields: ${pubkeys}`);
  }

  const signingBuffer = Buffer.from(tx.serialize());
  const resp = await app.sign(path, signingBuffer);

  if (resp.returnCode !== LedgerError.NoErrors) {
    console.log(resp);
    throw new Error('Ledger responded with errors');
  }

  const signature = StxTx.createMessageSignature(resp.signatureVRS.toString('hex'));
  authFields[index] = createTransactionAuthField(StxTx.PubKeyEncoding.Compressed, signature);

  return tx;
}

export async function ledgerSignTx(app: StxApp, path: string, partialFields: TransactionAuthField[], unsignedTx: Buffer, prevSigHash?: string) {
  const pubkey = await getPubKey(app, path);

  const outFields = partialFields.slice();
  const pubkeys = partialFields
    .map(x => {
      console.log(x);
      if (x.contents.type === StxTx.StacksMessageType.PublicKey) {
        return bytesToHex(x.contents.data);
      } else {
        return null;
      }
    });

  if (pubkeys.indexOf(pubkey) < 0) {
    throw new Error(`Pubkey ${pubkey} not found in partial tx fields: ${partialFields}`);
  }

  const index = pubkeys.indexOf(pubkey);

  let resp;
  if (prevSigHash) {
    const txBuffer = unsignedTx.slice();
    const postSigHashBuffer = Buffer.from(prevSigHash, 'hex');
    const pkEnc = Buffer.alloc(1, StxTx.PubKeyEncoding.Compressed);
    const prev_signer_field = partialFields[index - 1];
    if (prev_signer_field.contents.type !== StxTx.StacksMessageType.MessageSignature) {
      throw new Error(`Previous sighash was supplied, but previous signer was not included in the transaction's auth fields`);
    }
    const prev_signer = Buffer.from(prev_signer_field.contents.data, 'hex');
    const msg_array = [txBuffer, postSigHashBuffer, pkEnc, prev_signer];
    resp = await app.sign(path, Buffer.concat(msg_array));
  } else {
    resp = await app.sign(path, unsignedTx.slice());
  }

  if (resp.returnCode !== LedgerError.NoErrors) {
    console.log(resp);
    throw new Error('Ledger responded with errors');
  }

  const next_sighash = resp.postSignHash.toString("hex");

  console.log(next_sighash);

  outFields[index] = StxTx.createTransactionAuthField(
    StxTx.PubKeyEncoding.Compressed,
    StxTx.createMessageSignature(
      resp.signatureVRS.toString('hex')
    ));
  return { outFields, next_sighash };
}

export async function generateMultiSignedTx(): Promise<StacksTransaction> {
  const privkeys = [
    'dd7229314db5d50122cd8d4ff8975f57317f54c946cd233d8d35f5b616fe961e01',
    '119a851bd1201b93e6477a0a9c7d29515735530df92ab265166ca3da119f803501',
    '22d45b79bda06915c5d1a98da577089763b6c660304d3919e50797352dc6722f01',
  ];

  //const privKeys = privkeys.map(StxTx.createStacksPrivateKey);

  const pubkeys = [
    '03827ffa27ad5af481203d4cf5654cd20312398fa92084ff76e4b4dffddafe1059',
    '03a9d11f6d4102ed323740f95668d6f206c5b5cbc5ce5c7028ceba1736fbbd6861',
    '0205132dbd1270f66adaf43723940a98be6331abe95bfa53838815bf214a5a2150'
  ];

  //console.log(pubkeys);
  //console.log(makeMultiSigAddr(pubkeys, 2));

  const transaction = await StxTx.makeUnsignedSTXTokenTransfer({
    fee: 300n,
    numSignatures: 2,
    publicKeys: pubkeys,
    amount: 1000n,
    recipient: "SP000000000000000000002Q6VF78",
    anchorMode: StxTx.AnchorMode.Any,
  });

  const signer = new StxTx.TransactionSigner(transaction);
  signer.checkOversign = false;
  signer.appendOrigin(StxTx.pubKeyfromPrivKey(privkeys[0]));
  signer.signOrigin(StxTx.createStacksPrivateKey(privkeys[1]));
  signer.signOrigin(StxTx.createStacksPrivateKey(privkeys[2]));

  return transaction;
}

export async function generateMultiUnsignedTx() {
  const pubkeys = [
    '03827ffa27ad5af481203d4cf5654cd20312398fa92084ff76e4b4dffddafe1059',
    '03a9d11f6d4102ed323740f95668d6f206c5b5cbc5ce5c7028ceba1736fbbd6861',
    '0205132dbd1270f66adaf43723940a98be6331abe95bfa53838815bf214a5a2150'
  ];

  console.log(pubkeys);
  console.log(makeMultiSigAddr(pubkeys, 2));

  const unsignedTx = await StxTx.makeUnsignedSTXTokenTransfer({
    fee: 300n,
    numSignatures: 2,
    publicKeys: pubkeys,
    amount: 1000n,
    recipient: "SP000000000000000000002Q6VF78",
    anchorMode: StxTx.AnchorMode.Any,
  });

  const partialFields =
    pubkeys.map((x) => {
      return StxTx.createTransactionAuthField(StxTx.PubKeyEncoding.Compressed, StxTx.createStacksPublicKey(x));
    });

  return { unsignedTx, pubkeys: partialFields };
}
