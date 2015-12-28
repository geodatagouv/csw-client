const Parser = require('inspire-parser').Parser;

module.exports = function parseCswResponse(res, fn) {
    const parser = new Parser();
    res.setEncoding('utf8');
    res.pipe(parser).on('result', function (result) {
        fn(null, result);
    });
};
