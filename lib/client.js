const Promise = require('bluebird');
const request = require('request');
const Parser = require('inspire-parser').Parser;
const { pick, defaults } = require('lodash');
const Harvester = require('./harvester');
const stringstream = require('stringstream');
const EventEmitter = require('events').EventEmitter;


function parseResponse(reqResponse) {
    return new Promise((resolve, reject) => {
        reqResponse
            .on('error', reject)
            .pipe(stringstream('utf8'))
            .pipe(new Parser())
                .on('error', reject)
                .on('end', () => reject(new Error('No parsed content')))
                .on('result', resolve);
    });
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
        return new Promise((resolve, reject) => {
            const req = this.baseRequest({ qs: query });
            this.emit('request', req);

            req.once('response', response => {
                if (response.statusCode >= 400) {
                    response.destroy();
                    reject(new Error('Responded with an error status code: ' + response.statusCode));
                }
                if (! response.headers['content-type'] || response.headers['content-type'].indexOf('xml') === -1) {
                    response.destroy();
                    reject(new Error('Not an XML response'));
                }

                response.pause();
                resolve(response);
            });

            req.on('error', reject);
        });
    }

    getCapabilities() {
        return this.request({ request: 'GetCapabilities' });
    }

    capabilities() {
        return this.getCapabilities()
            .then(parseResponse)
            .then(result => {
                if (result.type !== 'Capabilities') throw new Error('Not acceptable response type: ' + result.type);
                return result.body;
            });
    }

    getRecords(options = {}) {
        if (options.schema === 'inspire') {
            options.typeNames = 'gmd:MD_Metadata';
            options.outputSchema = 'http://www.isotc211.org/2005/gmd';
        }
        const params =  pick(options,
            'maxRecords',
            'startPosition',
            'typeNames',
            'outputSchema',
            'elementSetName',
            'resultType',
            'namespace',
            'constraintLanguage');
        defaults(params, {
            resultType: 'results',
            elementSetName: 'full',
            typeNames: 'csw:Record',
            maxRecords: 10,
        });
        if (options.omitElementSetName) params.elementSetName = undefined;
        params.request = 'GetRecords';
        return this.request(params);
    }

    records(options = {}) {
        return this.getRecords(options)
            .then(parseResponse)
            .then(result => {
                if (result.type !== 'GetRecordsResponse') throw new Error('Not acceptable response type: ' + result.type);
                return {
                    records: result.body.searchResults.children || [],
                    matched: parseInt(result.body.searchResults.numberOfRecordsMatched),
                    returned: parseInt(result.body.searchResults.numberOfRecordsReturned),
                };
            });
    }

    count(options = {}) {
        const recordOptions = Object.assign({}, options, { resultType: 'hits' });

        return this.records(recordOptions)
            .then(result => {
                if (result.matched >= 0) return result.matched;
                throw new Error('Invalid count result');
            });
    }

    getRecordById(id, options = {}) {
        if (options.schema === 'inspire') {
            options.typeNames = 'gmd:MD_Metadata';
            options.outputSchema = 'http://www.isotc211.org/2005/gmd';
        }
        const params =  pick(options,
            'typeNames',
            'outputSchema',
            'elementSetName',
            'namespace');
        defaults(params, {
            elementSetName: 'full',
            typeNames: 'csw:Record',
        });
        params.request = 'GetRecordById';
        params.id = id;
        return this.request(params);
    }

    record(id, options = {}) {
        return this.getRecordById(id, options)
            .then(parseResponse)
            .then(result => {
                if (result.type !== 'GetRecordByIdResponse') throw new Error('Not acceptable response type: ' + result.type);
                if (result.body.children.length === 0) throw new Error('No record returned');
                return result.body.children[0];
            });
    }

    /* Legacy */

    harvest(options) {
        return new Harvester(this, options);
    }

}

module.exports = Client;
