const Integration = require('./integration');
const ChainUtil = require('../chain-util');

function createDummyIntegration(keyPair, witnesses) {
  return new Integration(
    keyPair,
    1,
    [Integration.createOutput(keyPair.getPublic().encode('hex'), 'a', 5, 1)],
    witnesses,
    0);
}

describe('Integration', () => {
  let keyPair;

  beforeEach(() => {
    keyPair = ChainUtil.genKeyPair();
  });

  it("Choose witnesses doesn't care about brokers ordering, 1 witness", () => {
    const brokers_f = ['a', 'b', 'c'];
    const brokers_b = ['c', 'b', 'a'];

    const integration = createDummyIntegration(keyPair, 1);
    expect(Integration.chooseWitnesses(integration, brokers_f)).toEqual(Integration.chooseWitnesses(integration, brokers_b));
  });

  it("Choose witnesses doesn't care about brokers ordering, 2 witness", () => {
    const brokers_f = ['a', 'b', 'c'];
    const brokers_b = ['c', 'b', 'a'];

    const integration = createDummyIntegration(keyPair, 2);
    expect(Integration.chooseWitnesses(integration, brokers_f)).toEqual(Integration.chooseWitnesses(integration, brokers_b));
  });

  it("Choose witnesses doesn't care about brokers ordering, 3 witness", () => {
    const brokers_f = ['a', 'b', 'c'];
    const brokers_b = ['c', 'b', 'a'];

    const integration = createDummyIntegration(keyPair, 3);
    expect(Integration.chooseWitnesses(integration, brokers_f)).toEqual(Integration.chooseWitnesses(integration, brokers_b));
  });
});