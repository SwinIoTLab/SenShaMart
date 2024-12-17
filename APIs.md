# APIs

In this file we'll describe the APIs provided by public-wallet-app. 
The other applications have the same or extremely similar APIs.


We intend to unify the APIs provided by all of the apps in the future.

### All type information is shown as typescript

### Base Types

    interface ResultSuccess {
      result: true;
    }

    interface ResultValue<T> extends ResultSuccess {
      value: T;
    }

    interface ResultFailure {
      result: false;
      reason: string;
    }

    type Result = ResultSuccess | ResultFailure;

    type ValuedResult<T> = ResultValue<T> | ResultFailure;

    type PubKeyedBody = {
      pubKey: string;
    }

    type Integration = {
      input: string;
      counter: number;
      rewardAmount: number;
      outputs: {
        amount: number;
        sensorName: string;
        sensorHash: string;
        brokerHash: string;
      }[];
      witnessCount: number;
      signature: string;
    };

    type BrokerRegistration = {
      input: string;
      counter: number;
      rewardAmount: number;
      metadata: {
        name: string;
        endpoint: string;
        extraNodes?: {
          s: string;
          p: string;
          o: string;
        }[];
        extraLiterals?: {
          s: stirng;
          p: string;
          o: string;
        }[];
      };
      signature: string;
    };

    type SensorRegistration = {
      input: string;
      counter: number;
      rewardAmount: number;
      metadata: {
        name: string;
        costPerMinute: number;
        costPerKB: number;
        integrationBroker: string;
        interval: number | null;
        extraNodes?: {
          s: string;
          p: string;
          o: string;
        }[];
        extraLiterals?: {
          s: string;
          p: string;
          o: string;
        }[];
      };
      signature: string;
    };

### Apis

This directs the app to try and peer with the endpoint given by url. This should be prefixed with ws://

    '/ChainServer/connect'
    {
      url: string;
    }
    =>
    Result

This generates a new keypair and returns it on success

    '/gen-key'
    void
    =>
    ResultFailure | {
      result: true;
      keyPair: string;
      pubKey: string
    }

This gets the public key for the given keypair

    '/PubKeyFor'
    {
      keyPair: string;
    }
    =>
    ValuedResult<string>

This gets the current length of the blockchain

    '/chain-length'
    void
    =>
    ValuedResult<number>

This gets the balance of the wallet given by the public key in pub keyed body. 
The public key will be the key in value, with the number value being the balance, if it exists.
If it does exist, it's value is default.

    '/Balance'
    PubKeyedBody
    =>
    ResultFailure | {
      result: true;
      default: number;
      value: {
        [index:string]:number;
      }
    }

This gets all balances. 
The wallet public keys will be the keys in value.

    '/Balances'
    void
    =>
    ResultFailure | {
      result: true;
      default: number;
      value: {
        [index:string]:number;
      }
    }

This directs the app to create, sign, and propagate a payment transaction on the behalf of the given keypair

    '/Payment/Register'
    {
      keyPair: string;
      rewardAmount: number;
      outputs: {
        amount: number;
        publicKey: string;
      }[];
    }
    =>
    ResultFailure | {
      result: true,
      value: {
        input: string;
        counter: number;
        rewardAmount: number;
        outputs: {
          amount: number;
          publicKey: string;
        }[];
        signature: string;
      };
    }

This gets all current integrations

    '/Integration/All'
    void
    =>
    ResultFailure | {
      result: true,
      value: {
        [index:string]:Integration;
      };
    }

This directs the app to create, sign, and propagate an integration transaction on the behalf of the given keypair

    '/Integration/Register'
    {
      keyPair: string;
      rewardAmount: number;
      witnessCount: number;
      outputs: {
        amount: number;
        sensorName: string;
        sensorHash: string;
        brokerHash: string;
      }[];
    }
    =>
    ResultFailure | {
      result: true;
      tx: Integration;
      hash: string;
    }

This gets all integrations that uses sensors owned by the given public key

    '/Integration/UsesOwnedBy'
    PubKeyedBody
    =>
    ResultFailure | {
      result: true;
      value: {
        [index:string]: Integration
      };
    };

