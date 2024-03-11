import fs from 'fs';
import process from 'process';

interface ConfigParam<T> {
  key: string;
  default: T;
  transform?: (v: unknown) => T;
}

class Config {
  settings: { [index: string]: unknown };

  constructor(location: string, disallow_arg_overide?: boolean) {
    //possible race if deleted after check, but we live with it I guess

    let looking = location;

    if (typeof disallow_arg_overide === "undefined" || disallow_arg_overide === null || !disallow_arg_overide) {
      const args = process.argv.slice(2);
      if (args.length > 0) {
        looking = args[0];
      }
    }

    if (fs.existsSync(looking)) {
      const rawSettings = fs.readFileSync(looking, 'utf8');
      this.settings = JSON.parse(rawSettings);
    } else {
      this.settings = {};
    }
  }

  get<T>(config: ConfigParam<T>): T {
    if (Object.prototype.hasOwnProperty.call(this.settings, config.key)) {
      const value = this.settings[config.key];
      if (Object.prototype.hasOwnProperty.call(config, 'transform')) {
        return config.transform(value);
      } else {
        return value as T;
      }
    } else {
      return config.default;
    }
  }
}

export default Config;