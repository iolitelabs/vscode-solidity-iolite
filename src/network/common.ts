'use strict';
import * as vscode from 'vscode';
import Web3 = require('web3');
import { OutputChannel } from 'vscode';

let outputChannel: OutputChannel = null;

export const web3 = new Web3(new Web3.providers.HttpProvider('https://ropsten.infura.io/'));

function getOutputChannel(): OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel("Ethereum");
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

export declare interface NetworkSettings {
    privateKey: string;
    address: string;
    host: string;
}
