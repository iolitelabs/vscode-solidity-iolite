'use strict';
import * as vscode from 'vscode';
import * as Web3 from 'web3';
import { OutputChannel } from 'vscode';
import { Position, Range } from 'vscode-languageserver/lib/main';
import * as aesjs from 'aes-js';
import * as crypto from 'crypto';

let outputChannel: OutputChannel = null;

const _Web3 = Web3 as any;
export const web3 = new _Web3(new _Web3.providers.HttpProvider('https://ropsten.infura.io/'));

function getOutputChannel(): OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Ethereum');
    }
    return outputChannel;
}

export function cleanOutput() {
    if (outputChannel) {
        outputChannel.clear();
        outputChannel.show();
    }
}

export function printlnOutput(line: string) {
    const channel = getOutputChannel();
    channel.appendLine(line);
    channel.show();
}

export function getSettings(): NetworkSettings {
    let settings = vscode.workspace.getConfiguration('solidity').get<NetworkSettings>('network');
    if ( ! (settings.address && settings.privateKey)) {
        // TODO: replace hardcoded 'test' values with value from dialog prompt
        createNewAccount('test');
    }

    web3.eth.accounts.wallet.clear();
    web3.eth.accounts.wallet.add(getCurrentAccountPrivateKey('test'));
    return settings;
}

export function addContractAddress(name: string, address: string) {
    let settings = getSettings();

    if (! settings.contracts) {
        settings.contracts = {};
    }
    settings.contracts[name] = address;

    vscode.workspace.getConfiguration('solidity').update('network', settings);
}


/**
 * Creates new Ethereum account, saves public key and encrypted with a given
 * password private key to settings and return the last one unencrypted
 * for further use
 * @param encryptionPassword password for private key encryption
 * @returns private key of created account
 */
function createNewAccount(encryptionPassword: string): string {
    const settings = vscode.workspace.getConfiguration('solidity')
                                     .get<NetworkSettings>('network');
    const account = (web3.eth.accounts as any).create();

    const key = crypto.pbkdf2Sync(aesjs.utils.utf8.toBytes(encryptionPassword),
                                  '',
                                  1,
                                  256 / 8,
                                  'sha512');
    const aesCtr = new aesjs.ModeOfOperation.ctr(key);
    const pkBytes = aesjs.utils.utf8.toBytes(account.privateKey.substr(2));
    const pkEncrypted = aesCtr.encrypt(pkBytes);
    // TODO: append hashsum for password validation
    const pkHex = aesjs.utils.hex.fromBytes(pkEncrypted);

    settings.address = account.address;
    settings.privateKey = pkHex;
    vscode.workspace.getConfiguration('solidity')
                    .update('network', settings);

    const settings2 = vscode.workspace.getConfiguration('solidity')
                        .get<NetworkSettings>('network');
    return account.privateKey;
}

/**
 * Retrieves current Ethereum account private key, decrypts it and return raw
 * @param encryptionPassword password used for private key encryption
 * @returns current Ethereum account private key in plain text
*/
export function getCurrentAccountPrivateKey(encryptionPassword: string): string {
    const settings = vscode.workspace.getConfiguration('solidity')
                                     .get<NetworkSettings>('network');

    const key = crypto.pbkdf2Sync(aesjs.utils.utf8.toBytes(encryptionPassword),
                                  '',
                                  1,
                                  256 / 8,
                                  'sha512');
    const aesCtr = new aesjs.ModeOfOperation.ctr(key);
    const pkHex = settings.privateKey;
    const pkEncrypted = aesjs.utils.hex.toBytes(pkHex);
    const pkBytes = aesCtr.decrypt(pkEncrypted);

    return '0x' + aesjs.utils.utf8.fromBytes(pkBytes);
}


/**
 * @param text string in which to search
 * @param startBracketPosition opening bracket position
 * @returns corresponding ending bracket position or null if there are no matching bracket
 */
function getMatchingBracket(text: String, startBracketPosition: number): number | null {
    // TODO: '{' or '}' now can be within string constant or comment
    if (text[startBracketPosition] !== '{') {
        return null;
    }
    let bracketCount = 1;

    for (let i = startBracketPosition + 1; i < text.length; i++) {
        switch (text[i]) {
            case '{': bracketCount++; break;
            case '}': bracketCount--; break;
        }
        if (bracketCount === 0) {
            return i;
        }
    }

    return null;
}

/**
 * Replace all comments and string literals within a given string.
 * Not modifies the input data.
 * @param source input string
 * @returns processed string without string literals and comments
 */
function replaceCommentsAndStrings(source: string): string {
    // regex that matches respectively: double quotes, quotes, (https://regex101.com/)
    // one-line comments, multiline comments:
    const re = /((((?=[^\\])"([^"]|\\")*[^\\])")|((?=[^\\])'([^']|\\')*[^\\]')|(\/\/[^\n]*\n)|(\/\*(.|\n)*\*\/))/g;
    const substitutionSymbol = ' ';
    return source.replace(re, (x) => substitutionSymbol.repeat(x.length));
}


/**
 * @returns start of contract in scope of which cursor is located
 *          or null if cursor is not in contract scope
*/
function getCurrentContractStart(): number | null {
    const editor = vscode.window.activeTextEditor;
    const selection = editor.selection;
    const text = replaceCommentsAndStrings(editor.document.getText());
    const position = editor.document.offsetAt(selection.active);

    let i = 0;
    while (i !== -1) {
        // TODO: contract word now can be within string constant or comment
        const start = i = text.indexOf('contract', i);
        const end = getMatchingBracket(text, text.indexOf('{', i));
        if (position >= start && position <= end) {
            return start;
        }
        if (end) {
            i = end;
        } else {
            i = -1;
        }
    }
    return null;
}


/**
 * @returns name of contract in scope of which cursor is located
 *          or null if cursor is not in contract scope
*/
export function getCurrentContractName(): string {
    const editor = vscode.window.activeTextEditor;
    const selection = editor.selection;
    const text = editor.document.getText();
    const start = getCurrentContractStart();
    if (! start) {
        return null;
    }

    return text.substring(start).match('contract\\s+(\\w+)')[1];
}


export declare interface NetworkSettings {
    privateKey: string;
    address: string;
    host: string;
    contracts: { [key: string]: string; };
}
