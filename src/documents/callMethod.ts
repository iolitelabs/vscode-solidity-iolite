'use strict';

import * as vscode from 'vscode';


/**
 * Read-only HTML document provider for showing information about call contract
 * method process
*/
export class CallMethodDocumentContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private uri: vscode.Uri;

    private _contractName: string;
    private _methodName: string;
    private _txHash: string;
    private _contractAddress: string;
    private _error: string;
    private _gasUsed: string;

    set contractName(name: string) {
        this._contractName = name;
        this.update();
    }

    set methodName(name: string) {
        this._methodName = name;
        this.update();
    }

    set gasUsed(gasUsed: string) {
        this._gasUsed = gasUsed;
        this.update();
    }

    set txHash(hash: string) {
        this._txHash = hash;
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
        document += '<body>' + (this._contractName ? ('<div>Calling method \"' + this._methodName + '\" contract ' + this._contractName + '</div>') : '');

        if (this._error) {
            document += '<div>Error: ' + this._error + '</div>';
        } else {
            if (this._txHash) {
                document += '<div>';
                document += 'TX HASH: ';
                // TODO: get check for testnet/non-testnet etherscan
                document += '<a href="https://ropsten.etherscan.io/tx/';
                document += this._txHash;
                document += '">';
                document += this._txHash;
                document += '</a>';
                document += '</div>';
            }

            if (this._gasUsed) {
                document += '<div>';
                document += 'SUCCESS! Gas used:  ' + this._gasUsed;
                // TODO: get check for testnet/non-testnet etherscan
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