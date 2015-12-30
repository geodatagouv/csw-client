'use strict';
const request = require('request');
const Parser = require('inspire-parser').Parser;
const _ = require('lodash');
const Harvester = require('./harvest');
const stringstream = require('stringstream');


function parseResponse(reqResponse, done) {
    const doneOnce = _.once(done);
    const parser = new Parser();
    reqResponse
        .on('error', err => doneOnce(err))
        .pipe(stringstream('utf8'))
        .pipe(parser)
            .on('error', err => doneOnce(err))
            .on('end', () => doneOnce(new Error('No parsed content')))
            .on('result', result => doneOnce(null, result));
}

class Client {

    constructor(url, options) {
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

    request(query) {
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
    }

    getCapabilities() {
        return this.request({ request: 'GetCapabilities' });
    }

    capabilities(done) {
        parseResponse(this.getCapabilities(), function (err, result) {
            if (err) return done(err);
            if (result.type !== 'Capabilities') return done(new Error('Not acceptable response type: ' + result.type));
            done(null, result.body);
        });
    }

    mapOptions(options) {
        var query = {};
        // Mapping original params
        _.assign(query, _.pick(options, 'maxRecords', 'startPosition', 'typeNames', 'outputSchema', 'elementSetName', 'resultType', 'namespace', 'constraintLanguage'));
        if (options.limit) query.maxRecords = options.limit;
        if (options.offset) query.startPosition = options.offset + 1;
        return query;
    }


    getRecordById(id, options, cb) {
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
    }

    getRecords(options, cb) {
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
    }

    numRecords(options, cb) {
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
    }

    harvest(options) {
        return new Harvester(this, options);
    }

}

module.exports = Client;
