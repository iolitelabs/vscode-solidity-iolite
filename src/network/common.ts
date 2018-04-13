'use strict';
import * as vscode from 'vscode';
import * as Web3 from 'web3';
import { OutputChannel } from 'vscode';
import { Position, Range } from 'vscode-languageserver/lib/main';
import * as account from '../account';

let outputChannel: OutputChannel = null;

const _Web3 = Web3 as any;
export const web3 = new _Web3(new _Web3.providers.HttpProvider('https://ropsten.infura.io/'));

let cachedPrivateKey          = undefined;
let cachedPrivateKeyEncrypted = undefined;

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

export function getSettings(): Promise<NetworkSettings> {
    let settings = vscode.workspace.getConfiguration('solidity').get<NetworkSettings>('network');

    let getPassword;
    if (!(settings.address && settings.privateKey)) {
        getPassword = account.showCreateNewAccountDialog;
    } else if (settings.privateKey === cachedPrivateKeyEncrypted) {
        getPassword = _ => Promise.resolve(cachedPrivateKey);
    } else {
        getPassword = account.showEnterPasswordDialog;
    }

    return getPassword(settings).then(privateKey => {
        web3.eth.accounts.wallet.clear();
        web3.eth.accounts.wallet.add(privateKey);
        cachedPrivateKeyEncrypted = settings.privateKey;
        cachedPrivateKey = privateKey;
        vscode.workspace.getConfiguration('solidity').update('network', settings);
        return settings;
    });
}

/**
 * Add new contract address to settings
 * @param name contract name with file name, e.g. 'BaseToken.sol:BaseToken'
 * @param address contract address
 */
export function addContractAddress(name: string, address: string) {
    getSettings().then(settings => {
        if (! settings.contracts) {
            settings.contracts = {};
        }
        settings.contracts[name] = address;
        vscode.workspace.getConfiguration('solidity').update('network', settings);
    });
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
