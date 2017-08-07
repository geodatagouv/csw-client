'use strict'

const validCompatOptions = [
  'define-constraint-language',
  'define-namespace',
  'no-encode-qs',
  'progressive-element-set-name',
]

function applyCompat(client, options) {
  if (options.request === 'GetRecords' && client.hasCompatOption('define-constraint-language')) {
    options.constraintLanguage = 'CQL_TEXT'
  }

  if (client.hasCompatOption('define-namespace')) {
    options.namespace = 'xmlns(gmd=http://www.isotc211.org/2005/gmd)'
  }
}

function detectCompatOptions(client, ex) {
  // Some implementation requires typeNames namespaces to be defined
  if (
    !client.hasCompatOption('define-namespace') &&
    ex.exceptionCode === 'InvalidParameterValue' &&
    ex.locator.toLowerCase() === 'typenames' &&
    ex.message.includes('namespace') &&
    ex.message.includes('prefix')
  ) {
    client.addCompatOption('define-namespace')
    return true
  }

  // Some implementation doesn't support regularly encoded query string
  if (
    !client.hasCompatOption('no-encode-qs') &&
    ex.exceptionCode === 'InvalidParameterValue' &&
    (ex.locator.toLowerCase() === 'typenames' || ex.locator.toLowerCase() === 'outputschema')
  ) {
    client.addCompatOption('no-encode-qs')
    return true
  }

  // Some implementation requires contraintLanguage to be defined
  if (
    !client.hasCompatOption('define-constraint-language') &&
    ex.exceptionCode === 'MissingParameterValue' &&
    ex.locator.toLowerCase() === 'constraintlanguage'
  ) {
    client.addCompatOption('define-constraint-language')
    return true
  }

  // Some broken implementation doesn't support elementSetName=full for GetRecords
  if (
    !client.hasCompatOption('progressive-element-set-name') &&
    ex.exceptionCode === 'NoApplicableCode' &&
    ex.message.includes('elementName has invalid XPath')
  ) {
    client.addCompatOption('progressive-element-set-name')
    return true
  }


  // No more rule
  return false
}

module.exports = { applyCompat, detectCompatOptions, validCompatOptions }
