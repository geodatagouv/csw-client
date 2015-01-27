/*
** Module dependencies
*/
var util = require('util');
var stream = require('stream');
var debug = require('debug');
var _ = require('lodash');

var namespaces = require('./namespaces');

var log = debug('csw-client:harvest');
var Readable = stream.Readable;


function Harvester(client, options) {
    Readable.call(this, { objectMode: true });
    this.client = client;
    this.options = options || {};
    this.step = this.options.step || 20;
    this.concurrency = this.options.concurrency || 3;
    this.returned = 0;
    this.buffer = [];
    this.claimed = 0;
}

util.inherits(Harvester, Readable);

Harvester.prototype._read = function() {
    if (this.buffer.length > 0) {
        this.push(this.buffer.shift());
        return;
    }

    this.claimed++;

    if (!this.starting && !this.started) return this.init();
    if (this.started) return this.getMoreRecords();
};

Harvester.prototype.init = function() {
    this.starting = true;
    this.startDate = Date.now();
    this.emit('starting');

    this.client.numRecords(this.options, _.bind(function(err, numRecords) {
        if (err) {
            this.failed = true;
            this.emit('error', err);
            this.emit('failed');
            this.finish();
            return;
        }

        this.matched = numRecords;
        this.offset = 0;
        this.pendingRequests = 0;
        this.started = true;
        this.emit('started');

        if (numRecords === 0) {
            this.finish();
        } else {
            this.getMoreRecords();
        }
    }, this));
};

Harvester.prototype.processRecord = function (record) {
    this.buffer.push(record);
    if (this.claimed > 0) {
        this.claimed--;
        this.push(this.buffer.shift());
    }
};

Harvester.prototype.getMoreRecords = function() {
    if (!this.hasMoreRecords()) return;
    if (this.pendingRequests >= this.concurrency) return;

    var query = _.clone(this.options);
    query.maxRecords = this.step;
    query.startPosition = this.offset + 1;

    this.pendingRequests++;

    this.client.getRecords(query, _.bind(function(err, xmlDoc) {
        if (err) {
            this.pendingRequests--;
            return this.emit('error', err);
        }

        var results = xmlDoc.find('//csw:SearchResults/child::*', namespaces);

        if (_.isArray(results)) {
            results.forEach(_.bind(function (record) {
                this.returned++;
                this.processRecord(record);
            }, this));
        }

        this.pendingRequests--;
        if (this.claimed > 0) this.getMoreRecords();

        if (!this.hasMoreRecords() && this.pendingRequests === 0) this.finish();

        log('%d/%d entries found', this.returned, this.matched);
    }, this));

    this.offset = this.offset + this.step;
};

Harvester.prototype.hasMoreRecords = function() {
    return this.offset < this.matched;
};

Harvester.prototype.finish = function() {
    log('finished');
    this.duration = Date.now() - this.startDate;
    this.push(null);
};


/*
** Exports
*/
module.exports = Harvester;
