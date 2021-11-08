// checks for correct environment
const mainConfig = require('./config/main.json')
const env = process.env.ENVIRONMENT || 'production'
if (mainConfig.environments.indexOf(env) === -1) {
    console.log('Error: unsupported environment, passed ENVIRONMENT = ', env);
    return;
}

require("./db");
require('./getFreeCars');
require('./getPaidCars')

