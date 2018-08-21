'use strict'

const {Readable} = require('stream')
const {times, once, pick} = require('lodash')
const debug = require('debug')('csw-client:harvester')

class Harvester extends Readable {
  constructor(client, options = {}) {
    const concurrency = options.concurrency || 2
    const step = options.step || 20
    super({objectMode: true, highWaterMark: options.highWaterMark || step * concurrency})
    this.client = client
    this.setSchema(options.schema)
    this.schema = options.schema || 'dc'
    this.step = step
    this.concurrency = concurrency
    this.returned = 0
    this.duplicate = 0
    this.missed = 0
    this.recordErrors = 0
    this.progression = 0
    this.typesCount = {}
    this.statusesCount = {}
    this.returnedPages = 0
    this.erroredPages = 0
    this.recordIds = new Set()
    this.activityTimeout = options.activityTimeout || 20000
    this.cache = options.cache
    debug('new harvester (concurrency=%d, step=%d, schema=%s)', concurrency, step, this.schema)
  }

  setSchema(schema = 'dc') {
    if (schema === 'inspire') {
      schema = 'iso'
    }
    if (!['dc', 'iso', 'both'].includes(schema)) {
      throw new Error('Unknown harvesting schema')
    }
    if (schema === 'both') {
      this.currentPassSchema = 'iso'
      this.remainingPassSchema = 'dc'
    } else {
      this.currentPassSchema = schema
    }
    this.schema = schema
  }

  renewActivityTimeout() {
    if (this.finished) {
      return
    }
    this.clearActivityTimeout()
    this._activityTimeout = setTimeout(() => {
      this.finish(new Error('Harvesting timeout'))
    }, this.activityTimeout)
  }

  clearActivityTimeout() {
    if (this._activityTimeout) {
      clearTimeout(this._activityTimeout)
    }
  }

  progress(count) {
    this.progression = this.progression + count
    this.emit('progress', count)
  }

  _read() {
    if (this.finished) {
      return
    }

    if (this.started) {
      this.fetchMoreRecords()
    } else {
      this.init()
    }
  }

  nextPass() {
    if (!this.remainingPassSchema) {
      throw new Error('No remaining pass')
    }
    this.currentPassSchema = this.remainingPassSchema
    delete this.remainingPassSchema
    this.offset = 0
    debug('second pass')
  }

  async init() {
    const startDate = new Date()

    try {
      this.remainingPass = this.schema === 'both' ? 1 : 0
      const schema = this.schema === 'both' ? 'dc' : this.schema
      const count = await this.client.count({schema})
      this.started = startDate
      this.renewActivityTimeout()
      debug('found %d records', count)

      this.matched = count
      this.total = this.schema === 'both' ? count * 2 : count
      this.offset = 0
      this.pendingRequests = 0
      this.emit('started')

      if (count === 0) {
        this.finish()
      } else {
        this.fetchMoreRecords()
      }
    } catch (err) {
      debug('error in count operation: %s', err)
      const newError = new Error('Error in count operation')
      newError.err = err
      this.finish(newError)
    }
  }

  increaseTypeCount(type) {
    if (type in this.typesCount) {
      this.typesCount[type]++
    } else {
      this.typesCount[type] = 1
    }
  }

  increaseStatusCount(status) {
    if (status in this.statusesCount) {
      this.statusesCount[status]++
    } else {
      this.statusesCount[status] = 1
    }
  }

  processRecord(record) {
    if (this.finished) {
      return
    }

    if (!record.id) {
      this.recordErrors++
      this.emit('record:error', record)
    } else if (this.recordIds.has(record.id)) {
      this.duplicate++
      this.emit('record:duplicate', record)
    } else {
      if (!this.cache || !(record.originalId in this.cache)) {
        record.status = 'new'
      } else if (this.cache[record.originalId] === record.hash) {
        record.status = 'hit'
      } else {
        record.status = 'updated'
      }
      this.returned++
      this.recordIds.add(record.originalId)
      this.increaseStatusCount(record.status)
      this.increaseTypeCount(record.type)
      this.emit('record', record)
      this.push(record)
    }
  }

  async fetchRecords() {
    if (!this.hasMoreRecords()) {
      return
    }
    if (this.currentPassComplete()) {
      this.nextPass()
    }

    const expected = Math.min(this.matched - this.offset, this.step)

    const query = {
      schema: this.currentPassSchema,
      maxRecords: this.step,
      startPosition: this.offset + 1
    }

    this.offset = this.offset + this.step

    this.pendingRequests++
    debug('fetching records from %d', query.startPosition)

    const decreasePendingRequests = once(() => this.pendingRequests--)

    try {
      const result = await this.client.records(query)
      decreasePendingRequests()

      this.returnedPages++
      const returned = result.records.length

      debug('returned %d records', returned)
      if (returned < expected) {
        const missed = expected - returned
        this.missed = this.missed + missed
        debug('missed %d records (not returned by service). Expected: %d - Returned: %d', missed, expected, returned)
        this.fetchMoreRecords()
      }
      if (returned > expected) {
        this.finish(new Error('Fatal: more records returned than expected'))
      }
      result.records.forEach(record => this.processRecord(record))
    } catch (err) {
      decreasePendingRequests()
      this.erroredPages++
      debug('error while fetching records from %d: %s', query.startPosition, err)
      debug('missed %d records (request failed)', expected)
      const newError = new Error('Error in fetch operation')
      newError.err = err
      this.emit('pageError', newError)
      this.fetchMoreRecords()
    }

    this.renewActivityTimeout()
    this.progress(expected)

    if (!this.hasMoreRecords() && this.pendingRequests === 0) {
      this.finish()
    }
  }

  fetchMoreRecords() {
    if (!this.hasMoreRecords()) {
      return
    }
    if (this.pendingRequests >= this.concurrency) {
      return
    }
    times(this.concurrency - this.pendingRequests, () => this.fetchRecords())
  }

  currentPassComplete() {
    return this.offset >= this.matched
  }

  hasMoreRecords() {
    if (this._hasMoreRecords === false) {
      return false
    }
    if (this.remainingPassSchema || !this.currentPassComplete()) {
      return true
    }
    this._hasMoreRecords = false
    debug('no more records: finishing %d pending requests', this.pendingRequests)
    return false
  }

  computeFinishedMetrics() {
    this.exhaustive = this.matched === this.recordIds.size
    this.duration = (this.finished - this.started) / 1000
    this.speed = Number((this.returned / this.duration).toFixed(2))
  }

  setFinished(status) {
    if (this.finished) {
      return
    }

    this.finished = new Date()
    this.status = status
    this.computeFinishedMetrics()
    this.emit('finished')
    debug('finished with the following status: %s', status)
  }

  finish(err) {
    if (this.finished) {
      return
    }
    this.clearActivityTimeout()

    if (err) {
      this.setFinished('failed')
      debug('finished with following error: %s', err.message)
      this.destroy(err)
    } else {
      this.setFinished('successful')
      this.push(null)
    }
  }

  toJSON() {
    const obj = pick(
      this,
      'finished',
      'started',
      'duration',
      'speed',
      'status',
      'total',
      'matched',
      'returned',
      'missed',
      'duplicate',
      'exhaustive',
      'recordErrors',
      'typesCount',
      'statusesCount',
      'erroredPages',
      'returnedPages',
    )
    obj.compatOptions = [...this.client.compatOptions]
    obj.originalServiceURL = this.client.originalServiceURL
    obj.redirections = [...this.client.redirections]
    obj.serviceURL = this.client.serviceURL.href
    return obj
  }
}

module.exports = Harvester
