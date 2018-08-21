#!/usr/bin/env node
/* eslint no-console: off */
const program = require('commander')
const ProgressBar = require('progress')
const chalk = require('chalk')
const pkg = require('../package.json')
const csw = require('..')

const STATUS_DISPLAY = {
  new: chalk.green('new'),
  updated: chalk.yellow('updated'),
  hit: chalk.gray('hit'),
  removed: chalk.red('removed')
}

program
  .version(pkg.version)

program
  .command('inspect <location>')
  .description('inspect a CSW endpoint')
  .action(async location => {
    const client = csw(location, {})
    const capabilities = await client.capabilities()
    console.log(capabilities)
  })

program
  .command('harvest <location>')
  .description('harvest a CSW endpoint')
  .option('--schema <schema>', 'Schema in which records must be returned: dc, iso, both', 'dc')
  .option('--display <mode>', 'Display modes: progress, list, none', 'progress')
  .option('--log-all-requests', 'Log all requests')
  .option('--concurrency [num]', 'Set concurrency [2]', parseInt, 2)
  .option('--timeout [duration]', 'Harvester activity timeout, in ms [20000]', parseInt, 20000)
  .option('--step [num]', 'Number of records fetched by request [20]', parseInt, 20)
  .action((location, options) => {
    const client = csw(location, {})
    const harvestOptions = {}
    let bar

    if (options.logAllRequests) {
      client.on('request', req => console.log(req.url.href))
    }
    harvestOptions.schema = options.schema
    harvestOptions.concurrency = options.concurrency
    harvestOptions.step = options.step
    harvestOptions.activityTimeout = options.timeout

    const harvester = client.harvest(harvestOptions)

    harvester
      .on('started', () => {
        const count = harvester.total
        if (options.display === 'progress') {
          bar = new ProgressBar('  harvesting [:bar] :current/:total (:percent) - :rate records/s - ETA: :etas', {
            width: 40,
            total: count,
            complete: '=',
            incomplete: ' ',
            clear: true
          })
        }
      })
      .on('finished', () => {
        console.log(JSON.stringify(harvester, true, 2))
      })
      .on('data', record => {
        if (options.display === 'list') {
          if (record.status === 'removed') {
            console.log(`${chalk.yellow('xxxxxxx')} (${STATUS_DISPLAY[record.status]}) ${chalk.gray(record.originalId)}`)
          } else {
            console.log(`${chalk.yellow(record.hash.substr(0, 7))} (${STATUS_DISPLAY[record.status]}) ${record.title}`)
          }
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
