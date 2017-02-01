# csw-client
A very simple CSW client

[![npm version](https://img.shields.io/npm/v/csw-client.svg)](https://www.npmjs.com/package/csw-client)
[![Circle CI](https://circleci.com/gh/sgmap-inspire/csw-client/tree/master.svg?style=shield)](https://circleci.com/gh/sgmap-inspire/csw-client/tree/master)
[![Coverage Status](https://coveralls.io/repos/sgmap-inspire/csw-client/badge.svg?branch=master&service=github)](https://coveralls.io/github/sgmap-inspire/csw-client?branch=master)
[![Dependency Status](https://david-dm.org/sgmap-inspire/csw-client.svg)](https://david-dm.org/sgmap-inspire/csw-client)

## Prerequisite

* [Node.js](https://nodejs.org) >= 6.0
* OR [Babel](https://babeljs.io/) for older Node.js versions + browser

## Features

* Fetch capabilities
* Fetch records
* Harvest (w/ Stream API)
* Support ISO 19139 (including Inspire profile)
* Support Dublin Core

## Installation

```js
npm install csw-client
```

## Usage

### Create a client

```js
const csw = require('csw-client');
const client = csw('http://your-csw-server.tld/csw', options);
```

#### Options

| Name | Description | Type | Default value |
| ---- | ----------- | ---- | ------------- |
| `userAgent`    | User-Agent string you want to use in requests   | `string` | `"CSWBot"` |
| `gzip`         | enable compression | `boolean` | `true` |
| `timeout`      | requests will fail after X seconds | `integer` | _disabled_ |
| `agentOptions` | options to pass to [http.Agent](https://nodejs.org/api/http.html#http_new_agent_options) (or https) constructor | `object` | _none_ |
| `appendQs`     | query string to append to each request (key/value object) | `object` | _none_ |
| `encodeQs`     | encode query string | `boolean` | `true` |

### Harvest

#### Stream API

```js
client.harvest(options).pipe(outputStream);
```

#### Alternative

```js
client.harvest(options)
    .on('record', record => console.log(record.type))
    .on('error', err => console.error(err))
    .on('end', () => console.log('Finished!'))
    .resume();
```

#### Options

| Name | Description | Type | Default value |
| ---- | ----------- | ---- | ------------- |
| `step`      | number of records asked by `GetRecords` request | `integer` | `20` |
| `concurrency` | number of concurrent `GetRecords` requests | `integer` | `5` |
| `omitElementSetName` | omit this parameter in requests | `boolean` | `false` |

#### Events

| Name | Description | Properties |
| ---- | ----------- | ---------- |
| `record` | a new record is found | `type`: record type<br>`body`: [parsed value](https://github.com/sgmap-inspire/parsers) |
| `started` | harvesting has started | _none_ |
| `failed` | harvesting has failed | _none_ |
| `end` | harvesting has ended | _none_ |
