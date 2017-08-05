'use strict'

function applyCompatibilityOptions(originalOptions) {
  const options = Object.assign({}, originalOptions)

  if (originalOptions.defineConstraintLanguage) {
    options.constraintLanguage = 'CQL_TEXT'
  }

  if (originalOptions.defineNamespace) {
    options.namespace = 'xmlns(gmd=http://www.isotc211.org/2005/gmd)'
  }

  return options
}

function detectNewCompatibilityOption(client, ex) {
  // Some implementation requires typeNames namespaces to be defined
  if (
    !client.compatibilityOptions.defineNamespace &&
    ex.exceptionCode === 'InvalidParameterValue' &&
    ex.locator.toLowerCase() === 'typenames' &&
    ex.message.includes('namespace') &&
    ex.message.includes('prefix')
  ) {
    client.compatibilityOptions.defineNamespace = true
    return true
  }

  // Some implementation doesn't support regularly encoded query string
  if (
    !client.compatibilityOptions.noEncodeQs &&
    ex.exceptionCode === 'InvalidParameterValue' &&
    ex.locator.toLowerCase() === 'typenames' &&
    ex.message === 'invalid value'
  ) {
    client.compatibilityOptions.noEncodeQs = true
    return true
  }

  // Some implementation requires contraintLanguage to be defined
  if (
    !client.compatibilityOptions.defineConstraintLanguage &&
    ex.exceptionCode === 'MissingParameterValue' &&
    ex.locator.toLowerCase() === 'constraintlanguage'
  ) {
    client.compatibilityOptions.defineConstraintLanguage = true
    return true
  }

  // No more rule
  return false
}

module.exports = { applyCompatibilityOptions, detectNewCompatibilityOption }
