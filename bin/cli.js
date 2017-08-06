#!/usr/bin/env node
/* eslint no-console: off */
const program = require('commander')
const ProgressBar = require('progress')
const pkg = require('../package.json')
const csw = require('../')

program
  .version(pkg.version)

program
  .command('inspect <location>')
  .description('inspect a CSW endpoint')
  .action(async function (location) {
    const client = csw(location, {})
    const capabilities  = await client.capabilities()
    console.log(capabilities)
  })

program
  .command('harvest <location>')
  .description('harvest a CSW endpoint')
  .option('--inspire', 'Enable INSPIRE mode')
  .option('--display <mode>', 'Display modes: progress, list, none', 'progress')
  .option('--log-all-requests', 'Log all requests')
  .option('-c, --concurrency [num]', 'Set concurrency [2]', 2)
  .action(function (location, options) {
    const client = csw(location, {})
    const harvestOptions = {}
    let bar

    if (options.logAllRequests) {
      client.on('request', req => console.log(req.url.href))
    }
    if (options.inspire) harvestOptions.schema = 'inspire'
    harvestOptions.concurrency = options.concurrency

    const harvester = client.harvest(harvestOptions)

    harvester
      .on('started', () => {
        const count = harvester.matched
        console.log('Found %d records', count)

        if (options.display === 'progress') {
          bar = new ProgressBar('  harvesting [:bar] :rate records/s :percent :etas', {
            width: 40,
            total: count,
            complete: '=',
            incomplete: ' ',
          })
        }
      })
      .on('data', record => {
        if (options.display === 'list') {
          console.log(record.title)
        }
      })
      .on('progress', progression => {
        if (options.display === 'progress') {
          bar.tick(progression)
        }
      })
      .on('error', console.error)
  })

program.parse(process.argv)
