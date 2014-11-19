/*
** Module dependencies
*/
var HttpAgent = require('http').Agent;
var HttpsAgent = require('https').Agent;
var parseUrl = require('url').parse;

var request = require('superagent');
require('superagent-retry')(request);
var _ = require('lodash');
var libxml = require('libxmljs');
var debug = require('debug');
var log = debug('csw-client:main');
var logRequest = debug('csw-client:request');

var namespaces = require('./namespaces');
var harvest = require('./harvest');


/*
** Config
*/
var Agent = {
  'http:': HttpAgent,
  'https:': HttpsAgent
};

/*
** Constructor
*/
function Client(url, options) {
    if (!url) throw new Error('URL is required!');
    this.url = url;
    this.options = options || {};
    this.queryStringToAppend = options.queryStringToAppend || {};

    if (this.options.maxSockets || this.options.keepAlive) {
        this.agent = new Agent[parseUrl(url).protocol](_.pick(this.options, 'keepAlive', 'maxSockets'));
    }

    log('new client created for %s', url);
}

/*
** Private methods
*/
Client.prototype.request = function(query, cb) {
    var req = request
        .get(this.url)
        .query({ service: 'CSW', version: '2.0.2' })
        .query(this.queryStringToAppend)
        .query(query);

    if (this.agent) req.agent(this.agent); // Must be called before any set/unset method!
    if (this.options.userAgent) req.set('User-Agent', this.options.userAgent);

    if (this.options.retry) {
        log('retry accepted: %d', this.options.retry);
        req.retry(this.options.retry);
    }

    req.buffer()
        .end(function(err, res) {

            function propagateError(message, error) {
                logRequest(message);
                return cb(error || new Error(message));
            }

            if (err) {
                return propagateError('connectivity error: ' + err.message, err);
            }

            if (res.error) {
                return propagateError('Server responded with error code ' + res.status);
            }

            if (!res.text || !res.text.length) {
                return propagateError('Server sent an empty body');
            }


            try {
                var parsedDocument = libxml.parseXml(res.text, { noblanks: true });
                cb(null, parsedDocument);
            } catch(e) {
                return propagateError('Parsing error', err);
            }

        });

    logRequest('GET %s', req.req.path);

    return req;
};

Client.prototype.mapOptions = function(options) {
    var query = {};
    // Mapping original params
    _.extend(query, _.pick(options, 'maxRecords', 'startPosition', 'typeNames', 'outputSchema', 'elementSetName', 'resultType', 'namespace', 'constraintLanguage'));
    if (options.limit) query.maxRecords = options.limit;
    if (options.offset) query.startPosition = options.offset + 1;
    return query;
};

/*
** Public methods
*/
Client.prototype.getRecordById = function(id, options, cb) {
    if (!cb) {
        cb = options;
        options = {};
    }

    if (_.isArray(id)) {
        id = id.join(',');
    }

    options = this.mapOptions(options);
    options.request = 'GetRecordById';
    options.id = id;

    this.request(options, cb);
};

Client.prototype.getRecords = function(options, cb) {
    if (!cb) {
        cb = options;
        options = {};
    }

    options = this.mapOptions(options);

    _.defaults(options, {
        resultType: 'results',
        maxRecords: 10,
        typeNames: 'csw:Record'
    });

    options.request = 'GetRecords';

    this.request(options, cb);
};

Client.prototype.getCapabilities = function(cb) {
    this.request({ request: 'GetCapabilities' }, cb);
};

Client.prototype.numRecords = function(options, cb) {
    if (!cb) {
        cb = options;
        options = {};
    }

    options = this.mapOptions(options);
    options.resultType = 'hits';

    this.getRecords(options, function(err, xmlDoc) {
        if (err) return cb(err);
        var numberOfRecordsMatched = xmlDoc.get('//csw:SearchResults/@numberOfRecordsMatched', namespaces);
        if (numberOfRecordsMatched) cb(null, parseInt(numberOfRecordsMatched.value()));
        else {
            cb(new Error('Unable to find numberOfRecordsMatched attribute'));
        }
    });
};

Client.prototype.harvest = function(options) {
    return harvest(this, options);
};


/*
** Exports
*/
module.exports = Client;
