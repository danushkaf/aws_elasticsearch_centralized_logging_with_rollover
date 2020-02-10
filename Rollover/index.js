var querystring = require('querystring');
var http = require('https');

exports.handler = function(event, context) {

    var obj = {
        "conditions": {
            "max_age": "1d"
        }
    };
    var host = "search-xxx.xxx.es.amazonaws.com";
    var indices = [];
    var get_indices_options = {
        host: host,
        port: 443,
        path: '/*',
        method: 'GET'
    };
    var indicesOutput = '';

    var get_indices_request = http.request(get_indices_options, function(res) {
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            indicesOutput += chunk;
        });

        res.on('end', () => {
            console.log('Get Indices Response: ');
            indices = JSON.parse(indicesOutput);
            for (let key in indices) {
                if (indices.hasOwnProperty(key)) {
                    var index = indices[key];
                    var aliasesOutput = '';
                    var rolloverOutput = '';
                    var aliasName = key.substr(0, key.lastIndexOf("-"));
                    if (!Object.keys(index.aliases).length) {
                        var alias = {
                            "actions": [{
                                "add": {
                                    "index": key,
                                    "alias": aliasName,
                                    "is_write_index": true
                                }
                            }]
                        };

                        var post_alias_options = {
                            host: host,
                            port: 443,
                            path: '/_aliases',
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Content-Length': Buffer.byteLength(JSON.stringify(alias))
                            }
                        };
                        var post_alias_req = http.request(post_alias_options, function(res) {
                            res.setEncoding('utf8');
                            res.on('data', (chunk) => {
                                aliasesOutput += chunk;
                            });

                            res.on('end', () => {
                                console.log('Post Alias Response: ' + aliasesOutput);
                                var post_rollover_options = {
                                    host: host,
                                    port: 443,
                                    path: '/' + aliasName + '/_rollover',
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Content-Length': Buffer.byteLength(JSON.stringify(obj))
                                    }
                                };
                                var post_rollover_req = http.request(post_rollover_options, function(res) {
                                    res.setEncoding('utf8');
                                    res.on('data', (chunk) => {
                                        rolloverOutput += chunk;
                                    });

                                    res.on('end', () => {
                                        console.log('Post Rollover Response: ' + rolloverOutput);
                                        context.succeed();
                                    });
                                    res.on('error', function(e) {
                                        console.log("Post Rollover Got error: " + e.message);
                                        context.done(null, 'FAILURE');
                                    });

                                });
                                post_rollover_req.write(JSON.stringify(obj));
                                post_rollover_req.end();
                                context.succeed();
                            });
                            res.on('error', function(e) {
                                console.log("Post Alias Got error: " + e.message);
                                context.done(null, 'FAILURE');
                            });

                        });
                        post_alias_req.write(JSON.stringify(alias));
                        post_alias_req.end();
                    } else {
                        var post_rollover_options = {
                            host: host,
                            port: 443,
                            path: '/' + aliasName + '/_rollover',
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Content-Length': Buffer.byteLength(JSON.stringify(obj))
                            }
                        };
                        var post_rollover_req = http.request(post_rollover_options, function(res) {
                            res.setEncoding('utf8');
                            res.on('data', (chunk) => {
                                rolloverOutput += chunk;
                            });

                            res.on('end', () => {
                                console.log('Post Rollover Response: ' + rolloverOutput);
                                context.succeed();
                            });
                            res.on('error', function(e) {
                                console.log("Post Rollover Got error: " + e.message);
                                context.done(null, 'FAILURE');
                            });

                        });
                        post_rollover_req.write(JSON.stringify(obj));
                        post_rollover_req.end();
                    }
                }
            }
            context.succeed();
        });
        res.on('error', function(e) {
            console.log("Get Indices Got error: " + e.message);
            context.done(null, 'FAILURE');
            return;
        });
    });
    get_indices_request.end();

}
