'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ContractsOutfit from './network/contractsOutfit';
import * as projService from './projectService';
import { web3, getSettings, cleanOutput, printlnOutput, addContractAddress } from './network/common';
import { error } from 'util';
import { InputBoxOptions } from 'vscode';

const outfit = ContractsOutfit(web3);

function getContractJson(contractName: string): ContractObject | null {
    const editor = vscode.window.activeTextEditor;

    const project = projService.initialiseProject(vscode.workspace.rootPath);
    const binPath = path.join(vscode.workspace.rootPath, project.projectPackage.build_dir);
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

    const contractName = path.parse(editor.document.fileName).name;
    const contract = getContractJson(contractName);
    if ( ! contract) {
        vscode.window.showWarningMessage('You need to compile the contract first');
        return;
    }

    const contractAbi = JSON.parse(contract.abi);
    const constructorAbi = contractAbi.find(element => {
        return element.type === 'constructor';
    });

    const options: InputBoxOptions = {
        placeHolder: getMethodPlaceHolder(constructorAbi),
        prompt: 'Enter parameters ',
    };

    const deployWithParams = function (params) {
        const preparedParams = parseParams(constructorAbi, params);

        if ( ! preparedParams) {
            return;
        }

        // cleanOutput();
        printlnOutput('\nDeploy started');

        const settings = getSettings();
        outfit.deploy(settings.address, contract, preparedParams).then(emiter => {
            emiter.on('transactionHash', transactionHash => {
                printlnOutput('TX HASH: ' + transactionHash);
                printlnOutput('Wait until will be mined ...');
            }).on('receipt', receipt => {
                printlnOutput('SUCCESS: Contract address: ' + receipt.contractAddress);
                addContractAddress(contractName, receipt.contractAddress);
            }).on('error', error => {
                printlnOutput('FAIL: ' + error.message);
            });
        }).catch(error => {
            printlnOutput('FAIL: ' + error.message);
        });
    };

    if (constructorAbi && constructorAbi.inputs.length) {
        vscode.window.showInputBox(options)
            .then(value => value && deployWithParams(value));
    } else {
        deployWithParams(null);
    }
}

export function getBalance() {
    const settings = getSettings();

    web3.eth.getBalance(settings.address)
        .then(balance => {
            printlnOutput('Balance of ' + settings.address + ' is ' + web3.utils.fromWei(balance, 'ether') + ' ETH');
        }).catch(error => {
            printlnOutput('FAIL: ' + error.message);
        });
}

export function callMethod() {
    const editor = vscode.window.activeTextEditor;

    const contract = getContractJson(path.parse(editor.document.fileName).name);
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

    const options: InputBoxOptions = {
        placeHolder: getMethodPlaceHolder(methodAbi),
        prompt: 'Enter parameters ',
    };

    const callMethodWithParams = function (params) {
        const preparedParams = parseParams(methodAbi, params);

        if ( ! preparedParams) {
            return;
        }

        outfit.call(settings.address,
            { abi: contractAbi, address: settings.contract },
            { name: methodAbi.name, params: preparedParams }) // .map(el => web3.utils.stringToHex(el))
            .then(emiter => {
                emiter.on('call', result => {
                    printlnOutput('CALL RESULT: ' + result);
                    if (methodAbi.outputs.length === 1 && methodAbi.outputs[0].type.includes('bytes')) {
                        printlnOutput('RESULT AS STRING: ' + web3.utils.hexToString(result));
                    }
                }).on('transactionHash', transactionHash => {
                    printlnOutput('TX HASH: ' + transactionHash);
                    printlnOutput('Wait until will be mined ...');
                }).on('receipt', receipt => {
                    printlnOutput('SUCCESS: Gas used: ' + receipt.gasUsed);
                }).on('error', error => {
                    printlnOutput('FAIL: ' + error.message);
                });
            }).catch(error => {
                printlnOutput('FAIL: ' + error.message);
            });
    };

    if (methodAbi.inputs.length) {
        vscode.window.showInputBox(options)
            .then(value => value && callMethodWithParams(value));
    } else {
        callMethodWithParams(null);
    }
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
    return prepared;
}

function getMethodPlaceHolder(methodAbi): string {
    return methodAbi ? methodAbi.inputs.map(el => el.type + ' ' + el.name).join(', ') : '';
}

function parseParams(methodAbi, valueParams: string): Array<any> {
    if ( ! methodAbi) {
        return [];
    }

    let params = [];

    if (valueParams) {
        try {
            params = JSON.parse('[' + valueParams + ']');
        } catch (e) {
            printlnOutput('Error encoding arguments: ' + e);
            return null;
        }
    }

    if (params.length !== methodAbi.inputs.length) {
        vscode.window.showErrorMessage('Wrong number of parameters');
        return null;
    }

    return prepareValues(methodAbi.inputs.map(el => el.type), params);
}
