'use strict'

/* eslint-env mocha */
const fs = require('fs')
const {join} = require('path')
const nock = require('nock')
const {expect} = require('chai')
const csw = require('..')

describe('Harvester', () => {
  describe('When all records are in a single page', () => {
    const content = fs.readFileSync(join(__dirname, 'fixtures', 'harvest-records-onepage.xml'), 'utf8')

    it('should harvest with success', done => {
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
        .get('/csw')
        .query({
          service: 'CSW',
          version: '2.0.2',
          request: 'GetRecords',
          resultType: 'results',
          elementSetName: 'full',
          typeNames: 'csw:Record',
          outputSchema: 'http://www.opengis.net/cat/csw/2.0.2',
          maxRecords: 10,
          startPosition: 1
        })
        .reply(200, content, {'Content-Type': 'application/xml;charset=UTF-8'})
      const harvester = csw('http://test-client/csw').harvest({step: 10})
      harvester.on('end', () => {
        expect(harvester.returned).to.equal(10)
        done()
      })
      harvester.resume()
    })
  })
})
