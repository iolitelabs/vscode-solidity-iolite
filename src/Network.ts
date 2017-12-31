'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ContractsOutfit from './network/contractsOutfit';
import * as projService from './projectService';
import { web3, getSettings, cleanOutput, printlnOutput, setContractAddress } from './network/common';
import { error } from 'util';
import { InputBoxOptions } from 'vscode';

const outfit = ContractsOutfit(web3);

function getContractJson(): ContractObject | null {
    const editor = vscode.window.activeTextEditor;

    const project = projService.initialiseProject(vscode.workspace.rootPath);
    const binPath = path.join(vscode.workspace.rootPath, project.projectPackage.build_dir);
    const contractName = path.parse(editor.document.fileName).name;
    const contractJsonPath = path.join(binPath, 'contracts', contractName + '.json');

    if ( ! fs.existsSync(contractJsonPath)) {
        return null;
    }

    return JSON.parse(fs.readFileSync(contractJsonPath, 'utf8'));
}

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

    const contract = getContractJson();
    if ( ! contract) {
        vscode.window.showWarningMessage('You need to compile the contract first');
        return;
    }

    // cleanOutput();
    printlnOutput("\nDeploy started");

    const settings = getSettings();
    outfit.deploy(settings.address, contract).then(emiter => {
        emiter.on('transactionHash', transactionHash => {
            printlnOutput("TX HASH: " + transactionHash);
            printlnOutput("Wait until will be mined ...");
        }).on('receipt', receipt => {
            printlnOutput("SUCCESS: Contract address: " + receipt.contractAddress);
            setContractAddress(receipt.contractAddress);
        }).on('error', error => {
            printlnOutput("FAIL: " + error.message);
        })
    }).catch(error => {
        printlnOutput("FAIL: " + error.message);
    });
}

export function getBalance() {
    const settings = getSettings();

    web3.eth.getBalance(settings.address)
        .then(balance => {
            printlnOutput("Balance of " + settings.address + " is " + web3.utils.fromWei(balance, "ether") + " ETH");
        }).catch(error => {
            printlnOutput("FAIL: " + error.message);
        });
}

export function callMethod() {
    const editor = vscode.window.activeTextEditor;

    const contract = getContractJson();
    if ( ! contract) {
        vscode.window.showWarningMessage('You need to compile the contract first');
        return;
    }

    const wordRange: vscode.Range = editor.document.getWordRangeAtPosition(editor.selection.active);
    const word: string = editor.document.getText(wordRange);

    const contractAbi = JSON.parse(contract.abi);
    const methodAbi = contractAbi.find(element => {
        return element.name === word;
    });

    if ( ! methodAbi) {
        vscode.window.showWarningMessage('You need to select method to call');
        return;
    }

    const settings = getSettings();

    if ( ! settings.contract) {
        vscode.window.showWarningMessage('You need to deploy contract first');
        return;
    }

    const methodPlaceHolder = methodAbi.inputs.map(el => el.type + ' ' + el.name).join(', ');
    console.log(methodPlaceHolder);

    const options: InputBoxOptions = {
        prompt: "Enter parametres ",
        placeHolder: methodPlaceHolder
    }

    vscode.window.showInputBox(options).then(value => {
        if ( ! value) {
            return;
        }

        let params = [];
        try {
            params = JSON.parse('[' + value + ']');
        } catch (e) {
            printlnOutput('Error encoding arguments: ' + e);
            return;
        }

        if (params.length !== methodAbi.inputs.length) {
            vscode.window.showErrorMessage('Wrong number of parameters');
            return;
        }
        console.log(params);

        const preparedParams = prepareValues(methodAbi.inputs.map(el => el.type), params);

        outfit.call(settings.address,
            { abi: contractAbi, address: settings.contract },
            { name: methodAbi.name, params: preparedParams }) //.map(el => web3.utils.stringToHex(el))
            .then(emiter => {
                emiter.on('call', result => {
                    printlnOutput("CALL RESULT: " + result);
                }).on('transactionHash', transactionHash => {
                    printlnOutput("TX HASH: " + transactionHash);
                    printlnOutput("Wait until will be mined ...");
                }).on('receipt', receipt => {
                    printlnOutput("SUCCESS: Contract address: " + receipt.contractAddress);
                    setContractAddress(receipt.contractAddress);
                }).on('error', error => {
                    printlnOutput("FAIL: " + error.message);
                })
            }).catch(error => {
                printlnOutput("FAIL: " + error.message);
            });
    });
}

export interface ContractObject {
    abi: string;
    bytecode: string;
}

function prepareSingle(type, value) {
    if (value instanceof Array) {
        const prepared = [];
        for (let i in value) {
            prepared.push(prepareSingle(type, value[i]));
        }
        return prepared;
    } 

    if (type.includes('bytes')) {
        return web3.utils.stringToHex(value);
    }
    
    return value;
}

function prepareValues(types, values): Array<any> {
    const prepared = [];
    for (let i in types) {
        prepared.push(prepareSingle(types[i], values[i]));
    }
    return prepared
}
