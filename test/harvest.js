/* eslint-env mocha */
const nock = require('nock');
const fs = require('fs');
const expect = require('chai').expect;
const csw = require('../');

describe('Harvester', function () {
    describe('When all records are in a single page', function () {
        const content = fs.readFileSync(__dirname + '/fixtures/harvest-records-onepage.xml', 'utf8');

        it('should harvest with success', function (done) {
            nock('http://test-client')
                .get('/csw')
                .query({
                    service: 'CSW',
                    version: '2.0.2',
                    request: 'GetRecords',
                    resultType: 'hits',
                    elementSetName: 'full',
                    typeNames: 'csw:Record',
                    maxRecords: 10,
                })
                .reply(200, content, { 'Content-Type': 'application/xml;charset=UTF-8' })
                .get('/csw')
                .query({
                    service: 'CSW',
                    version: '2.0.2',
                    request: 'GetRecords',
                    resultType: 'results',
                    elementSetName: 'full',
                    typeNames: 'csw:Record',
                    maxRecords: 10,
                    startPosition: 1,
                })
                .reply(200, content, { 'Content-Type': 'application/xml;charset=UTF-8' });
            const harvester = csw('http://test-client/csw').harvest({ step: 10 });
            harvester.on('end', () => {
                expect(harvester.returned).to.equal(10);
                done();
            });
            harvester.resume();
        });
    });
});
