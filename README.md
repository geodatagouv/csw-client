# csw-client
A very simple CSW client

[![npm version](https://img.shields.io/npm/v/csw-client.svg)](https://www.npmjs.com/package/csw-client)
[![Circle CI](https://circleci.com/gh/sgmap-inspire/csw-client/tree/master.svg?style=shield)](https://circleci.com/gh/sgmap-inspire/csw-client/tree/master)
[![Coverage Status](https://coveralls.io/repos/sgmap-inspire/csw-client/badge.svg?branch=master&service=github)](https://coveralls.io/github/sgmap-inspire/csw-client?branch=master)
[![Dependency Status](https://david-dm.org/sgmap-inspire/csw-client.svg)](https://david-dm.org/sgmap-inspire/csw-client)

## Features

* Support of version 2.0.2
* Support harvesting (w/ Streams API)
* Basic support of `GetCapabilities`, `GetRecords` and `GetRecordById`

## Usage

### Create a client

```js
var csw = require('csw-client');
var client = csw('http://your-csw-server.tld/csw', options);
```

#### Options

| Option name | Type | Description | Default | Example |
| ---------- | ---------- | ----------- | ---------- | ---------- |
| maxSockets | Optional | Determines how many concurrent sockets can be opened for the client | 5 | 10 |
| retry | Optional | If your server is unstable and you want to try again N times | false | 2 |
| userAgent | Optional | User-Agent used in requests | _Empty_ | CSWBot 1.0 |

### Harvest a service

```js
var harvester = client.harvest(options);

harvester.on('data', function(record) {
   console.log(record.name());
});
```

#### Options

| Option name | Type | Description | Default | Example |
| ---------- | ---------- | ----------- | ---------- | ---------- |
| step | Optional | Number of records asked by request | 20 | 10 |
| concurrency | Optional | _For harvesting only:_ Determines how many concurrent `GetRecords` requests can be executed by the Harvester | 3 | 5 |

## TODO

* Read Capabilities
* Tests and more tests
