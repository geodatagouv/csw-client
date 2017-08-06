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
    this.activityTimeout = options.activityTimeout || 20000
    debug('new harvester (concurrency=%d, step=%d)', concurrency, step)
  }

  renewActivityTimeout() {
    if (this.finished) return
    this.clearActivityTimeout()
    this._activityTimeout = setTimeout(() => {
      if (this.finished) return
      this.finished = true
      this.emit('error', new Error('Harvesting timeout'))
    }, this.activityTimeout)
  }

  clearActivityTimeout() {
    if (this._activityTimeout) {
      clearTimeout(this._activityTimeout)
    }
  }

  _read() {
    if (this.finished) return
    if (!this.started) return this.init()
    if (this.started) return this.fetchMoreRecords()
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
      this.failed = true
      const newError =  new Error('Error in count operation')
      newError.err = err
      this.emit('error', newError)
      this.emit('failed')
      this.finish()
    }
  }

  async fetchRecords() {
    if (!this.hasMoreRecords()) return

    const query = Object.assign({}, this.options, {
      maxRecords: this.step,
      startPosition: this.offset + 1,
    })

    this.offset = this.offset + this.step

    let successful = false

    this.pendingRequests++
    debug('fetching records from %d', query.startPosition)
    debug('pending request: %d', this.pendingRequests)

    const decreasePendingRequests = once(() => this.pendingRequests--)

    try {
      const result = await this.client.records(query)

      decreasePendingRequests()
      debug('returned %d records', result.records.length)
      if (result.records.length > 0) successful = true
      result.records.forEach(record => {
        this.returned++
        this.emit('record', record)
        this.push(record)
      })
    } catch (err) {
      decreasePendingRequests()
      debug('error while fetching records from %d: %s', query.startPosition, err)
      const newError = new Error('Error in fetch operation')
      newError.err = err
      this.emit('pageError', newError)
    }

    this.renewActivityTimeout()

    if (!successful && this.hasMoreRecords()) {
      debug('try again')
      this.fetchMoreRecords()
    }
    else if (!this.hasMoreRecords() && this.pendingRequests === 0) {
      debug('will finish after that')
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

  finish() {
    if (this.finished) return
    this.clearActivityTimeout()
    debug('finished')
    this.finished = true
    debug('records returned: %d', this.returned)
    this.duration = Date.now() - this.startDate
    debug('duration: %s seconds', (this.duration / 1000).toFixed(1))
    this.push(null)
    this.on('end', () => this.removeAllListeners())
  }

}

module.exports = Harvester
