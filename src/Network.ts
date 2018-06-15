'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// import * as ContractsOutfit from './network/contractsOutfit';
import ContractsOutfit = require('./network/contractsOutfit');
import * as projService from './projectService';
import { web3, getSettings, cleanOutput, printlnOutput, addContractAddress, getCurrentContractName } from './network/common';
import { error, inspect } from 'util';
import { InputBoxOptions } from 'vscode';
import { DeployDocumentContentProvider } from './documents/deployDocument';
import { CallMethodDocumentContentProvider } from './documents/callMethod';

const outfit = ContractsOutfit(web3);

function getContractJson(contractName: string): ContractObject | null {
    const editor = vscode.window.activeTextEditor;

    const project = projService.initialiseProject(vscode.workspace.rootPath, '', 'src');
    const binPath = path.join(vscode.workspace.rootPath, project.projectPackage.build_dir);
    const contractJsonPaths = [
        path.join(binPath, contractName + '.json'),
        path.join(binPath, 'contracts', contractName + '.json')];

    for (let path of contractJsonPaths) {
        if ( ! fs.existsSync(path)) {
            continue;
        }
        return JSON.parse(fs.readFileSync(path, 'utf8'));
    }
    
    return null;
}

export function deployContract(withMetalimit: boolean = false) {
    const editor = vscode.window.activeTextEditor;
    const fileName = path.basename(editor.document.fileName);

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

    const contractName = getCurrentContractName();
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

        getSettings().then(settings => {
            const deploy = (metalimit = undefined) => {
                if (metalimit) {
                    printlnOutput("Metalimit: " + metalimit);
                }
                let uri = vscode.Uri.parse('vscode-solidity://' + contractName);
                let provider = new DeployDocumentContentProvider(uri);
                provider.contractName = contractName;
                let registration = vscode.workspace.registerTextDocumentContentProvider('vscode-solidity', provider);
                vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, 'Deploying ' + contractName).then((success) => {
                }, (reason) => {
                    vscode.window.showErrorMessage(reason);
                });
                outfit.deploy(settings.address, contract, preparedParams).then(emiter => {
                    emiter.on('transactionHash', transactionHash => {
                        provider.txHash = transactionHash;
                        printlnOutput('TX HASH: ' + transactionHash);
                        printlnOutput('Wait until will be mined ...');
                    }).on('receipt', receipt => {
                        provider.contractAddress = receipt.contractAddress;
                        printlnOutput('SUCCESS: Contract address: ' + receipt.contractAddress);
                        addContractAddress(fileName + ':' + contractName, receipt.contractAddress);
                    }).on('error', error => {
                        provider.error = error.message;
                        printlnOutput('FAIL: ' + error.message);
                    });
                }).catch(error => {
                    printlnOutput('FAIL: ' + error.message);
                });
 
            }
            if (withMetalimit) {
                let options: vscode.InputBoxOptions = {
                    prompt: 'Enter metalimit: ',
                    validateInput: (value) => {
                        if (!isNaN(Number(value))) {
                            return undefined;
                        } else {
                            return value + " is not a number";
                        }
                    }
                }
                vscode.window.showInputBox(options).then((metalimit) => {
                    deploy(metalimit);
                })
            } else {
                deploy()
            }
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
    getSettings().then(settings => {
        web3.eth.getBalance(settings.address)
        .then(balance => {
            printlnOutput('Balance of ' + settings.address + ' is ' + web3.utils.fromWei(balance, 'ether') + ' ETH');
        }).catch(error => {
            printlnOutput('FAIL: ' + error.message);
        });
    });
}

export function callMethod() {
    const editor = vscode.window.activeTextEditor;

    const fileName = path.basename(editor.document.fileName);
    const contractName = getCurrentContractName();
    const contract = getContractJson(contractName);
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

    getSettings().then(settings => {

        if ( !(settings.contracts && settings.contracts[fileName + ':' + contractName])) {
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

            let uri = vscode.Uri.parse('vscode-solidity://' + contractName);
            let provider = new CallMethodDocumentContentProvider(uri);
            provider.contractName = contractName;
            provider.methodName = word;
            let registration = vscode.workspace.registerTextDocumentContentProvider('vscode-solidity', provider);
            vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, 'Deploying ' + contractName).then((success) => {
            }, (reason) => {
                vscode.window.showErrorMessage(reason);
            });

            outfit.call(settings.address,
                { abi: contractAbi, address: settings.contracts[fileName + ':' + contractName] },
                { name: methodAbi.name, params: preparedParams }) // .map(el => web3.utils.stringToHex(el))
                .then(emiter => {
                    emiter.on('call', result => {
			let callResult = inspect(result, false, null);
                        printlnOutput('CALL RESULT: ' + callResult);
			provider.callResult = callResult;
                        if (methodAbi.outputs.length === 1 && methodAbi.outputs[0].type.includes('bytes')) {
                            printlnOutput('RESULT AS STRING: ' + web3.utils.hexToString(result));
                        }
                    }).on('transactionHash', transactionHash => {
                        provider.txHash = transactionHash;
                        printlnOutput('TX HASH: ' + transactionHash);
                        printlnOutput('Wait until will be mined ...');
                    }).on('receipt', receipt => {
                        printlnOutput('SUCCESS: Gas used: ' + receipt.gasUsed);
                        provider.gasUsed = receipt.gasUsed.toString();
                    }).on('error', error => {
                        provider.error = error.message;
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
