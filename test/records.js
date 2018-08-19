'use strict'

/* eslint no-unused-expressions: off */
/* eslint-env mocha */
const chai = require('chai')

const {expect} = chai
const {withSummary} = require('../lib/records')

describe('records#withSummary()', () => {
  describe('MD_Metadata', () => {
    it('should compute additional properties', () => {
      const type = 'MD_Metadata'
      const body = {
        dateStamp: '2018-01-01T00:00:00.000Z',
        fileIdentifier: '12345',
        identificationInfo: {citation: {title: 'Dataset #1'}}
      }
      const result = withSummary({type, body})
      expect(result.type).to.equal('MD_Metadata')
      expect(result.originalId).to.equal('12345')
      expect(result.id).to.equal('8cb2237d0679ca88db6464eac60da96345513964')
      expect(result.title).to.equal('Dataset #1')
      expect(result.body).to.equal(body)
      expect(result.modified).to.equal('2018-01-01T00:00:00.000Z')
      expect(Object.keys(result).length).to.equal(7)
    })
  })

  describe('Record', () => {
    it('should compute additional properties', () => {
      const type = 'Record'
      const body = {
        identifier: '5678944',
        title: 'Dataset #2019',
        modified: '2018-01-01T00:00:00.000Z'
      }
      const result = withSummary({type, body})
      expect(result.type).to.equal('Record')
      expect(result.originalId).to.equal('5678944')
      expect(result.id).to.equal('ef6ef978fa1f9c7effd3f780f1e510b3a8f1c73c')
      expect(result.title).to.equal('Dataset #2019')
      expect(result.body).to.equal(body)
      expect(result.modified).to.equal('2018-01-01T00:00:00.000Z')
      expect(Object.keys(result).length).to.equal(7)
    })
  })

  describe('FC_FeatureCatalogue', () => {
    it('should compute `id` and `title` properly', () => {
      const type = 'FC_FeatureCatalogue'
      const body = {
        uuid: '00000',
        name: 'Attribute catalog'
      }
      const result = withSummary({type, body})
      expect(result.type).to.equal('FC_FeatureCatalogue')
      expect(result.originalId).to.equal('00000')
      expect(result.id).to.equal('6934105ad50010b814c933314b1da6841431bc8b')
      expect(result.title).to.equal('Attribute catalog')
      expect(result.body).to.equal(body)
      expect(Object.keys(result).length).to.equal(7)
    })
  })
})
