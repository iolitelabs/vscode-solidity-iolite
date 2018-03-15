'use strict';
import * as vscode from 'vscode';
import * as aesjs from 'aes-js';
import * as crypto from 'crypto';
import { NetworkSettings, web3 } from './network/common';

const SHA256_HEX_LENGTH = 64;

/**
 * Calculate sha256 checksum for a given string
 * @param str string for calculating checksum
 * @returns sha256 checksum in hex format
*/
function checksum(str: string): string {
    return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Creates new Ethereum account, saves public key and encrypted with a given
 * password private key (along with sha256 checksum for password validation)
 * to settings and return the last one unencrypted for further use
 * @param encryptionPassword password for private key encryption
 * @param settings to which info about account will be saved
 * @returns private key of created account
 */
function createNewAccount(encryptionPassword: string, settings: NetworkSettings): string {
    const account = (web3.eth.accounts as any).create();

    const key = crypto.pbkdf2Sync(aesjs.utils.utf8.toBytes(encryptionPassword),
                                  '',
                                  1,
                                  256 / 8,
                                  'sha512');
    const aesCtr = new aesjs.ModeOfOperation.ctr(key);
    const pk = account.privateKey.substr(2);
    const hashsum = checksum(pk);
    const pkBytes = aesjs.utils.utf8.toBytes(pk);
    const pkEncrypted = aesCtr.encrypt(pkBytes);
    // TODO: append hashsum for password validation
    const pkHex = aesjs.utils.hex.fromBytes(pkEncrypted);

    settings.address = account.address;
    settings.privateKey = pkHex + hashsum;

    return account.privateKey;
}

/**
 * Retrieves current Ethereum account private key, decrypts it and return raw
 * @param encryptionPassword password used for private key encryption
 * @param settings settings for retrivieng privateKey in encrypted form
 * @returns current Ethereum account private key in plain text
*/
function getCurrentAccountPrivateKey(encryptionPassword: string, settings: NetworkSettings): string {
    const key = crypto.pbkdf2Sync(aesjs.utils.utf8.toBytes(encryptionPassword),
                                  '',
                                  1,
                                  256 / 8,
                                  'sha512');
    const aesCtr = new aesjs.ModeOfOperation.ctr(key);
    const pkHex = settings.privateKey.substr(0, settings.privateKey.length - SHA256_HEX_LENGTH);
    const hashsum = settings.privateKey.substr(settings.privateKey.length - SHA256_HEX_LENGTH);
    const pkEncrypted = aesjs.utils.hex.toBytes(pkHex);
    const pkBytes = aesCtr.decrypt(pkEncrypted);
    const pk = aesjs.utils.utf8.fromBytes(pkBytes);

    // validate password using checksum
    if (hashsum !== checksum(pk)) {
        throw Error('Invalid password');
    }

    return '0x' + pk;
}

/**
 * Show dialog for entering new password for encryption and if used entered,
 * call createNewAccount() with this password
 * @param settings settings for saving info about new account
 * @return promise to the unencrypted private key
*/
export function showCreateNewAccountDialog(settings: NetworkSettings): Promise<string> {
    let options: vscode.InputBoxOptions = {
        password: true,
        placeHolder: 'Enter new password for account',
        prompt: 'New password: ',
    };

    return new Promise((resolve, reject) => {
        vscode.window.showInputBox(options).then(password => {
            if (password) {
                const privateKey = createNewAccount(password, settings);
                resolve(privateKey);
            } else {
                reject(Error('Canceled'));
            }
        });
    });
}

/**
 * Show dialog for entering password for decryption and if user entered,
 * call getCurrentAccountPrivateKey() with this password
 * @param settings settings for retrieving info about account for decrypting
 * @return promise to the unencrypted private key
*/
export function showEnterPasswordDialog(settings: NetworkSettings): Promise<string> {
    let options: vscode.InputBoxOptions = {
        password: true,
        placeHolder: 'Enter password for account: ',
        prompt: 'Password: ',
    };

    // TODO: check for incorrect password case (hashsum)
    return new Promise((resolve, reject) => {
        vscode.window.showInputBox(options).then(password => {
            if (password) {
                try {
                    const privateKey = getCurrentAccountPrivateKey(password, settings);
                    resolve(privateKey);
                } catch (error) {
                    vscode.window.showErrorMessage(error.message);
                    reject(error);
                }
            } else {
                reject(Error('Canceled'));
            }
        });
    });
}