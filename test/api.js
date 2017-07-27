'use strict'

/* eslint-env mocha */
const nock = require('nock')
const fs = require('fs')
const csw = require('../')
const stringstream = require('stringstream')
const Promise = require('bluebird')

const chai = require('chai')
const expect = chai.expect
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)

function collectStream(readablePromise) {
  return readablePromise
    .then(readable => new Promise((resolve, reject) => {
      const buffer = []
      readable
        .on('error', reject)
        .pipe(stringstream('utf8'))
        .on('error', reject)
        .on('data', chunk => buffer.push(chunk))
        .on('end', () => resolve(buffer.join()))
    }))
}

describe('#constructor', function () {
  describe('New client without url', function () {
    it('should throw an error', function () {
      expect(() => csw()).to.throw('URL is required!')
    })
  })
})

describe('#generic request', function () {
  describe('Response with bad content-type', function () {
    it('should emit an error', function () {
      nock('http://test-client')
        .get('/csw')
        .query({ service: 'CSW', version: '2.0.2', request: 'GetCapabilities' })
        .reply(200, { 'Content-Type': 'text/html' })

      return expect(collectStream(csw('http://test-client/csw').getCapabilities())).to.eventually
        .be.rejectedWith('Not an XML response')
        .and.be.an.instanceOf(Error)
    })
  })
  describe('Response with status code = 400', function () {
    it('should emit an error', function () {
      nock('http://test-client')
        .get('/csw')
        .query({ service: 'CSW', version: '2.0.2', request: 'GetCapabilities' })
        .reply(400, '', { 'Content-Type': 'application/xml' })

      return expect(collectStream(csw('http://test-client/csw').getCapabilities())).to.eventually
        .be.rejectedWith('Responded with an error status code: 400')
        .and.be.an.instanceOf(Error)
    })
  })
})

describe('#capabilities', function () {
  describe('When server responds with valid capabilities', function () {
    const content = fs.readFileSync(__dirname + '/fixtures/capabilities-ok.xml', 'utf8')
    function hiNock() {
      nock('http://test-client')
        .get('/csw')
        .query({ service: 'CSW', version: '2.0.2', request: 'GetCapabilities' })
        .reply(200, content, { 'Content-Type': 'application/xml;charset=UTF-8' })
    }

    it('getCapabilities() should return a stream with valid content', function () {
      hiNock()
      return expect(collectStream(csw('http://test-client/csw').getCapabilities())).to.eventually
        .become(content)
    })

    it('capabilities() should return capabilities', function () {
      hiNock()
      return expect(csw('http://test-client/csw').capabilities()).to.eventually
        .have.deep.property('serviceIdentification.title', 'GéoPicardie catalog')
    })
  })

  describe('When server responds with truncated capabilities', function () {
    const content = fs.readFileSync(__dirname + '/fixtures/capabilities-truncated.xml', 'utf8')
    function hiNock() {
      nock('http://test-client')
        .get('/csw')
        .query({ service: 'CSW', version: '2.0.2', request: 'GetCapabilities' })
        .reply(200, content, { 'Content-Type': 'application/xml;charset=UTF-8' })
    }

    it('getCapabilities() should return a stream with valid content', function () {
      hiNock()
      return expect(collectStream(csw('http://test-client/csw').getCapabilities())).to.eventually
        .become(content)
    })

    it('capabilities should return truncated capabilities', function () {
      hiNock()
      return expect(csw('http://test-client/csw').capabilities()).to.eventually
        .have.deep.property('serviceIdentification.title', 'GéoPicar')
    })
  })
})

describe('#records', function () {
  describe('When server responds with valid result', function () {
    const content = fs.readFileSync(__dirname + '/fixtures/records-results-basic.xml', 'utf8')
    function hiNock() {
      nock('http://test-client')
        .get('/csw')
        .query({
          service: 'CSW',
          version: '2.0.2',
          request: 'GetRecords',
          resultType: 'results',
          elementSetName: 'full',
          typeNames: 'csw:Record',
          maxRecords: 10,
        })
        .reply(200, content, { 'Content-Type': 'application/xml;charset=UTF-8' })
    }

    it('getRecords() should return a stream with valid content', function () {
      hiNock()
      return expect(collectStream(csw('http://test-client/csw').getRecords())).to.eventually
        .become(content)
    })

    it('records() should return records', function () {
      hiNock()
      return expect(csw('http://test-client/csw').records()).to.eventually
        .include({ returned: 10, matched: 965 })
        .and.have.deep.property('records.length', 10)
    })
  })
})

describe('#count', function () {
  describe('When server responds with valid result', function () {
    const content = fs.readFileSync(__dirname + '/fixtures/records-hits-basic.xml', 'utf8')
    function hiNock() {
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
    }

    it('count() should return records count', function () {
      hiNock()
      return expect(csw('http://test-client/csw').count()).to.eventually
        .become(965)
    })
  })
})
