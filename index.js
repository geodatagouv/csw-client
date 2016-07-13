/*
** Module dependencies
*/
const Client = require('./lib/client');


/*
** Methods
*/
function csw(url, options) {
    return new Client(url, options);
}


/*
** Exports
*/
module.exports = csw;
