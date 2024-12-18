import { describe, expect, it, test } from 'vitest';

import * as lib from "../src/lib";
import * as C32 from "c32check";
import * as StxTx from "@stacks/transactions";
import { bytesToHex } from '@stacks/common';

test('vitest running', () => {
  expect(true).toBe(true);
});

describe('`StacksTransaction`', async () => {
  test('Binary serialize/deserialize', async () => {
    const tx = await lib.generateMultiSignedTx();
    const tx_encoded = tx.serialize();
    const tx_decoded = StxTx.deserializeTransaction(tx_encoded);

    expect(tx_decoded).toEqual(tx);

    // Check object methods
    expect(tx_decoded.serialize).toBeDefined();
    expect(tx_decoded.txid).toBeDefined();
    expect(tx_decoded.verifyOrigin).toBeDefined();
  });

  test('Base64 encode/decode', async () => {
    const tx = await lib.generateMultiSignedTx();
    const tx_encoded = lib.txEncode(tx);
    const tx_decoded = lib.txDecode(tx_encoded);

    expect(tx_decoded).toEqual(tx);

    // Check object methods
    expect(tx_decoded.serialize).toBeDefined();
    expect(tx_decoded.txid).toBeDefined();
    expect(tx_decoded.verifyOrigin).toBeDefined();
  });
});

describe('Multisig addresses', () => {
  test('Generation', () => {
    const pubkeys = [
      "02b30fafab3a12372c5d150d567034f37d60a91168009a779498168b0e9d8ec7f2", // 1
      "03ce61f1d155738a5e434fc8a61c3e104f891d1ec71576e8ad85abb68b34670d35", // 2
      "03ef2340518b5867b23598a9cf74611f8b98064f7d55cdb8c107c67b5efcbc5c77", // 3
    ];
    const c32_address = lib.makeMultiSigAddr(pubkeys, 2);
    // This Hash160 encodes as SM2R12RQCV9SCAZPM37VSCVP4X3EQK1Y70KCV7EDE
    //const c32_expected = "SM2R12RQCV9SCAZPM37VSCVP4X3EQK1Y70KCV7EDE";
    const c32_expected = C32.c32address(StxTx.AddressVersion.MainnetMultiSig, "b01162ecda72c57ed419f7966ec4e8dd7987c704");
    expect(c32_address).toEqual(c32_expected);
  });

  describe('Validation', () => {
    it('Should return valid for pubkeys in any order', () => {
      //const address = C32.c32address(StxTx.AddressVersion.MainnetMultiSig, "b01162ecda72c57ed419f7966ec4e8dd7987c704");
      const address = "SM2R12RQCV9SCAZPM37VSCVP4X3EQK1Y70KCV7EDE";
      const pubkeys = [
        "02b30fafab3a12372c5d150d567034f37d60a91168009a779498168b0e9d8ec7f2", // 1
        "03ce61f1d155738a5e434fc8a61c3e104f891d1ec71576e8ad85abb68b34670d35", // 2
        "03ef2340518b5867b23598a9cf74611f8b98064f7d55cdb8c107c67b5efcbc5c77", // 3
      ];
      lib.checkAddressPubKeyMatch(pubkeys, 2, address);

      // Should work with wrong ordering also
      const pubkeysWrongOrder = [
        "03ce61f1d155738a5e434fc8a61c3e104f891d1ec71576e8ad85abb68b34670d35", // 2
        "03ef2340518b5867b23598a9cf74611f8b98064f7d55cdb8c107c67b5efcbc5c77", // 3
        "02b30fafab3a12372c5d150d567034f37d60a91168009a779498168b0e9d8ec7f2", // 1
      ];
      const pubkeysReordered = lib.checkAddressPubKeyMatch(pubkeysWrongOrder, 2, address);

      // Should return keys in order used to generate address
      expect(pubkeysReordered).toEqual(pubkeys);
    });

    it('Should fail if passed wrong number of signatures required', () => {
      //const address = C32.c32address(StxTx.AddressVersion.MainnetMultiSig, "b01162ecda72c57ed419f7966ec4e8dd7987c704");
      const address = "SM2R12RQCV9SCAZPM37VSCVP4X3EQK1Y70KCV7EDE";
      const pubkeys = [
        "02b30fafab3a12372c5d150d567034f37d60a91168009a779498168b0e9d8ec7f2", // 1
        "03ce61f1d155738a5e434fc8a61c3e104f891d1ec71576e8ad85abb68b34670d35", // 2
        "03ef2340518b5867b23598a9cf74611f8b98064f7d55cdb8c107c67b5efcbc5c77", // 3
      ];
      expect(() => lib.checkAddressPubKeyMatch(pubkeys, 1, address)).toThrowError();
    });
  });
});

