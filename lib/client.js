'use strict'

const request = require('request')
const { Parser } = require('inspire-parser')
const { pick, defaults } = require('lodash')
const { pipe, pipeline, through } = require('mississippi')
const Harvester = require('./harvester')
const { expandRecord } = require('./records')
const { detectNewCompatibilityOption, applyCompatibilityOptions } = require('./compatibility')
const stringstream = require('stringstream')
const EventEmitter = require('events').EventEmitter
const { createGunzip } = require('zlib')
const { version } = require('../package.json')
const debugRequest = require('debug')('csw-client:request')
const debugInfo = require('debug')('csw-client:info')

class ExceptionReport extends Error {}


function parseResponse(reqResponse) {
  return new Promise((resolve, reject) => {
    const { headers } = reqResponse
    const gzip = headers['content-encoding'] && headers['content-encoding'].includes('gzip')
    const decompressedResponse = gzip ?
      pipeline(reqResponse, createGunzip()) :
      reqResponse

    // Read timeout
    const readTimeout = 20000
    let _readTimeout

    function clearReadTimeout() {
      if (_readTimeout) clearTimeout(_readTimeout)
    }

    function renewReadTimeout() {
      clearReadTimeout()
      _readTimeout = setTimeout(function () {
        reject(new Error('Response read timeout'))
      }, readTimeout)
    }

    const readTimeoutStream = through(
      function (chunk, enc, cb) {
        renewReadTimeout()
        cb(null, chunk)
      },
      function (cb) {
        clearReadTimeout()
        cb()
      }
    )

    // XML Parser
    const xmlParser = new Parser()

    xmlParser.on('result', result => {
      if (result.type === 'ExceptionReport') {
        const exception = result.body.exceptionReport
        const err = new ExceptionReport(exception.exceptionCode)
        err.exception = exception
        reject(err)
      } else {
        resolve(result)
      }
    })

    pipe(
      decompressedResponse,
      readTimeoutStream,
      stringstream('utf8'),
      xmlParser,
      function (err) {
        if (err) return reject(err)
        reject(new Error('No parsed content'))
      }
    )
  })
}

class Client extends EventEmitter {

  constructor(serviceUrl, options = {}) {
    if (!serviceUrl) throw new Error('serviceUrl is required!')
    super()
    this.serviceUrl = serviceUrl
    this.userAgent = options.userAgent || `csw-client/${version}`
    this.compatibilityOptions = options.compatibilityOptions || {}
    this.timeout = options.timeout || 10000
    this.gzip = options.gzip !== false

    this.hopCount = 0

    debugInfo('created client for service %s', this.serviceUrl)
  }

  request(query) {
    if (this.hopCount >= 5) {
      debugInfo('followed too many redirections')
      return Promise.reject('Followed too many redirections')
    }

    return new Promise((resolve, reject) => {
      const req = request({
        url: this.serviceUrl,
        qs: Object.assign({}, query, { service: 'CSW', version: '2.0.2' }),
        qsStringifyOptions: { encode: !this.compatibilityOptions.noEncodeQs },
        headers: {
          'User-Agent': this.userAgent,
        },
        agentOptions: this.agentOptions,
        timeout: this.timeout,
        gzip: this.gzip,
        followRedirect: false,
      })

      req
        .on('error', reject)
        .on('response', response => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            response.destroy()
            const redirectUrl = response.headers.location
            const startQsPos = redirectUrl.indexOf('?')
            this.serviceUrl = redirectUrl.substr(0, startQsPos)
            this.hopCount++
            debugInfo('following service redirection => %s - hop: %d', this.serviceUrl, this.hopCount)
            resolve(this.request(query))
          }
          if (response.statusCode >= 400) {
            response.destroy()
            reject(new Error('Responded with an error status code: ' + response.statusCode))
          }
          if (! response.headers['content-type'] || response.headers['content-type'].indexOf('xml') === -1) {
            response.destroy()
            reject(new Error('Not an XML response'))
          }

          response.pause()
          resolve(response)
        })

      debugRequest('request: %s', decodeURIComponent(req.url.href))
      this.emit('request', req)
    })
  }

  getCapabilities() {
    return this.request({ request: 'GetCapabilities' })
  }

  async capabilities() {
    const response = await this.getCapabilities()
    const result = await parseResponse(response)
    if (result.type !== 'Capabilities') {
      throw new Error('Not acceptable response type: ' + result.type)
    }
    return result.body
  }

  getRecords(options = {}) {
    if (options.schema === 'inspire') {
      options.typeNames = 'gmd:MD_Metadata'
      options.outputSchema = 'http://www.isotc211.org/2005/gmd'
    }
    const params =  pick(options,
      'maxRecords',
      'startPosition',
      'typeNames',
      'outputSchema',
      'elementSetName',
      'resultType',
      'namespace',
      'constraintLanguage')
    defaults(params, {
      resultType: 'results',
      elementSetName: 'full',
      typeNames: 'csw:Record',
      maxRecords: 10,
    })
    params.request = 'GetRecords'
    return this.request(params)
  }

  async records(options = {}) {
    const computedOptions = this.computeOptions(options)

    const fetchRecords = async (fetchOptions) => {
      const response = await this.getRecords(fetchOptions)
      const result = await parseResponse(response)
      if (result.type !== 'GetRecordsResponse') {
        throw new Error('Not acceptable response type: ' + result.type)
      }
      return {
        records: (result.body.searchResults.children || []).map(expandRecord),
        matched: parseInt(result.body.searchResults.numberOfRecordsMatched),
        returned: parseInt(result.body.searchResults.numberOfRecordsReturned),
      }
    }

    try {
      if (computedOptions.progressiveElementSetName) {
        computedOptions.elementSetName = 'brief'
        const { records, matched, returned } = await fetchRecords(computedOptions)
        const recordOptions = Object.assign({}, computedOptions, { elementSetName: 'full' })
        return {
          records: await Promise.all(records.map(record => this.record(record.id, recordOptions))),
          matched,
          returned,
        }
      } else {
        return await fetchRecords(computedOptions)
      }
    } catch (err) {
      if (err instanceof ExceptionReport) {
        const shouldRetry = detectNewCompatibilityOption(this, err.exception)
        if (shouldRetry) return this.records(options)
      }
      throw err
    }
  }

  computeOptions(options = {}) {
    return applyCompatibilityOptions(Object.assign({}, this.compatibilityOptions, options))
  }

  async count(options = {}) {
    const result = await this.records(Object.assign({}, options, { resultType: 'hits' }))
    if (result.matched >= 0) return result.matched
    throw new Error('Invalid count result')
  }

  getRecordById(id, options = {}) {
    if (options.schema === 'inspire') {
      options.typeNames = 'gmd:MD_Metadata'
      options.outputSchema = 'http://www.isotc211.org/2005/gmd'
    }
    const params =  pick(options,
      'typeNames',
      'outputSchema',
      'elementSetName',
      'namespace')
    defaults(params, {
      elementSetName: 'full',
      typeNames: 'csw:Record',
    })
    params.request = 'GetRecordById'
    params.id = id
    return this.request(params)
  }

  async record(id, options = {}) {
    const response = await this.getRecordById(id, options)
    const result = await parseResponse(response)
    if (result.type !== 'GetRecordByIdResponse') {
      throw new Error('Not acceptable response type: ' + result.type)
    }
    if (!result.body.children) {
      throw new Error('No record returned for id: ' + id)
    }
    return expandRecord(result.body.children[0])
  }

  /* Legacy */

  harvest(options) {
    return new Harvester(this, options)
  }

}

module.exports = Client
