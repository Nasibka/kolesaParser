const mongoose = require('mongoose');
const Config = require('./config');

console.log('DB: trying to connect to', Config.db)

mongoose
    .connect(Config.db,{ useNewUrlParser: true })
    .then(() => console.log('Connected to database'))
    .catch(console.log)
