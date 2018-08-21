'use strict'

const {EventEmitter} = require('events')
const {createGunzip} = require('zlib')

const request = require('request')
const {Parser} = require('inspire-parser')
const {pipe, pipeline, through} = require('mississippi')
const stringstream = require('stringstream')
const debugRequest = require('debug')('csw-client:request')
const debugInfo = require('debug')('csw-client:info')

const {version} = require('../package.json')

const {createServiceURL} = require('./url')
const Harvester = require('./harvester')
const {expandRecord} = require('./records')
const {detectCompatOptions, applyCompat, validCompatOptions} = require('./compatibility')

class ExceptionReport extends Error {}

function parseResponse(reqResponse) {
  return new Promise((resolve, reject) => {
    const {headers} = reqResponse
    const gzip = headers['content-encoding'] && headers['content-encoding'].includes('gzip')
    const decompressedResponse = gzip ?
      pipeline(reqResponse, createGunzip()) :
      reqResponse

    // Read timeout
    const readTimeout = 10000
    let _readTimeout

    function clearReadTimeout() {
      if (_readTimeout) {
        clearTimeout(_readTimeout)
      }
    }

    function renewReadTimeout() {
      clearReadTimeout()
      _readTimeout = setTimeout(() => {
        reject(new Error('Response read timeout'))
      }, readTimeout)
    }

    const readTimeoutStream = through(
      (chunk, enc, cb) => {
        renewReadTimeout()
        cb(null, chunk)
      },
      cb => {
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
      err => {
        if (err) {
          return reject(err)
        }
        reject(new Error('No parsed content'))
      }
    )
  })
}

class Client extends EventEmitter {
  constructor(serviceURL, options = {}) {
    super()
    this.serviceURL = createServiceURL(serviceURL)
    this.originalServiceURL = this.serviceURL.href
    this.userAgent = options.userAgent || `csw-client/${version}`
    this.compatOptions = []
    if (options.compatOptions) {
      options.compatOptions.forEach(optionName => this.addCompatOption(optionName))
    }
    this.timeout = options.timeout || 10000
    this.gzip = options.gzip !== false

    this.hopCount = 0
    this.redirections = []
    this.nextRequestNum = 1

    debugInfo('created client for service %s', this.serviceURL.href)
  }

  addCompatOption(optionName) {
    if (this.hasCompatOption(optionName)) {
      return
    }
    if (!validCompatOptions.includes(optionName)) {
      throw new Error('Unknown compatibility option')
    }
    this.compatOptions.push(optionName)
  }

  hasCompatOption(optionName) {
    return this.compatOptions.includes(optionName)
  }

  handleRedirection(redirectURL, code) {
    if (redirectURL.startsWith('http')) {
      this.serviceURL = createServiceURL(redirectURL)
    } else if (redirectURL.startsWith('/')) {
      const startQsPos = redirectURL.indexOf('?')
      this.serviceURL.pathname = startQsPos > 0 ?
        redirectURL.substr(0, startQsPos) :
        redirectURL
    } else {
      throw new Error('Invalid redirection')
    }
    this.hopCount++
    this.redirections.push(this.serviceURL.href)

    debugInfo('following service redirection (%d) => %s - hop: %d', code, this.serviceURL.href, this.hopCount)
  }

  request(query) {
    if (this.hopCount >= 5) {
      debugInfo('followed too many redirections')
      return Promise.reject(new Error('Followed too many redirections'))
    }

    return new Promise((resolve, reject) => {
      const requestNum = this.nextRequestNum++
      const req = request({
        url: this.serviceURL.href,
        qs: {...query, service: 'CSW', version: '2.0.2'},
        qsStringifyOptions: {encode: !this.hasCompatOption('no-encode-qs')},
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: this.timeout,
        gzip: this.gzip,
        followRedirect: false
      })

      req.requestNum = requestNum

      req
        .on('error', err => {
          debugRequest('#%d failed: %s', requestNum, err.message)
          reject(err)
        })
        .on('response', response => {
          response.requestNum = requestNum
          debugRequest('#%d response: %d', requestNum, response.statusCode)

          response.on('end', () => {
            debugRequest('#%d completed', requestNum)
          })

          if (response.statusCode === 301 || response.statusCode === 302) {
            response.destroy()
            try {
              this.handleRedirection(response.headers.location, response.statusCode)
              resolve(this.request(query))
            } catch (err) {
              reject(err)
            }
          } else if (response.statusCode >= 400) {
            response.destroy()
            reject(new Error('Responded with an error status code: ' + response.statusCode))
          } else if (!response.headers['content-type'] || response.headers['content-type'].indexOf('xml') === -1) {
            response.destroy()
            reject(new Error('Not an XML response'))
          }

          response.pause()
          resolve(response)
        })

      debugRequest('#%d request: %s', requestNum, decodeURIComponent(req.url.href))
      this.emit('request', req)
    })
  }

  getCapabilities() {
    return this.request({request: 'GetCapabilities'})
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
    const params = {
      schema: options.schema,
      maxRecords: options.maxRecords || 20,
      elementSetName: options.elementSetName || 'full',
      resultType: options.resultType || 'results',
      request: 'GetRecords'
    }
    if (options.startPosition) {
      params.startPosition = options.startPosition
    }
    return this.request(this.computeOptions(params))
  }

  async records(options = {}) {
    const fetchRecords = async fetchOptions => {
      const response = await this.getRecords(fetchOptions)
      const result = await parseResponse(response)
      if (result.type !== 'GetRecordsResponse') {
        throw new Error('Not acceptable response type: ' + result.type)
      }
      return {
        records: (result.body.searchResults.children || []).map(expandRecord),
        matched: Number.parseInt(result.body.searchResults.numberOfRecordsMatched, 10),
        returned: Number.parseInt(result.body.searchResults.numberOfRecordsReturned, 10)
      }
    }

    try {
      if (this.hasCompatOption('progressive-element-set-name')) {
        options.elementSetName = 'brief'
        const {records, matched, returned} = await fetchRecords(options)
        const recordOptions = {...options, elementSetName: 'full'}
        return {
          records: await Promise.all(records.map(record => this.record(record.id, recordOptions))),
          matched,
          returned
        }
      }
      return await fetchRecords(options)
    } catch (err) {
      if (err instanceof ExceptionReport) {
        const shouldRetry = detectCompatOptions(this, err.exception)
        if (shouldRetry) {
          return this.records(options)
        }
      }
      throw err
    }
  }

  computeOptions(options = {}) {
    if (['iso', 'inspire'].includes(options.schema)) {
      options.typeNames = 'gmd:MD_Metadata'
      options.outputSchema = 'http://www.isotc211.org/2005/gmd'
    } else {
      options.typeNames = 'csw:Record'
      options.outputSchema = 'http://www.opengis.net/cat/csw/2.0.2'
    }
    delete options.schema
    applyCompat(this, options)
    return options
  }

  async count(options = {}) {
    const result = await this.records({...options, resultType: 'hits'})
    if (result.matched >= 0) {
      return result.matched
    }
    throw new Error('Invalid count result')
  }

  getRecordById(id, options = {}) {
    return this.request(this.computeOptions({
      schema: options.schema,
      elementSetName: options.elementSetName || 'full',
      request: 'GetRecordById',
      id
    }))
  }

  async record(id, options = {}) {
    const response = await this.getRecordById(id, options)
    const result = await parseResponse(response)
    if (result.type !== 'GetRecordByIdResponse') {
      throw new Error('Not acceptable response type: ' + result.type)
    }
    if (!result.body.children) {
      return null
    }
    if (result.body.children.length > 1) {
      throw new Error('Server has returned more than one response')
    }
    return expandRecord(result.body.children[0])
  }

  harvest(options) {
    return new Harvester(this, options)
  }
}

module.exports = Client
