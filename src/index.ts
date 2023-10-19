
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import StxApp from "@zondax/ledger-blockstack";
import readline from "readline";
import * as StxTx from "@stacks/transactions";

import { MultisigData, makeMultiSigAddr, makeStxTokenTransferFrom, txDecode, txEncode, ledgerSignMultisigTx, getPubKey, getAuthFieldInfo, generateMultiSigAddr, parseNetworkName } from "./lib";

async function readInput(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer: string = await new Promise(resolve => {
    rl.question(`${query}? `, answer => resolve(answer))
  });

  rl.close();

  return answer.trim();
}

async function main(args: string[]) {
  //let transport = await SpecTransport.open({ apduPort: 40000 });
  const transport = await TransportNodeHid.create();

  if (args[0] == "get_pub") {
    const app = new StxApp(transport);
    const path = args[1];
    if (!path) {
      throw new Error("Must supply path as second argument");
    }
    const pubkey = await getPubKey(app, path);
    console.log(`Pub: ${pubkey} @ ${path}`);
  } else if (args[0] == "decode") {
    // Decode and print transaction
    const inputPayload = await readInput("Transaction input (base64)");
    const tx = txDecode(inputPayload) as StxTx.StacksTransaction;
    console.dir(tx, {depth: null, colors: true})
  } else if (args[0] == "make_multi") {
    const app = new StxApp(transport);
    const addr = await generateMultiSigAddr(app);
    console.log(`Addr: ${addr}`);
  } else if (args[0] == "create_tx") {
    const fromAddr = await readInput("From Address (C32)");
    const fromPKsHex = (await readInput("From public keys (comma separate)")).split(',').map(x => x.trim());
    const numSignatures = parseInt(await readInput("Required signers (number)"));
    const recipient = await readInput("To Address (C32)");
    const amount = await readInput("microSTX to send");
    const fee = await readInput("microSTX fee");
    const nonce = parseInt(await readInput("Nonce (optional)")) || 0;
    const network = parseNetworkName(await readInput("Network (testnet/mainnet)"), 'mainnet');

    const spendingFields = fromPKsHex.map(x => ({ publicKey: x }));
    const generatedMultiSigAddress = makeMultiSigAddr(fromPKsHex, numSignatures);

    if (generatedMultiSigAddress !== fromAddr) {
        const message = `Public keys, required signers do not match expected address: expected=${fromAddr}, generated=${generatedMultiSigAddress}`;
        throw new Error(message);
    }

    // Contains tx + metadata
    const multisigData: MultisigData = {
        tx: {
            fee,
            amount,
            numSignatures,
            recipient,
            nonce,
            network
        },
        spendingFields,
    };

    const tx = await makeStxTokenTransferFrom(multisigData);

    const encoded = txEncode(tx);
    console.log(`Unsigned multisig transaction: ${encoded}`)
  } else if (args[0] == "sign") {
    const app = new StxApp(transport);
    const inputPayload = await readInput("Unsigned or partially signed transaction input (base64)");
    const hdPath = await readInput("Signer path (HD derivation path)");

    const tx = txDecode(inputPayload) as StxTx.StacksTransaction;
    console.log("    *** Please check and approve signing on Ledger ***");
    const signed_tx = await ledgerSignMultisigTx(app, hdPath, tx);
    const info = getAuthFieldInfo(tx);
    const encoded = txEncode(signed_tx);
    console.log(`Signed payload (${info.signatures}/${info.signaturesRequired} required signatures): ${encoded}`)
  } else if (args[0] == "broadcast") {
    const inputPayload = await readInput("Signed transaction input (base64)");
    const tx = txDecode(inputPayload) as StxTx.StacksTransaction;
    const res = await StxTx.broadcastTransaction(tx);

    console.dir(res, {depth: null, colors: true});
  }

  await transport.close();
}

const inputs = process.argv.slice(2);

main(inputs)
  .then(() => console.log(""))