describe('Caching', async () => {
  test('Nonce caching', async () => {
    // Must use an address here not used in other unit tests, so we know we have empty cache
    const addr = "SP2P5AC6RZ0NJWXRE15RSCDSA3T3A2R4QCRW3T5RX";

    // Should be no caching in `StxTx.getNonce()`
    const initialNonce = await StxTx.getNonce(addr);
    const initialNonceAgain = await StxTx.getNonce(addr);
    expect(initialNonce).toStrictEqual(initialNonceAgain);

    // Sucessive calls to `getNonceCached()` should return incrementing nonces
    for (let i=0n; i < 10n; i++) {
      const nonce = await lib.cache.getNonce(addr);
      expect(nonce).toStrictEqual(initialNonce + i);
    }
  });
});

describe('Helper functions', async () => {
  describe('makeKeyPathMapFromCSVFile()', async () => {
    const keyPaths = await lib.makeKeyPathMapFromCSVFile('./tests/fixtures/key_path_map.csv');

    it('Should return correct path for valid key', () => {
      const path = keyPaths.get('02994ea56a1da2683c463f896d12ee0a3c33972836a8e0d6ee430660c6b22a496b');
      expect(path).toEqual(`m/5757'/0'/0/0/1`);
    });

    it('Should fail on invalid key', () => {
      const path = keyPaths.get('03ef2340518b5867b23598a9cf74611f8b98064f7d55cdb8c107c67b5efcbc5c77');
      expect(path).toBeUndefined();
    });
  });

  test('getAuthFieldInfo()', async () => {
    const tx = await lib.generateMultiSignedTx();
    const info = lib.getAuthFieldInfo(tx);
    expect(info).toEqual({
      authFields: 3,
      pubkeys: ['03827ffa27ad5af481203d4cf5654cd20312398fa92084ff76e4b4dffddafe1059'],
      signatures: 2,
      signaturesRequired: 2,
    });
  });

  describe('getSignersAfter()', () => {
    // Base64-encoded 2-of-3 multisig transaction already signed by second signer
    const txBase64 = 'AAAAAAEEAYPnJCUxoDXGkpmxQDbD2sc51L8zAAAAAAAAAAAAAAAAAAAD6AAAAAMAAplOpWodomg8Rj+JbRLuCjwzlyg2qODW7kMGYMayKklrAgF8BkTyU8YMrmGEMvZc2pIl1qLR2eCCxTDt/LKjZDplUjnPIgiVbvVmmxI9sB6uNCzttk16eZYfTNZEOLe1jdMfAAPEYWY3OqVnUPNjUnLxZ4gzriFjMgucnhRkh9GY0Upb4QACAwIAAAAAAAUUg+ckJTGgNcaSmbFANsPaxznUvzMAAAAAAAGGoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    // NOTE: This test uses different keypairs than others
    const publicKeys = [
      "02994ea56a1da2683c463f896d12ee0a3c33972836a8e0d6ee430660c6b22a496b", // 1
      "0386c9d0ff45514104ce84d301b90911de76f750184ca1fc2f0b5303e83db9640c", // 2
      "03c46166373aa56750f3635272f1678833ae2163320b9c9e146487d198d14a5be1", // 3
    ];
    const tx = lib.txDecode(txBase64);
    const spendingCondition = tx.auth.spendingCondition as StxTx.MultiSigSpendingCondition;
    const authFields = spendingCondition.fields;

    it('Input transaction should have 3 auth fields', () => {
      expect(authFields.length).toEqual(3);
    });

    it('Should return index of third field for first pubkey', () => {
      const sigsAfter = lib.getSignersAfter(publicKeys[0], authFields);
      expect(sigsAfter).toBeDefined();
      expect(sigsAfter!.length).toEqual(1);
      expect(sigsAfter![0]).toEqual(1);
    });

    it('Should return `null` for second pubkey (which already signed)', () => {
      const sigsAfter = lib.getSignersAfter(publicKeys[1], authFields);
      expect(sigsAfter).toBeNull();
    });

    it('Should return empty array for third pubkey', () => {
      const sigsAfter = lib.getSignersAfter(publicKeys[2], authFields);
      expect(sigsAfter).toBeDefined();
      expect(sigsAfter!.length).toEqual(0);
    });

    it('Should return `null` for pubkey not in signer set', () => {
      const sigsAfter = lib.getSignersAfter(
        '02b30fafab3a12372c5d150d567034f37d60a91168009a779498168b0e9d8ec7f2',
        authFields
      );
      expect(sigsAfter).toBeNull();
    });
  });
});

