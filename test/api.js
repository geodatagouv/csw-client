/* eslint-env mocha */
const nock = require('nock');
const fs = require('fs');
const expect = require('expect.js');
const _ = require('lodash');
const csw = require('../');
const stringstream = require('stringstream');

function collectStream(readable, done) {
    const doneOnce = _.once(done);
    const buffer = [];
    readable
        .on('error', err => doneOnce(err))
        .pipe(stringstream('utf8'))
            .on('error', err => doneOnce(err))
            .on('data', chunk => buffer.push(chunk))
            .on('end', () => doneOnce(null, buffer.join()));
}

describe('#constructor', function () {
    describe('New client without url', function () {
        it('should throw an error', function () {
            expect(() => csw()).to.throwException(err => {
                expect(err.message).to.equal('URL is required!');
            });
        });
    });
});

describe('#generic request', function () {
    describe('Response with bad content-type', function () {
        it('should emit an error', function (done) {
            nock('http://test-client')
                .get('/csw')
                .query({ service: 'CSW', version: '2.0.2', request: 'GetCapabilities' })
                .reply(200, { 'Content-Type': 'text/html' });

            collectStream(csw('http://test-client/csw').getCapabilities(), function (err) {
                expect(err).to.be.an(Error);
                expect(err.message).to.equal('Not an XML response');
                done();
            });
        });
    });
    describe('Response with status code = 400', function () {
        it('should emit an error', function (done) {
            nock('http://test-client')
                .get('/csw')
                .query({ service: 'CSW', version: '2.0.2', request: 'GetCapabilities' })
                .reply(400, '', { 'Content-Type': 'application/xml' });

            collectStream(csw('http://test-client/csw').getCapabilities(), function (err) {
                expect(err).to.be.an(Error);
                expect(err.message).to.equal('Responded with an error status code: 400');
                done();
            });
        });
    });
});

describe('#capabilities', function () {
    describe('When server responds with valid capabilities', function () {
        const content = fs.readFileSync(__dirname + '/fixtures/capabilities-ok.xml', 'utf8');
        function hiNock() {
            nock('http://test-client')
                .get('/csw')
                .query({ service: 'CSW', version: '2.0.2', request: 'GetCapabilities' })
                .reply(200, content, { 'Content-Type': 'application/xml;charset=UTF-8' });
        }

        it('getCapabilities() should return a stream with valid content', function (done) {
            hiNock();
            collectStream(csw('http://test-client/csw').getCapabilities(), function (err, response) {
                expect(err).to.be(null);
                expect(response).to.be.eql(content);
                done();
            });
        });

        it('capabilities() should return capabilities', function (done) {
            hiNock();
            csw('http://test-client/csw').capabilities((err, capabilities) => {
                expect(err).to.be(null);
                expect(capabilities.serviceIdentification.title).to.be('GéoPicardie catalog');
                done();
            });
        });
    });

    describe('When server responds with truncated capabilities', function () {
        const content = fs.readFileSync(__dirname + '/fixtures/capabilities-truncated.xml', 'utf8');
        function hiNock() {
            nock('http://test-client')
                .get('/csw')
                .query({ service: 'CSW', version: '2.0.2', request: 'GetCapabilities' })
                .reply(200, content, { 'Content-Type': 'application/xml;charset=UTF-8' });
        }

        it('getCapabilities() should return a stream with valid content', function (done) {
            hiNock();
            collectStream(csw('http://test-client/csw').getCapabilities(), function (err, response) {
                expect(err).to.be(null);
                expect(response).to.be.eql(content);
                done();
            });
        });

        it('capabilities should return truncated capabilities', function (done) {
            hiNock();
            csw('http://test-client/csw').capabilities((err, capabilities) => {
                expect(err).to.be(null);
                expect(capabilities.serviceIdentification.title).to.be('GéoPicar');
                done();
            });
        });
    });
});
