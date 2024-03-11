import { type Result } from '../util/chain-util.js';

interface Transaction {
  input: string,
  signature: string,
}

interface RepeatableTransaction extends Transaction {
  counter: number
}

interface TransactionClass<Tx extends Transaction> {
  verify(tx: Tx): Result;
  hashToSign(tx: Tx): string;
  txName(): string;
  wrap(tx: Tx): TransactionWrapper<Tx>;
}

interface TransactionWrapper<Tx extends Transaction> {
  type: TransactionClass<Tx>;
  tx: Tx;
}

function isTransactionType<tx extends Transaction>(txWrapper: TransactionWrapper<Transaction>, txClass: TransactionClass<tx>): txWrapper is TransactionWrapper<tx> {
  return txWrapper.type.txName() === txClass.txName();
}

type AnyTransaction = TransactionWrapper<Transaction>;


export { isTransactionType, type Transaction, type RepeatableTransaction, type TransactionClass, type TransactionWrapper, type AnyTransaction };