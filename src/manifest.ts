'use strict';
import * as vscode from 'vscode';
import * as solc from 'solc';
import { readFileSync, writeFileSync } from 'fs';

export function readManifest(manifestPath: string): Manifest {
  let manifest = createManifest();
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e1) {
    try {
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 4), 'utf8');
    } catch (e2) {
      console.error(e2)
    }
  }
  return manifest;
}

function createManifest(): Manifest {
  return {
    engine: {
      name: 'solidity',
      version: '0.0.1'
    },
    compiler: {
      name: 'solc',
      version: solc.version()
    },
    grammar: {
      name: 'solidity-solidity',
      version: '0.0.1'
    },
    payload: {
      abi: '',
      source: ''
    }
  }
}

export declare interface Manifest {
  engine: { name: string; version: string; };
  compiler: { name: string; version: string; };
  grammar: { name: string; version: string; };
  payload: { abi: string; source:string; };
}