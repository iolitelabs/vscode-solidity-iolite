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


export declare interface NetworkSettings {
    privateKey: string;
    address: string;
    host: string;
    contracts: { [key: string]: string; };
}
