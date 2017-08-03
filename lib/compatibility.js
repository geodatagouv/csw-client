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

  // No more rule
  return false
}

module.exports = { applyCompatibilityOptions, detectNewCompatibilityOption }
