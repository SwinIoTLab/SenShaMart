/**
 *    Copyright (c) 2022-2024, SenShaMart
 *
 *    This file is part of SenShaMart.
 *
 *    SenShaMart is free software: you can redistribute it and/or modify
 *    it under the terms of the GNU Lesser General Public License.
 *
 *    SenShaMart is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Lesser General Public License for more details.
 *
 *    You should have received a copy of the GNU Lesser General Public License
 *    along with SenShaMart.  If not, see <http://www.gnu.org/licenses/>.
 **/

/**
 * @author Anas Dawod e-mail: adawod@swin.edu.au
 */
import { type Result } from '../util/chain-util.js';

//some basic types and functions to try and make the txs polymorphic

interface Transaction {
  input: string,
  signature: string,
}

interface RepeatableTransaction extends Transaction {
  counter: number
}

interface TransactionClass<Tx extends Transaction> {
  verify(tx: Tx): Result;
  toHash(tx: Tx): string;
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
