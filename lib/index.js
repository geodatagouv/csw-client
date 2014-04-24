/*
** Module dependencies
*/
var Client = require('./client');
var namespaces = require('./namespaces');


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
csw.namespaces = namespaces;
