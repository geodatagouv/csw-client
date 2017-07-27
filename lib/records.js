'use strict'

/* eslint indent: ['error', 2] */
const { get } = require('lodash')

const RECORD_DEFINITION = {
  getId(recordBody) {
    return recordBody.identifier
  },

  getTitle(recordBody) {
    return recordBody.title
  },
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
    },
  },

  FC_FeatureCatalogue: {
    getId(recordBody) {
      return recordBody.uuid
    },

    getTitle(recordBody) {
      return recordBody.name
    },
  },
}

function withSummary(record) {
  const { type, body } = record
  if (!(type in TYPES)) return record

  const def = TYPES[record.type]
  return {
    type,
    body,
    id: def.getId(body),
    title: def.getTitle(body),
  }
}

module.exports = { withSummary }
