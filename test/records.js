/* eslint-env mocha */
/* eslint indent: ['error', 2] */
const chai = require('chai');
const expect = chai.expect;
const { withSummary } = require('../lib/records');

describe('records#withSummary()', () => {

  describe('MD_Metadata', () => {
    it('should compute `id` and `title` properly', () => {
      const type = 'MD_Metadata';
      const body = {
        fileIdentifier: '12345',
        identificationInfo: { citation: { title: 'Dataset #1' } },
      };
      expect(withSummary({ type, body })).to.eql({ type, body, id: '12345', title: 'Dataset #1' });
    });
  });

  describe('Record', () => {
    it('should compute `id` and `title` properly', () => {
      const type = 'Record';
      const body = {
        identifier: '5678944',
        title: 'Dataset #2019',
      };
      expect(withSummary({ type, body })).to.eql({ type, body, id: '5678944', title: 'Dataset #2019' });
    });
  });

  describe('SummaryRecord', () => {
    it('should compute `id` and `title` properly', () => {
      const type = 'SummaryRecord';
      const body = {
        identifier: '5678559',
        title: 'Dataset #2015',
      };
      expect(withSummary({ type, body })).to.eql({ type, body, id: '5678559', title: 'Dataset #2015' });
    });
  });

  describe('BriefRecord', () => {
    it('should compute `id` and `title` properly', () => {
      const type = 'BriefRecord';
      const body = {
        identifier: '56789',
        title: 'Dataset #201',
      };
      expect(withSummary({ type, body })).to.eql({ type, body, id: '56789', title: 'Dataset #201' });
    });
  });

  describe('MD_Metadata', () => {
    it('should compute `id` and `title` properly', () => {
      const type = 'MD_Metadata';
      const body = {
        fileIdentifier: '12345',
        identificationInfo: { citation: { title: 'Dataset #1' } },
      };
      expect(withSummary({ type, body })).to.eql({ type, body, id: '12345', title: 'Dataset #1' });
    });
  });

  describe('FC_FeatureCatalogue', () => {
    it('should compute `id` and `title` properly', () => {
      const type = 'FC_FeatureCatalogue';
      const body = {
        uuid: '00000',
        name: 'Attribute catalog',
      };
      expect(withSummary({ type, body })).to.eql({ type, body, id: '00000', title: 'Attribute catalog' });
    });
  });

});
