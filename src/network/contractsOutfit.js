var business = require('../business.js');
var rlp = require('rlp');

const EventEmitter = require('events')

function ContractsOutfit(web3) {

  function send (sendObject, address, metadata, metadataLimit) {
    return new Promise((resolveGlobal, rejectGlobal) => {
      return new Promise((resolve, reject) => {
        var request;
        if (metadata && metadataLimit) {
          request = {
            from: address,
            metadata: metadata,
            metadataLimit: metadataLimit
          };
        } else {
          request = {
            from: address
          }
        }
        sendObject.estimateGas(request, (err, gasAmount) => {
          if (err) {
            return reject(err)
          }
          resolve({
            gasAmount: gasAmount,
            sendObject: sendObject
          })
        })
      })
      .then(output => {
        return new Promise((resolve, reject) => {
          web3.eth.getGasPrice((err, gasPrice) => {
            if (err) {
              return reject(err)
            }

            output.gasPrice = gasPrice
            resolve(output)
          })
        })
      })
      .then(output => {
        return new Promise((resolve, reject) => {
          web3.eth.getTransactionCount(address, "pending", (err, nextNonce) => {
            if (err) {
              return reject(err)
            }

            output.nextNonce = nextNonce
            resolve(output)
          })
        })
      })
      .then(output => {
        const emiter = new EventEmitter()
        resolveGlobal(emiter)
        setImmediate(() => {
          try {
            var object;
            if (metadata && metadataLimit) {
              object = {
                from: address,
                gas: Math.round(output.gasAmount * 10),
                gasPrice: output.gasPrice,
                nonce: output.nextNonce,
                metadata: metadata,
                metadataLimit: metadataLimit
              };
            } else {
              object = {
                from: address,
                gas: Math.round(output.gasAmount * 10),
                gasPrice: output.gasPrice,
                nonce: output.nextNonce
              };
            }
            return output.sendObject.send(object)
              .on('error', error => emiter.emit('error', error))
              .on('transactionHash', transactionHash => emiter.emit('transactionHash', transactionHash))
              .on('receipt', receipt => emiter.emit('receipt', receipt))
          } catch (err) {
            return emiter.emit('error', err)
          }
        })
      })
      .catch(reason => {
        rejectGlobal(reason)
      })
    })
  }

  function deploy (address, contractFromCompiler, arguments, langdata, metalimit) {
    const abi = JSON.parse(contractFromCompiler.abi)
    const contractObject = new web3.eth.Contract(abi)

    const deployObject = contractObject.deploy({ 
      data: "0x" + contractFromCompiler.bytecode,
      arguments: arguments
    });

    if (langdata && metalimit) {
      let metadata;
      if (langdata) {
        const encoded = web3.eth.abi.encodeFunctionCall(business.abi.find(fun => fun.name === 'getInvoice'), [langdata]);
  
        metadata = '0x' + rlp.encode([business.address, encoded]).toString('hex');
      } else {
        metadata = undefined;
      }

      return send(deployObject, 
                  address, 
                  metadata, 
                  metalimit ? web3.utils.toHex(metalimit) : "0x0");
    } else {
      return send(deployObject, address);
    }
  }

  function call (address, contract, method) {
    const contractObject = new web3.eth.Contract(contract.abi, contract.address)
    const methodObject = contractObject.methods[method.name].apply(this, method.params)  // also we can use the spread operator
    const stateMutability = contract.abi.find(element => element.name === method.name).stateMutability // do not believe methodObject._method.stateMutability

    if (stateMutability === "view" || stateMutability === "pure") {
      return new Promise((resolve, reject) => {
        const emiter = new EventEmitter()
        resolve(emiter)
        setImmediate(() => {
          try {
            methodObject.call({ from: address }, (err, result) => {
              if (err) {
                return emiter.emit('error', err)
              }
              emiter.emit('call', result)
            })
          } catch (err) {
            return emiter.emit('error', err)
          }
        })
      })
    } else {
      return send(methodObject, address)
    }
  }

  return {
    deploy: deploy,
    call: call
  }
}

module.exports = ContractsOutfit
