const request = require('request');
const Parser = require('inspire-parser').Parser;
const { once, pick, defaults, clone } = require('lodash');
const Harvester = require('./harvest');
const stringstream = require('stringstream');
const EventEmitter = require('events').EventEmitter;


function parseResponse(reqResponse, done) {
    const doneOnce = once(done);
    const parser = new Parser();
    reqResponse
        .on('error', err => doneOnce(err))
        .pipe(stringstream('utf8'))
        .pipe(parser)
            .on('error', err => doneOnce(err))
            .on('end', () => doneOnce(new Error('No parsed content')))
            .on('result', result => doneOnce(null, result));
}

class Client extends EventEmitter {

    constructor(url, options = {}) {
        if (!url) throw new Error('URL is required!');
        super();

        this.baseRequest = request.defaults({
            url: url,
            qs: Object.assign({ service: 'CSW', version: '2.0.2' }, options.appendQs || {}),
            qsStringifyOptions: { encode: options.encodeQs !== false },
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
        this.emit('request', req);

        req.once('response', response => {
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

    getRecords(options = {}) {
        if (options.schema === 'inspire') {
            options.typeNames = 'gmd:MD_Metadata';
            options.outputSchema = 'http://www.isotc211.org/2005/gmd';
        }
        options = pick(options,
            'maxRecords',
            'startPosition',
            'typeNames',
            'outputSchema',
            'elementSetName',
            'resultType',
            'namespace',
            'constraintLanguage');
        defaults(options, {
            resultType: 'results',
            elementSetName: 'full',
            typeNames: 'csw:Record',
            maxRecords: 10,
        });
        options.request = 'GetRecords';
        return this.request(options);
    }

    records(options, done) {
        if (!done) {
            done = options;
            options = {};
        }
        parseResponse(this.getRecords(options), function (err, result) {
            if (err) return done(err);
            if (result.type !== 'GetRecordsResponse') return done(new Error('Not acceptable response type: ' + result.type));
            done(null, {
                records: result.body.searchResults.children || [],
                matched: parseInt(result.body.searchResults.numberOfRecordsMatched),
                returned: parseInt(result.body.searchResults.numberOfRecordsReturned),
            });
        });
    }

    count(options, done) {
        if (!done) {
            done = options;
            options = {};
        }
        options = clone(options);
        options.resultType = 'hits';
        this.records(options, (err, result) => {
            if (err) return done(err);
            if (result.matched >= 0) return done(null, result.matched);
            done(new Error('Invalid count result'));
        });
    }

    /* Legacy */

    harvest(options) {
        return new Harvester(this, options);
    }

}

module.exports = Client;
