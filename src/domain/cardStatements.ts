/** Settle-up step keys (§6.8), shared by settling up and a carry-over pot's Free (§6.6). */
export const settleOutKey = (potId: string) => `settle:out:${potId}`
export const settleIntoKey = (potId: string) => `settle:into:${potId}`
export const settleSendKey = (accountId: string) => `settle:send:${accountId}`
export const settleReturnKey = (accountId: string) => `settle:return:${accountId}`
export const SETTLE_PAY_KEY = 'settle:pay'
