'use strict'
/* eslint camelcase: off */

const hasha = require('hasha')
const stringify = require('json-stable-stringify')
const {get, omit} = require('lodash')

const RECORD_DEFINITION = {
  idKey: 'identifier',
  titleKey: 'title',
  modifiedKey: 'modified',
  hashOmitKeys: ['modified']
}

const TYPES = {
  Record: RECORD_DEFINITION,
  SummaryRecord: RECORD_DEFINITION,
  BriefRecord: RECORD_DEFINITION,

  MD_Metadata: {
    idKey: 'fileIdentifier',
    titleKey: 'identificationInfo.citation.title',
    modifiedKey: 'dateStamp',
    hashOmitKeys: ['dateStamp']
  },

  FC_FeatureCatalogue: {
    idKey: 'uuid',
    titleKey: 'name'
  }
}

function withSummary(record) {
  const {type, body} = record
  if (!(type in TYPES)) {
    return record
  }

  const def = TYPES[record.type]
  const {idKey, titleKey, modifiedKey} = def
  const hashOmitKeys = def.hashOmitKeys || []

  const id = get(body, idKey)

  const result = {
    title: get(body, titleKey),
    modified: modifiedKey ? get(body, modifiedKey) : undefined,
    body,
    type,
    hash: computeHash(stringify(omit(body, hashOmitKeys)))
  }

  if (id) {
    result.originalId = id
    result.id = computeHash(id)
  }

  return result
}

function expandRecord(rawRecord) {
  return withSummary({
    body: omit(rawRecord, '@elementType'),
    type: rawRecord['@elementType']
  })
}

function computeHash(string) {
  return hasha(string, {algorithm: 'sha1'})
}

module.exports = {withSummary, expandRecord}
