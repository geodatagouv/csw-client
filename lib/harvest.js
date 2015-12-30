'use strict';
const Readable = require('stream').Readable;
const _ = require('lodash');

class Harvester extends Readable {

    constructor(client, options) {
        super({ objectMode: true });

        this.client = client;
        this.options = options || {};
        this.step = this.options.step || 20;
        this.concurrency = this.options.concurrency || 3;
        this.returned = 0;
        this.buffer = [];
        this.claimed = 0;
    }

    _read() {
        if (this.buffer.length > 0) {
            this.push(this.buffer.shift());
            return;
        }

        this.claimed++;

        if (!this.starting && !this.started) return this.init();
        if (this.started) return this.getMoreRecords();
    }

    init() {
        this.starting = true;
        this.startDate = Date.now();
        this.emit('starting');

        this.client.count(_.clone(this.options), (err, count) => {
            if (err) {
                this.failed = true;
                this.emit('error', err);
                this.emit('failed');
                this.finish();
                return;
            }

            this.matched = count;
            this.offset = 0;
            this.pendingRequests = 0;
            this.started = true;
            this.emit('started');

            if (count === 0) {
                this.finish();
            } else {
                this.getMoreRecords();
            }
        });
    }

    onRawRecord(rawRecord) {
        const record = {
            body: _.omit(rawRecord, '@elementType'),
            type: rawRecord['@elementType'],
        };
        this.returned++;
        this.emit('record', record);

        this.buffer.push(record);
        if (this.claimed > 0) {
            this.claimed--;
            this.push(this.buffer.shift());
        }
    }

    getMoreRecords() {
        if (!this.hasMoreRecords()) return;
        if (this.pendingRequests >= this.concurrency) return;

        var query = _.clone(this.options);
        query.maxRecords = this.step;
        query.startPosition = this.offset + 1;

        this.pendingRequests++;

        this.client.records(query, (err, result) => {
            if (err) {
                this.emit('error', err);
            } else {
                result.records.forEach(rawRecord => this.onRawRecord(rawRecord));
            }

            this.pendingRequests--;
            if (this.claimed > 0) this.getMoreRecords();
            if (!this.hasMoreRecords() && this.pendingRequests === 0) this.finish();
        });

        this.offset = this.offset + this.step;
    }

    hasMoreRecords() {
        return this.offset < this.matched;
    }

    drainBuffer() {
        while (this.buffer.length > 0) {
            this.push(this.buffer.shift());
        }
    }

    finish() {
        if (this.finished) return;
        this.drainBuffer();
        this.finished = true;
        this.duration = Date.now() - this.startDate;
        this.push(null);
    }

}

module.exports = Harvester;
