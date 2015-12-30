/*
** Module dependencies
*/
var request = require('request');
var Parser = require('inspire-parser').Parser;
var _ = require('lodash');
var Harvester = require('./harvest');
var stringstream = require('stringstream');


/*
** Constructor
*/
function Client(url, options) {
    if (!url) throw new Error('URL is required!');
    options = options || {};

    this.baseRequest = request.defaults({
        url: url,
        qs: _.extend({ service: 'CSW', version: '2.0.2' }, options.queryStringToAppend || {}),
        qsStringifyOptions: { encode: !options.noEncodeQs },
        headers: {
            'User-Agent': options.userAgent || 'CSWBot',
        },
        agentOptions: options.agentOptions,
        timeout: options.timeout * 1000,
        gzip: options.gzip !== false,
    });
}

/*
** Private methods
*/
Client.prototype.request = function(query) {
    const req = this.baseRequest({ qs: query });

    req.on('response', response => {
        if (! response.headers['content-type'] || response.headers['content-type'].indexOf('xml') === -1) {
            req.emit('error', new Error('Not an XML response'));
            return response.destroy();
        }
        if (response.statusCode >= 400) {
            req.emit('error', new Error('Responded with an error status code: ' + response.statusCode));
            return response.destroy();
        }
    });

    return req;
};

Client.prototype.mapOptions = function(options) {
    var query = {};
    // Mapping original params
    _.assign(query, _.pick(options, 'maxRecords', 'startPosition', 'typeNames', 'outputSchema', 'elementSetName', 'resultType', 'namespace', 'constraintLanguage'));
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
        typeNames: 'csw:Record',
    });

    options.request = 'GetRecords';

    this.request(options, cb);
};

Client.prototype.getCapabilities = function() {
    return this.request({ request: 'GetCapabilities' });
};

Client.prototype.capabilities = function (done) {
    const doneOnce = _.once(done);
    const parser = new Parser();
    this.getCapabilities()
        .on('error', err => doneOnce(err))
        .pipe(stringstream('utf8'))
        .pipe(parser)
            .on('error', err => doneOnce(err))
            .on('end', () => doneOnce(new Error('No parsed content')))
            .on('result', result => doneOnce(null, result));
};

Client.prototype.numRecords = function(options, cb) {
    if (!cb) {
        cb = options;
        options = {};
    }

    options = this.mapOptions(options);
    options.resultType = 'hits';

    this.getRecords(options, function(err, result) {
        if (err) return cb(err);
        if (result.searchResults && result.searchResults.numberOfRecordsMatched) {
            cb(null, parseInt(result.searchResults.numberOfRecordsMatched));
        } else {
            cb(new Error('Unable to find numberOfRecordsMatched attribute'));
        }
    });
};

Client.prototype.harvest = function(options) {
    return new Harvester(this, options);
};


/*
** Exports
*/
module.exports = Client;
