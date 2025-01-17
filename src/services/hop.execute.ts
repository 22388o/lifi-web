import { createAndPushProcess, initStatus, setStatusDone, setStatusFailed } from './status'

import { JsonRpcSigner } from '@ethersproject/providers'
import { Execution } from '../types/'
import hop from './hop'
import { CoinKey } from '../types'
import notifications, { NotificationType } from './notifications'

export const executeHopCross = async (signer: JsonRpcSigner, bridgeCoin: CoinKey, amount: string, fromChainId: number, toChainId: number, updateStatus?: Function, initialStatus?: Execution) => {
  // setup
  const { status, update } = initStatus(updateStatus, initialStatus)
  hop.init(signer, fromChainId, toChainId)

  //set allowance AND send
  const allowanceAndCrossProcess = createAndPushProcess(update, status, 'Set Allowance and Cross')
  let tx
  try {
     tx = await hop.setAllowanceAndCrossChains(bridgeCoin, amount, fromChainId, toChainId )
  } catch (e: any) {
    if (e.message) allowanceAndCrossProcess.errorMessage = e.message
    if (e.code) allowanceAndCrossProcess.errorCode = e.code
    setStatusFailed(update, status, allowanceAndCrossProcess)
    throw e
  }
  setStatusDone(update, status, allowanceAndCrossProcess)


  //wait for transaction
  const waitForTxProcess = createAndPushProcess(update, status, 'Wait for transaction on receiving chain')
  let destinationTxReceipt;
  try{
    destinationTxReceipt = await hop.waitForDestinationChainReceipt(tx.hash, bridgeCoin, fromChainId, toChainId)
  } catch (_e){
    const e = _e as Error
    if (e.message) waitForTxProcess.errorMessage = "Transaction failed on receiving chain: \n" + e.message
    notifications.showNotification(NotificationType.CROSS_ERROR)
    setStatusFailed(update, status, waitForTxProcess)
    throw e
  }

  const parsedReceipt = hop.parseReceipt(tx, destinationTxReceipt)


  setStatusDone(update, status, waitForTxProcess, {
    fromAmount: parsedReceipt.fromAmount,
    toAmount: parsedReceipt.toAmount,
    gasUsed: (status.gasUsed || 0) + parsedReceipt.gasUsed,
  })

  // -> set status
  status.status = 'DONE'
  notifications.showNotification(NotificationType.CROSS_SUCCESSFUL)
  update(status)

  // DONE
  return status




}

