'use strict'

const request = require('request')
const { Parser } = require('inspire-parser')
const { pick, defaults } = require('lodash')
const Harvester = require('./harvester')
const { detectNewCompatibilityOption, applyCompatibilityOptions } = require('./compatibility')
const stringstream = require('stringstream')
const EventEmitter = require('events').EventEmitter
const { createGunzip } = require('zlib')
const { version } = require('../package.json')
const debug = require('debug')('csw-client:request')

class ExceptionReport extends Error {}


function parseResponse(reqResponse) {
  return new Promise((resolve, reject) => {
    const { headers } = reqResponse
    const gzip = headers['content-encoding'] && headers['content-encoding'].includes('gzip')
    const decompressedResponse = gzip ?
      reqResponse.pipe(createGunzip()).on('error', reject) :
      reqResponse

    decompressedResponse
      .on('error', reject)
      .pipe(stringstream('utf8'))
      .pipe(new Parser())
      .on('error', reject)
      .on('end', () => reject(new Error('No parsed content')))
      .on('result', result => {
        if (result.type === 'ExceptionReport') {
          const exception = result.body.exceptionReport
          const err = new ExceptionReport(exception.exceptionCode)
          err.exception = exception
          reject(err)
        } else {
          resolve(result)
        }
      })
  })
}

class Client extends EventEmitter {

  constructor(url, options = {}) {
    if (!url) throw new Error('URL is required!')
    super()

    this.compatibilityOptions = options.compatibilityOptions || {}

    this.baseRequest = request.defaults({
      url,
      qs: Object.assign({ service: 'CSW', version: '2.0.2' }, options.appendQs || {}),
      qsStringifyOptions: { encode: options.encodeQs !== false },
      headers: {
        'User-Agent': options.userAgent || `csw-client/${version}`,
      },
      agentOptions: options.agentOptions,
      timeout: options.timeout * 1000,
      gzip: options.gzip !== false,
    })
  }

  request(query) {
    return new Promise((resolve, reject) => {
      const req = this.baseRequest({ qs: query })
      debug('request: %s', req.url.href)
      this.emit('request', req)

      req.once('response', response => {
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

      req.on('error', reject)
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
    const response = await this.getRecords(computedOptions)
    const result = await parseResponse(response)
    if (result.type !== 'GetRecordsResponse') {
      throw new Error('Not acceptable response type: ' + result.type)
    }
    return {
      records: result.body.searchResults.children || [],
      matched: parseInt(result.body.searchResults.numberOfRecordsMatched),
      returned: parseInt(result.body.searchResults.numberOfRecordsReturned),
    }
  }

  computeOptions(options = {}) {
    return applyCompatibilityOptions(Object.assign({}, this.compatibilityOptions, options))
  }

  async count(options = {}) {
    let result
    try {
      result = await this.records(Object.assign({}, options, { resultType: 'hits' }))
    } catch (err) {
      if (err instanceof ExceptionReport) {
        const shouldRetry = detectNewCompatibilityOption(this, err.exception)
        if (shouldRetry) return this.count(options)
      }
      throw err
    }
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
    if (result.body.children.length === 0) {
      throw new Error('No record returned')
    }
    return result.body.children[0]
  }

  /* Legacy */

  harvest(options) {
    return new Harvester(this, options)
  }

}

module.exports = Client
