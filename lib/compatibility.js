'use strict'

function extendHarvestOptions(originalOptions) {
  const options = Object.assign({}, originalOptions)

  if (originalOptions.defineConstraintLanguage) {
    options.constraintLanguage = 'CQL_TEXT'
  }

  if (originalOptions.defineNamespace) {
    options.namespace = 'xmlns(gmd=http://www.isotc211.org/2005/gmd)'
  }

  return options
}

module.exports = { extendHarvestOptions }
