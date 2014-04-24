/*
** Module dependencies
*/
var request = require('superagent');
var _ = require('lodash');
var libxml = require('libxmljs');
var namespaces = require('./namespaces');
var harvest = require('./harvest');


/*
** Constructor
*/
function Client(url, options) {
    if (!url) throw new Error('URL is required!');
    this.url = url;
    this.options = options || {};
}

/*
** Private methods
*/
Client.prototype.request = function(query, cb) {
    return request
        .get(this.url)
        .query({ service: 'CSW', version: '2.0.2' })
        .query(query)
        .buffer()
        .end(function(err, res) {
            if (err) return cb(err);
            if (!res.text || !res.text.length) return cb(new Error('Empty body'));

            var xmlDoc;
            try {
                xmlDoc = libxml.parseXml(res.text, { noblanks: true });
                cb(null, xmlDoc);
            } catch(e) {
                console.log(res.req.path);
                console.log(res.text);
                cb(e);
            }
        });
};

Client.prototype.mapOptions = function(options) {
    var query = {};
    // Mapping original params
    _.extend(query, _.pick(options, 'maxRecords', 'startPosition', 'typeNames', 'outputSchema', 'elementSetName', 'resultType'));
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
        constraintLanguage: 'CQL_TEXT',
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
            console.log(xmlDoc.toString());
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