describe('Transaction building', async () => {
  describe('From valid inputs', async () => {
    const recipient = 'ST2ZRX0K27GW0SP3GJCEMHD95TQGJMKB7G9Y0X1MH';
    const publicKeys = [
      "02b30fafab3a12372c5d150d567034f37d60a91168009a779498168b0e9d8ec7f2", // 1
      "03ce61f1d155738a5e434fc8a61c3e104f891d1ec71576e8ad85abb68b34670d35", // 2
      "03ef2340518b5867b23598a9cf74611f8b98064f7d55cdb8c107c67b5efcbc5c77", // 3
    ];
    const data: lib.MultisigTxInput = {
      recipient, fee: '300', amount: '10000', publicKeys, numSignatures: 3, nonce: '4', network: 'mainnet'
    };

    const tx = await lib.makeStxTokenTransfer(data);
    const spendingCondition = tx.auth.spendingCondition as StxTx.MultiSigSpendingCondition;

    it('Should have correct numbers of auth fields', () => {
      const info = lib.getAuthFieldInfo(tx);
      expect(info).toEqual({
        authFields: 3,
        pubkeys: publicKeys,
        signatures: 0,
        signaturesRequired: 3,
      });
    });

    it('Should have correct pubkeys', () => {
      spendingCondition.fields.forEach((f, i) => {
        expect(f.contents.type).toEqual(StxTx.StacksMessageType.PublicKey);
        let pubkey = f.contents.data;
        if (pubkey instanceof Uint8Array) {
          pubkey = bytesToHex(pubkey);
        }
        expect(pubkey).toEqual(publicKeys[i]);
      });
    });

    it('Should have correct fee, nonce, and hash mode', () => {
      expect(spendingCondition.fee).toEqual(300n);
      expect(spendingCondition.nonce).toEqual(4n);
      expect(spendingCondition.hashMode).toEqual(StxTx.AddressHashMode.SerializeP2SHNonSequential);
    });
  });

  it('Should fail with invalid `sender`', async () => {
    const sender = 'ST2ZRX0K27GW0SP3GJCEMHD95TQGJMKB7G9Y0X1MH'; // Invalid
    const recipient = 'ST2ZRX0K27GW0SP3GJCEMHD95TQGJMKB7G9Y0X1MH';
    const publicKeys = [
      "02b30fafab3a12372c5d150d567034f37d60a91168009a779498168b0e9d8ec7f2", // 1
      "03ce61f1d155738a5e434fc8a61c3e104f891d1ec71576e8ad85abb68b34670d35", // 2
      "03ef2340518b5867b23598a9cf74611f8b98064f7d55cdb8c107c67b5efcbc5c77", // 3
    ];
    const data: lib.MultisigTxInput = {
      sender, recipient, fee: '300', amount: '10000', publicKeys, numSignatures: 3, nonce: '4', network: 'mainnet'
    };

    await expect(() => lib.makeStxTokenTransfer(data)).rejects.toThrowError(/not match/);
  });

  describe('From array', async () => {
    const sender = 'SM2R12RQCV9SCAZPM37VSCVP4X3EQK1Y70KCV7EDE'; // This should match signers
    const recipient = 'ST2ZRX0K27GW0SP3GJCEMHD95TQGJMKB7G9Y0X1MH';
    const publicKeys = [
      "02b30fafab3a12372c5d150d567034f37d60a91168009a779498168b0e9d8ec7f2", // 1
      "03ce61f1d155738a5e434fc8a61c3e104f891d1ec71576e8ad85abb68b34670d35", // 2
      "03ef2340518b5867b23598a9cf74611f8b98064f7d55cdb8c107c67b5efcbc5c77", // 3
    ];

    const inputs: lib.MultisigTxInput[] = [
      { recipient, fee: '300', amount:  '10000', publicKeys, numSignatures: 3, nonce: '4', network: 'testnet' },
      { recipient, fee: '777', amount: '100000', publicKeys, numSignatures: 2, network: 'testnet' }, // Should work without `nonce`
      { recipient, fee: '300', amount:  '50000', publicKeys, numSignatures: 1, nonce: '1' }, // Should work without `network`
      { recipient, fee: '777', amount: '100000', publicKeys, numSignatures: 2, sender }, // Should work with `sender`
      { recipient, fee: '777', amount: '1000000', amount_stx: '1',  publicKeys, numSignatures: 2, nonce: '100'}, // Should work with both `amount` and `amount_stx`
      { recipient, fee: '777', amount_stx: '1',  publicKeys, numSignatures: 1, nonce: '0'}, // Should work with `amount_stx`
      { recipient, fee: '777', amount: '100000000000000000000', amount_stx: '100000000000000', publicKeys, numSignatures: 1, nonce: '0'}, // Should handle numbers above `Number.MAX_SAFE_INTEGER` accurately
    ];

    const amounts: bigint[] = [
      10000n,
      100000n,
      50000n,
      100000n,
      2000000n,
      1000000n,
      200000000000000000000n,
    ];

    const txs = await lib.makeStxTokenTransfers(inputs);
    const expectedTxsLen = inputs.length;

    it(`Should have generated ${expectedTxsLen} transactions`, () => {
      expect(txs.length).toEqual(expectedTxsLen);
    });

    for (const i in inputs) {
      const input = inputs[i];
      const tx = txs[i];
      const expectedAuthFields = input.publicKeys.length;

      it(`Tx ${i} should have ${expectedAuthFields} auth fields`, () => {
        const info = lib.getAuthFieldInfo(tx);
        expect(info).toEqual({
          authFields: expectedAuthFields,
          pubkeys: input.publicKeys,
          signatures: 0,
          signaturesRequired: input.numSignatures,
        });
      });

      const spendingCondition = tx.auth.spendingCondition as StxTx.MultiSigSpendingCondition;
      it(`Tx ${i} should have correct pubkeys`, () => {
        spendingCondition.fields.forEach((f, i) => {
          expect(f.contents.type).toEqual(StxTx.StacksMessageType.PublicKey);
          let pubkey = f.contents.data;
          if (pubkey instanceof Uint8Array) {
            pubkey = bytesToHex(pubkey);
          }
          expect(pubkey).toEqual(input.publicKeys[i]);
        });
      });

      it(`Tx ${i} should have correct fee, nonce, and hash mode`, () => {
        expect(spendingCondition.hashMode).toEqual(StxTx.AddressHashMode.SerializeP2SHNonSequential);
        if (input.nonce) {
          expect(spendingCondition.nonce).toEqual(BigInt(input.nonce));
        }
        if (input.fee) {
          expect(spendingCondition.fee).toEqual(BigInt(input.fee));
        }
      });

      it(`Should add 'amount' and 'amount_stx'`, () => {
        expect((tx.payload as StxTx.TokenTransferPayload).amount).toStrictEqual(amounts[i]);
      });
    }
  });
});