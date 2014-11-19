/*
** Module dependencies
*/
var async = require('async');
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var debug = require('debug');
var log = debug('csw-client:harvest');
var namespaces = require('./namespaces');


/*
** Methods
*/
function harvest(client, options) {
    var emitter = new EventEmitter();
    var stats = {};
    var limit = 20;

    client.numRecords(options, function(err, numRecords) {
        if (err) {
            emitter.emit('error', err);
            emitter.emit('end', err);
            return;
        }

        stats.matched = numRecords;
        stats.start = Date.now();
        stats.returned = 0;

        emitter.emit('start', stats);

        if (numRecords === 0) {
            stats.duration = Date.now() - stats.start;
            emitter.emit('end', null, stats);
        } else {
            async.each(
                _.range(0, numRecords, limit),
                function(offset, cb) {
                    var query = _.clone(options);
                    query.maxRecords = limit;
                    query.startPosition = offset + 1;
                    client.getRecords(query, function(err, xmlDoc) {
                        if (err) {
                            emitter.emit('error', err);
                            return cb();
                        }

                        var returned = xmlDoc.get('//csw:SearchResults/@numberOfRecordsReturned', namespaces);
                        var results = xmlDoc.find('//csw:SearchResults/child::*', namespaces);

                        emitter.emit('page', { asked: limit, announced: parseInt(returned.value()), found: results.length });

                        if (_.isArray(results)) {
                            results.forEach(function(record) {
                                stats.returned++;
                                emitter.emit('record', { record: record, stats: stats });
                            });
                        }

                        log('%d/%d entries found', stats.returned, stats.matched);

                        cb();
                    });
                },
                function() {
                    stats.duration = Date.now() - stats.start;
                    emitter.emit('end', null, stats);
                }
            );
        }

    });

    return emitter;
}


/*
** Exports
*/
module.exports = harvest;
