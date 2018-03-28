'use strict'

/* eslint-env mocha */
const fs = require('fs')
const {join} = require('path')
const nock = require('nock')
const csw = require('..')
const stringstream = require('stringstream')

const chai = require('chai')

const {expect} = chai
const chaiAsPromised = require('chai-as-promised')

chai.use(chaiAsPromised)

async function collectStream(readablePromise) {
  const readable = await readablePromise

  return new Promise((resolve, reject) => {
    const buffer = []
    readable
      .on('error', reject)
      .pipe(stringstream('utf8'))
      .on('error', reject)
      .on('data', chunk => buffer.push(chunk))
      .on('end', () => resolve(buffer.join()))
  })
}

describe('#constructor', () => {
  describe('New client without url', () => {
    it('should throw an error', () => {
      expect(() => csw()).to.throw('serviceUrl is required!')
    })
  })
})

describe('#generic request', () => {
  describe('Response with bad content-type', () => {
    it('should emit an error', () => {
      nock('http://test-client')
        .get('/csw')
        .query({service: 'CSW', version: '2.0.2', request: 'GetCapabilities'})
        .reply(200, {'Content-Type': 'text/html'})

      return expect(collectStream(csw('http://test-client/csw').getCapabilities())).to.eventually
        .be.rejectedWith('Not an XML response')
        .and.be.an.instanceOf(Error)
    })
  })
  describe('Response with status code = 400', () => {
    it('should emit an error', () => {
      nock('http://test-client')
        .get('/csw')
        .query({service: 'CSW', version: '2.0.2', request: 'GetCapabilities'})
        .reply(400, '', {'Content-Type': 'application/xml'})

      return expect(collectStream(csw('http://test-client/csw').getCapabilities())).to.eventually
        .be.rejectedWith('Responded with an error status code: 400')
        .and.be.an.instanceOf(Error)
    })
  })
})

describe('#capabilities', () => {
  describe('When server responds with valid capabilities', () => {
    const content = fs.readFileSync(join(__dirname, 'fixtures', 'capabilities-ok.xml'), 'utf8')
    function hiNock() {
      nock('http://test-client')
        .get('/csw')
        .query({service: 'CSW', version: '2.0.2', request: 'GetCapabilities'})
        .reply(200, content, {'Content-Type': 'application/xml;charset=UTF-8'})
    }

    it('getCapabilities() should return a stream with valid content', () => {
      hiNock()
      return expect(collectStream(csw('http://test-client/csw').getCapabilities())).to.eventually
        .become(content)
    })

    it('capabilities() should return capabilities', () => {
      hiNock()
      return expect(csw('http://test-client/csw').capabilities()).to.eventually
        .have.nested.property('serviceIdentification.title', 'GéoPicardie catalog')
    })
  })

  describe('When server responds with truncated capabilities', () => {
    const content = fs.readFileSync(join(__dirname, 'fixtures', 'capabilities-truncated.xml'), 'utf8')
    function hiNock() {
      nock('http://test-client')
        .get('/csw')
        .query({service: 'CSW', version: '2.0.2', request: 'GetCapabilities'})
        .reply(200, content, {'Content-Type': 'application/xml;charset=UTF-8'})
    }

    it('getCapabilities() should return a stream with valid content', () => {
      hiNock()
      return expect(collectStream(csw('http://test-client/csw').getCapabilities())).to.eventually
        .become(content)
    })

    it('capabilities should throw an exception', () => {
      hiNock()
      return expect(csw('http://test-client/csw').capabilities()).to.eventually
        .be.rejectedWith('Unclosed root tag')
    })
  })
})

describe('#records', () => {
  describe('When server responds with valid result', () => {
    const content = fs.readFileSync(join(__dirname, 'fixtures', 'records-results-basic.xml'), 'utf8')
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
          outputSchema: 'http://www.opengis.net/cat/csw/2.0.2',
          maxRecords: 20
        })
        .reply(200, content, {'Content-Type': 'application/xml;charset=UTF-8'})
    }

    it('getRecords() should return a stream with valid content', () => {
      hiNock()
      return expect(collectStream(csw('http://test-client/csw').getRecords())).to.eventually
        .become(content)
    })

    it('records() should return records', () => {
      hiNock()
      return expect(csw('http://test-client/csw').records()).to.eventually
        .include({returned: 10, matched: 965})
        .and.have.nested.property('records.length', 10)
    })
  })
})

describe('#count', () => {
  describe('When server responds with valid result', () => {
    const content = fs.readFileSync(join(__dirname, 'fixtures', 'records-hits-basic.xml'), 'utf8')
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
          outputSchema: 'http://www.opengis.net/cat/csw/2.0.2',
          maxRecords: 20
        })
        .reply(200, content, {'Content-Type': 'application/xml;charset=UTF-8'})
    }

    it('count() should return records count', () => {
      hiNock()
      return expect(csw('http://test-client/csw').count()).to.eventually
        .become(965)
    })
  })
})
