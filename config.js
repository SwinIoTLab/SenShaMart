const fs = require('fs');
const process = require('process');

class Config {
  constructor(location, disallow_arg_overide) {
    //possible race if deleted after check, but we live with it I guess

    const looking = location;

    if (typeof disallow_arg_overide === undefined || disallow_arg_overide === null || !disallow_arg_overide) {
      const args = process.argv.slice(2);
      if (args.length > 0) {
        looking = args[0];
      }
    }

    if (fs.existsSync(looking)) {
      const rawSettings = fs.readFileSync(looking, 'utf8');
      this.settings = JSON.parse(rawSettings);
    }
  }

  get(config) {
    if (this.settings.hasOwnProperty(config.key)) {
      const value = this.settings[config.key];
      if (config.hasOwnProperty('transform')) {
        return config.transform(value);
      } else {
        return value;
      }
    } else {
      return config.default;
    }
  }
}

module.exports = Config;