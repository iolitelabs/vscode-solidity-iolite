'use strict';
import * as vscode from 'vscode';
import * as Web3 from 'web3';
import { OutputChannel } from 'vscode';
import { Position, Range } from 'vscode-languageserver/lib/main';

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
        const account = (web3.eth.accounts as any).create();
        settings.address = account.address;
        settings.privateKey = account.privateKey;

        vscode.workspace.getConfiguration('solidity').update('network', settings);
    }

    web3.eth.accounts.wallet.clear();
    web3.eth.accounts.wallet.add(settings.privateKey);
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
 * @returns start of contract in scope of which cursor is located
 *          or null if cursor is not in contract scope
*/
function getCurrentContractStart(): number | null {
    const editor = vscode.window.activeTextEditor;
    const selection = editor.selection;
    const text = editor.document.getText(null);
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
