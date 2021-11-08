const mainConfig = require('./main.json')

const env = process.env.ENVIRONMENT || 'production'
const envConfig = require(`./${env}.json`)

module.exports = {
    ...mainConfig,
    ...envConfig
}

