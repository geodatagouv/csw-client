'use strict'

const Readable = require('stream').Readable
const { clone, times, once, pick } = require('lodash')
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
    this.returnedPages = 0
    this.erroredPages = 0
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
    const startDate = new Date()

    try {
      const count = await this.client.count(clone(this.options))
      this.started = startDate
      this.renewActivityTimeout()
      debug('found %d records', count)

      this.matched = count
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

    const expected = Math.min(this.matched - this.offset, this.step)

    const query = Object.assign({}, this.options, {
      maxRecords: this.step,
      startPosition: this.offset + 1,
    })

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
        debug('missed %d records (not returned by service). Expected: %d - Returned: %d', expected - returned, expected, returned)
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

  computeFinishedMetrics() {
    this.exhaustive = this.matched === this.recordIds.size
    this.duration = (this.finished - this.started) / 1000
    this.speed = Number((this.returned / this.duration).toFixed(2))
  }

  setFinished(status) {
    if (this.finished) return

    this.finished = new Date()
    this.status = status
    this.computeFinishedMetrics()
    this.emit('finished')
    debug('finished with the following status: %s', status)
  }

  finish(err) {
    if (this.finished) return
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
    return pick(
      this,
      'finished',
      'started',
      'duration',
      'speed',
      'status',
      'matched',
      'returned',
      'duplicate',
      'exhaustive',
      'recordErrors',
      'typesCount',
      'erroredPages',
      'returnedPages',
    )
  }

}

module.exports = Harvester
