'use strict'

const Readable = require('stream').Readable
const { clone, times, once } = require('lodash')
const debug = require('debug')('csw-client:harvester')

class Harvester extends Readable {

  constructor(client, options = {}) {
    const concurrency = options.concurrency || 2
    const step = options.step || 20
    super({ objectMode: true, highWaterMark: options.highWaterMark || step * concurrency })
    this.client = client
    this.options = options
    this.step = step
    this.concurrency = concurrency
    this.returned = 0
    this.duplicate = 0
    this.recordErrors = 0
    this.progression = 0
    this.typesCount = {}
    this.recordIds = new Set()
    this.activityTimeout = options.activityTimeout || 20000
    debug('new harvester (concurrency=%d, step=%d)', concurrency, step)
  }

  renewActivityTimeout() {
    if (this.finished) return
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
    if (this.finished) return

    if (!this.started) {
      this.init()
    } else {
      this.fetchMoreRecords()
    }
  }

  async init() {
    this.startDate = Date.now()

    try {
      const count = await this.client.count(clone(this.options))
      this.renewActivityTimeout()
      debug('found %d records', count)

      this.matched = count
      this.offset = 0
      this.pendingRequests = 0
      this.started = true
      this.emit('started')

      debug('ready to harvest')

      if (count === 0) {
        this.finish()
      } else {
        this.fetchMoreRecords()
      }
    } catch (err) {
      debug('error in count operation: %s', err)
      const newError =  new Error('Error in count operation')
      newError.err = err
      this.finish(newError)
    }
  }

  increaseTypeCount(type) {
    if (!(type in this.typesCount)) {
      this.typesCount[type] = 1
    } else {
      this.typesCount[type]++
    }
  }

  processRecord(record) {
    if (this.finished) return

    if (!record.id) {
      this.recordErrors++
      this.emit('record:error', record)
    } else if (this.recordIds.has(record.id)) {
      this.duplicate++
      this.emit('record:duplicate', record)
    } else {
      this.returned++
      this.recordIds.add(record.id)
      this.increaseTypeCount(record.type)
      this.emit('record', record)
      this.push(record)
    }
  }

  async fetchRecords() {
    if (!this.hasMoreRecords()) return

    const expected = Math.min(this.matched - this.offset + 1, this.step)

    const query = Object.assign({}, this.options, {
      maxRecords: this.step,
      startPosition: this.offset + 1,
    })

    this.offset = this.offset + this.step

    this.pendingRequests++
    debug('fetching records from %d', query.startPosition)
    debug('pending request: %d', this.pendingRequests)

    const decreasePendingRequests = once(() => this.pendingRequests--)

    try {
      const result = await this.client.records(query)
      decreasePendingRequests()

      const returned = result.records.length

      debug('returned %d records', returned)
      if (returned < expected) {
        debug('missed %d records (not returned by service)', expected - returned)
        this.fetchMoreRecords()
      }
      if (returned > expected) {
        this.finish(new Error('Fatal: more records returned than expected'))
      }
      result.records.forEach(record => this.processRecord(record))
    } catch (err) {
      decreasePendingRequests()
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
    if (!this.hasMoreRecords()) return
    if (this.pendingRequests >= this.concurrency) return
    times(this.concurrency - this.pendingRequests, () => this.fetchRecords())
  }

  hasMoreRecords() {
    if (this._hasMoreRecords === false) return false
    if (this.offset < this.matched) return true
    this._hasMoreRecords = false
    debug('no more records: finishing %d pending requests', this.pendingRequests)
    return false
  }

  finish(err) {
    if (this.finished) return
    this.clearActivityTimeout()
    this.finished = true

    if (err) {
      debug('finished with following error: %s', err.message)
      this.failed = true
      this.emit('error', err)
      this.emit('failed')
    } else {
      debug('finished')
      debug('records returned: %d', this.returned)
      this.duration = Date.now() - this.startDate
      debug('duration: %s seconds', (this.duration / 1000).toFixed(1))
      this.push(null)
    }
  }

}

module.exports = Harvester
