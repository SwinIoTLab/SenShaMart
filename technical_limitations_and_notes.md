# Technical limitations and notes

This software is still very much a work in progress and serves as a proof of concept of the research being conducted.
We aim to polish everything over time but there are some current technical limitations

## Replication

Our replication is currently limited to half of the blocks that are in memory. 
We only store an expected 7 days worth of blocks in memory at a time.
This can be changed by changing the MAX_BLOCKS_IN_MEMORY constant in blockchain/blockchain.ts.

We want to change our replication algorithm and implementation (currently in network/blockchain-prop.ts) to be RPC based using something like grpc.
This is an item of future work.

### Work around

If two nodes diverge by more than MAX_BLOCKS_IN_MEMORY / 2 blocks, the best way to reconcile them is to:
- stop the node with the smallest chain
- copy the longest chain to the other node and rename it if necessary
- clean the fuseki database and remake the dataset if necessary
- regenerate the fuseki dataset if necessary
- start the stopped node again

## Storage

We store our blockchain locally in a sqlite3 database.
The schema of the database can be found at the top of blockchain/blockchain.ts and a sqlite3 database viewer can be used to inspect the persisted data.

We currently only store the longest chain, and any shorter chain is discarded.
It might be more efficient on the network (as opposed to storage efficiency) to store the shorter chains to allow for easier replication.
This would also allow for replacing the current chain piece by piece instead of having to atomically replace the entire chain.

## Volatility at the head of the chain

We currently act on the information on the entirety of the chain, including data at the head.
This can lead to what appears to be a blockchain with transaction appearing and disappearing as multiple miners are fighting over who has the longest chain.

A possible solution is to wait until transactions are in a block that is a certain number of blocks from the head before we act on them.
This would lead to longer latencies, but also the appearance of a more stable chain.