This gets all integrations initiated by the given public key

    '/Integration/OwnedBy'
    PubKeyedBody
    =>
    ResultFailure | {
      result: true;
      value: {
        [index:string]: Integration
      };
    };

This gets all integrations which brokers owned by the given public key are brokering

    '/Integration/OurBrokersBrokering'
    PubKeyedBody
    =>
    ResultFailure | {
      result: true;
      value: {
        [index:string]: Integration
      };
    };

This gets all integrations which brokers owned by the given public key are witnessing

    '/Integration/OurBrokersWitnessing'
    PubKeyedBody
    =>
    ResultFailure | {
      result: true;
      value: {
        [index:string]: Integration
      };
    };

This gets all broker registrations

    '/BrokerRegistration/All'
    void
    =>
    ResultFailure | {
      result: true;
      value: {
        [index:string]: BrokerRegistration & { hash: string};
      };
    };

This directs the app to create, sign, and propagate for mining a transaction to register a broker

    '/BrokerRegistration/Register'
    {
      keyPair: string;
      rewardAmount: string;
      brokerName: string;
      endpoint: string;
      extraNodeMetadata: {
        s: string;
        p: string;
        o: string;
      }[];
      extraLiteralMetadata: {
        s: string;
        p: string;
        o: string;
      }[];
    }
    =>
    ResultFailure | {
     result: true;
     tx: BrokerRegistration;
    };

This returns all brokers owned by the given public key

    '/BrokerRegistration/OwnedBy'
    PubKeyedBody
    => 
    ResultFailure | {
      result: true;
      value: {
        [index:string]: BrokerRegistration & {hash:string};
      };
    }

This gets all sensor registrations

    '/SensorRegistration/All'
    void
    =>
    ResultFailure | {
      result: true;
      value: { [index:string]: SensorRegistration & {hash:string;}};
    }

This directs the app to create, sign, and propagate for mining a transaction to register a sensor

    '/SensorRegistration/Register'
    {
      keyPair: string;
      sensorName: string;
      costPerMinute: number;
      costPerKB: number;
      integrationBroker: string | null;
      interval: number | null;
      rewardAmount: number;
      extraNodeMetadata?: {
        s: string;
        p: string;
        o: string;
      }[];
      extraLiteralMetadata?: {
        s: string;
        p: string;
        o: string;
      }[];
    }
    =>
    ResultFailure | {
      result: true;
      tx: SensorRegistration;
      brokerIp: string;
    }

This directs the app to create, sign, and propagate for mining a transaction to register a sensor.
This is a helper api to allow the wallet to do some of the RDF construction for the user.
If any of the helping values (past rewardAmount) are empty strings, they will be ignored.

    '/SensorRegistration/Register/Simple'
    {
      keyPair: string;
      sensorName: string;
      costPerMinute: number;
      costPerKB: number;
      integrationBroker: string | null;
      interval: number | null;
      rewardAmount: number;
      lat: string | undefined;
      long: string | undefined;
      measures: string | undefined;
      sensorType: string | undefined;
      sensorPlatform: string | undefined;
      sensorSystemHardware: string | undefined;
      sensorSystemSoftware: string | undefined;
      gmapsLocation: string | undefined;
      sensorSystemProtocol: string | undefined;
      extraMetadata: string | undefined;
      machineProtocolDesc: string | undefined;
      humanProtocolDesc: string | undefined;
    }
    =>
    ResultFailure | {
      result: true;
      tx: SensorRegistration;
      brokerIp: string;
    }

This gets all sensor registrations owned by the given public key

    '/SensorRegistration/OwnedBy'
    PubKeyedBody
    =>
    ResultFailure | {
      result: true;
      value: { [index:string]: SensorRegistration & {hash:string;}};
    }

This performs a SPARQL query on the backend RDF database (if it exsits)

    '/sparql'
    {
      query: string;
    }
    =>
    ResultFailure | {
      result: true;
      headers: string[];
      values: string[][];
    };