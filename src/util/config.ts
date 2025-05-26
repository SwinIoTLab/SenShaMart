import fs from 'fs';

import { type ValidatorTypedI, type ResultFailure } from './chain-util.js';

class Config {
  settings: { [index: string]: unknown };

  constructor(location: string) {
    //possible race if deleted after checking, but :/
    if (fs.existsSync(location)) {
      const rawSettings = fs.readFileSync(location, 'utf8');
      this.settings = JSON.parse(rawSettings);
    } else {
      this.settings = {};
    }
  }

  get<T>(key: string, fallback: unknown, validator: ValidatorTypedI<T>): T {
    const value = Object.hasOwn(this.settings, key) ? this.settings.key : fallback;

    const fail: ResultFailure = { result: false, reason: "" };

    if (!validator(value, fail)) {
      throw new Error(`Couldn't validate gotten config with key '${key}': ${fail.reason}`);
    }
    return value;
  }
}

export default Config;