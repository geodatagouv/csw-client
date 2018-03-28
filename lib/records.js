'use strict'
/* eslint camelcase: off */

const {get, omit} = require('lodash')

const RECORD_DEFINITION = {
  getId(recordBody) {
    return recordBody.identifier
  },

  getTitle(recordBody) {
    return recordBody.title
  }
}

const TYPES = {
  Record: RECORD_DEFINITION,
  SummaryRecord: RECORD_DEFINITION,
  BriefRecord: RECORD_DEFINITION,

  MD_Metadata: {
    getId(recordBody) {
      return recordBody.fileIdentifier
    },

    getTitle(recordBody) {
      return get(recordBody, 'identificationInfo.citation.title')
    }
  },

  FC_FeatureCatalogue: {
    getId(recordBody) {
      return recordBody.uuid
    },

    getTitle(recordBody) {
      return recordBody.name
    }
  }
}

function withSummary(record) {
  const {type, body} = record
  if (!(type in TYPES)) {
    return record
  }

  const def = TYPES[record.type]
  return {
    type,
    body,
    id: def.getId(body),
    title: def.getTitle(body)
  }
}

function expandRecord(rawRecord) {
  return withSummary({
    body: omit(rawRecord, '@elementType'),
    type: rawRecord['@elementType']
  })
}

module.exports = {withSummary, expandRecord}
