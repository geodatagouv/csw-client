'use strict'

const { URL } = require('url')

exports.createServiceURL = function (serviceUrl) {
  if (!serviceUrl) throw new Error('serviceUrl is required!')
  const url = new URL(serviceUrl)
  url.search = ''
  url.path = ''
  return url
}
