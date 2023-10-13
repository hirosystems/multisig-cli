import 'bootstrap/dist/css/bootstrap.min.css';
export * from './lib';

import { MultisigData, getAuthFieldInfo, base64Deserialize, base64Serialize, makeMultiSigAddr, ledgerSignMultisigTx, makeStxTokenTransferFrom } from './lib';
import StxApp from "@zondax/ledger-blockstack";
import LedgerTransportWeb from '@ledgerhq/hw-transport-webhid';
import BlockstackApp from '@zondax/ledger-blockstack';

import * as StxTx from "@stacks/transactions";

function getInputElement(id: string): string {
    return (document.getElementById(id)! as HTMLInputElement).value.trim()
}

export function displayMessage(name: string, message: string, title: string) {
    const container = document.getElementById(name)!;
    container.classList.remove('invisible');
    const displayArea = document.getElementById(`${name}-message`)!;
    displayArea.innerHTML = message
  
    if (title) {
      const titleArea = document.getElementById(`${name}-title`)!;
      titleArea.innerHTML = title
    }
}

let LEDGER_APP_CONN: undefined | BlockstackApp = undefined;

export async function connectLedgerApp() {
    if (!LEDGER_APP_CONN) {
        const transport = await LedgerTransportWeb.create();
        const app = new StxApp(transport);
        LEDGER_APP_CONN = app;
        return app;
    } else {
        return LEDGER_APP_CONN;
    }
}

export async function sign() {
    try {
        const app = await connectLedgerApp();
        const inputPayload = getInputElement('transact-input');
        const hdPath = getInputElement('transact-path');

        const tx = base64Deserialize(inputPayload) as StxTx.StacksTransaction;
        const signed_tx = await ledgerSignMultisigTx(app, hdPath, tx);
        const info = getAuthFieldInfo(tx);
        let encoded = base64Serialize(signed_tx);
        displayMessage('tx', `Signed payload (${info.signatures}/${info.signaturesRequired} required signatures): <br/> <br/> ${encoded}`, 'Signed Transaction')
    } catch(e: any) {
        displayMessage('tx', e.toString(), "Error signing transaction");
        throw e;
    }
}

export async function generate_transfer() {
    const fromAddr = getInputElement('from-address');
    const fromPKsHex = getInputElement('from-pubkeys').split(',').map(x => x.trim()).sort();
    const requiredSigners = parseInt(getInputElement('from-n'));
    const toAddress = getInputElement('to-address');
    const toSend = getInputElement('stacks-send');
    const fee = getInputElement('stacks-fee');
    const spendingFields = fromPKsHex.map(x => ({ publicKey: x }));

    const generatedMultiSigAddress = makeMultiSigAddr(fromPKsHex, requiredSigners);

    if (generatedMultiSigAddress !== fromAddr) {
        const message = `Public keys, required signers do not match expected address: expected=${fromAddr}, generated=${generatedMultiSigAddress}`;
        displayMessage('tx', message, "Error generating transaction");
        throw new Error(message);
    }

    let multisigData: MultisigData = {
        tx: {
            fee,
            amount: toSend,
            numSignatures: requiredSigners,
            recipient: toAddress,
            nonce: 0, // TODO: Allow input for this
        },
        spendingFields,
    };

    const tx = await makeStxTokenTransferFrom(multisigData);

    let encoded = base64Serialize(tx);
    displayMessage('tx', `Payload: <br/> <br/> ${encoded}`, 'Unsigned Transaction')
}

