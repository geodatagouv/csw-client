# csw-client [![Build Status](https://secure.travis-ci.org/jdesboeufs/csw-client.svg)](http://travis-ci.org/jdesboeufs/csw-client)

A very simple CSW client

## Features

* Support of version 2.0.2
* Support harvesting (w/ Streams API)
* Embed [ISO-19139 mapping](https://github.com/jdesboeufs/node-iso19139) with harvester
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

#### Harvest a service

```js
var harvester = client.harvest({ mapper: 'iso19139' });

harvester.on('error', function(err) {
    console.trace(err);
});

harvester.on('start', function(stats) {
    console.log('Stats: ', stats);
});

harvester.on('page', function(infos) {
    console.log('Page: ', infos);
});

harvester.on('end', function(err, stats) {
    if (err) {
        console.trace(err);
    }
    if (stats) {
        console.log(stats);
    }
});

harvester.on('record', function(data, stats) {

    // Expose record object after mapping
    console.log(data.record);

    // Expose raw record (lixmljs element)
    console.log(data.xml);

});
```

## TODO

* Improve [ISO-19139 mapping](https://github.com/jdesboeufs/node-iso19139)
* Improve API
* Add Dublin Core mapping
* Read Capabilities
* Tests and more tests

## About

### License

MIT

### Author

Jérôme Desboeufs ([@jdesboeufs](https://twitter.com/jdesboeufs))
