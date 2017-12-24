'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ContractsOutfit from './network/contractsOutfit';
import * as projService from './projectService';
import { web3, getSettings, cleanOutput, printlnOutput } from './network/common';
import { error } from 'util';

const outfit = ContractsOutfit(web3);

export function deployContract() {
    let editor = vscode.window.activeTextEditor;

    if (!editor) {
        return; // We need something open
    }

    if (path.extname(editor.document.fileName) !== '.sol') {
        vscode.window.showWarningMessage('This not a solidity file (*.sol)');
        return;
    }

    // Check if is folder, if not stop we need to output to a bin folder on rootPath
    if (vscode.workspace.rootPath === undefined) {
        vscode.window.showWarningMessage('Please open a folder in Visual Studio Code as a workspace');
        return;
    }

    const project = projService.initialiseProject(vscode.workspace.rootPath);
    const binPath = path.join(vscode.workspace.rootPath, project.projectPackage.build_dir);
    const contractName = path.parse(editor.document.fileName).name;
    const contractJsonPath = path.join(binPath, 'contracts', contractName + '.json');

    if ( ! fs.existsSync(contractJsonPath)) {
        vscode.window.showWarningMessage('You need to compile the contract first');
        return;
    }

    cleanOutput();
    printlnOutput("Deploy started");
    
    const settings = getSettings();
    outfit.deploy(settings.address, JSON.parse(fs.readFileSync(contractJsonPath, 'utf8'))).then(emiter => {
        emiter.on('transactionHash', transactionHash => {

        }).on('receipt', receipt => {

        }).on('error', error => {
            printlnOutput("FAIL: " + error.message);
        })
    });
}
