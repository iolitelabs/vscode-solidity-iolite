'use strict';

import * as vscode from 'vscode';


/**
 * Read-only HTML document provider for showing information about contract
 * deploy process
*/
export class DeployDocumentContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private uri: vscode.Uri;

    private _contractName: string;
    private _txHash: string;
    private _contractAddress: string;
    private _error: string;

    set contractName(name: string) {
        this._contractName = name;
        this.update();
    }

    set txHash(hash: string) {
        this._txHash = hash;
        this.update();
    }

    set contractAddress(address: string) {
        this._contractAddress = address;
        this.update();
    }

    set error(error: string) {
        this._error = error;
        this.update();
    }

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    constructor(uri: vscode.Uri) {
        this.uri = uri;
    }

    public provideTextDocumentContent(uri: vscode.Uri): string {
        let document = '';
        document += '<body>' + (this._contractName ? ('<div>Deploying contract ' + this._contractName + '</div>') : '');

        if (this._error) {
            document += '<div>Error: ' + this._error + '</div>';
        } else {
            if (this._txHash) {
                document += '<div>';
                document += 'TX HASH: ';
                document += '<a href="https://sia.scan.iolite.io/txs/';
                document += this._txHash;
                document += '">';
                document += this._txHash;
                document += '</a>';
                document += '</div>';
            }

            if (this._contractAddress) {
                document += '<div>';
                document += 'SUCCESS! Contract address:  ';
                document += '<a href="https://sia.scan.iolite.io/addrs/';
                document += this._contractAddress;
                document += '">';
                document += this._contractAddress;
                document += '</a>';
                document += '</div>';
            }
        }
        document += '</body>';
        return document;
    }

    private update() {
        this._onDidChange.fire(this.uri);
    }
}