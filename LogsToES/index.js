// v1.1.2
var https = require('https');
var zlib = require('zlib');
var crypto = require('crypto');

var endpoint = 'search-xxx.xxx.es.amazonaws.com';

// Set this to true if you want to debug why data isn't making it to 
// your Elasticsearch cluster. This will enable logging of failed items
// to CloudWatch Logs.
var logFailedResponses = false;

exports.handler = function(input, context) {
    // decode input from base64
    var zippedInput = new Buffer.from(input.awslogs.data, 'base64');

    // decompress the input
    zlib.gunzip(zippedInput, async (error, buffer) => {
        if (error) {
            context.fail(error);
            return;
        }

        // parse the input from JSON
        var awslogsData = JSON.parse(buffer.toString('utf8'));

        // transform the input to Elasticsearch documents
        var elasticsearchBulkData = await transform(awslogsData, context);

        // skip control messages
        if (!elasticsearchBulkData) {
            console.log('Received a control message');
            context.succeed('Control message handled successfully');
            return;
        }

        // post documents to the Amazon Elasticsearch Service
        post(elasticsearchBulkData, function(error, success, statusCode, failedItems) {
            console.log('Response: ' + JSON.stringify({
                "statusCode": statusCode
            }));

            if (error) {
                logFailure(error, failedItems);
                context.fail(JSON.stringify(error));
            } else {
                console.log('Success: ' + JSON.stringify(success));
                context.succeed('Success');
            }
        });
    });
};

async function transform(payload, context) {
    if (payload.messageType === 'CONTROL_MESSAGE') {
        return null;
    }

    var bulkRequestBody = '';

    for (let i in payload.logEvents) {
        var logEvent = payload.logEvents[i];
        var timestamp = new Date(1 * logEvent.timestamp);

        var jsonMessage = JSON.parse(logEvent.message);
        var namespace = jsonMessage['kubernetes']['namespace_name'];
        var serviceName = jsonMessage['kubernetes']['labels']['app'];

        var aliasName = 'staging_' + namespace + '_' + serviceName + '_logs_write';

        var latestIndexName = await getIndexName(aliasName, context);

        if (latestIndexName === "") {
            var indexName = [aliasName + '-00001'].join('.');
        } else {
            var indexName = [latestIndexName].join('.');
        }

        console.log("Index name is : " + indexName);

        var source = buildSource(logEvent.message, logEvent.extractedFields);
        source['@id'] = logEvent.id;
        source['@timestamp'] = new Date(1 * logEvent.timestamp).toISOString();
        source['@message'] = logEvent.message;
        source['@owner'] = payload.owner;
        source['@log_group'] = payload.logGroup;
        source['@log_stream'] = payload.logStream;

        var action = {
            "index": {}
        };
        action.index._index = indexName;
        action.index._type = payload.logGroup;
        action.index._id = logEvent.id;

        bulkRequestBody += [
            JSON.stringify(action),
            JSON.stringify(source),
        ].join('\n') + '\n';
    };
    return bulkRequestBody;
}

// function returns a Promise
function getPromise(alias, context) {
    return new Promise((resolve, reject) => {
        var aliases = {};
        var get_alias_options = {
            host: endpoint,
            port: 443,
            path: '/_alias/' + alias,
            method: 'GET'
        };

        var aliasesOutput = '';
        var finished = false;
        var latestIndex = '';

        var get_alias_request = https.request(get_alias_options, function(res) {
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                aliasesOutput += chunk;
            });
            res.on('end', () => {
                console.log('Get Aliases Response: ');
                aliases = JSON.parse(aliasesOutput);
                for (let key in aliases) {
                    if (aliases.hasOwnProperty(key)) {
                        var index = aliases[key];
                        if (index && index.aliases) {
                            if (Object.keys(index.aliases).length) {
                                for (let aliasName in index.aliases) {
                                    if (index.aliases.hasOwnProperty(aliasName)) {
                                        var aliasObj = index.aliases[aliasName];
                                        if (aliasObj) {
                                            if (aliasName === alias && true === aliasObj['is_write_index']) {
                                                latestIndex = key;
                                                resolve(latestIndex.toString());
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                resolve("");
                context.succeed();
                finished = true;
            });
            res.on('error', function(e) {
                console.log("Get Indices Got error: " + e.message);
                context.done(null, 'FAILURE');
                reject(e);
            });
        });
        get_alias_request.end();
    });
}

async function getIndexName(alias, context) {
    try {
        let http_promise = getPromise(alias, context);
        let latestIndexName = await http_promise;
        return latestIndexName;
    } catch (error) {
        console.log(error);
        return "";
    }
}

function buildSource(message, extractedFields) {
    if (extractedFields) {
        var source = {};

        for (var key in extractedFields) {
            if (extractedFields.hasOwnProperty(key) && extractedFields[key]) {
                var value = extractedFields[key];

                if (isNumeric(value)) {
                    source[key] = 1 * value;
                    continue;
                }

                jsonSubString = extractJson(value);
                if (jsonSubString !== null) {
                    source['$' + key] = JSON.parse(jsonSubString);
                }

                source[key] = value;
            }
        }
        return source;
    }

    jsonSubString = extractJson(message);
    if (jsonSubString !== null) {
        return JSON.parse(jsonSubString);
    }

    return {};
}

function extractJson(message) {
    var jsonStart = message.indexOf('{');
    if (jsonStart < 0) return null;
    var jsonSubString = message.substring(jsonStart);
    return isValidJson(jsonSubString) ? jsonSubString : null;
}

function isValidJson(message) {
    try {
        JSON.parse(message);
    } catch (e) {
        return false;
    }
    return true;
}

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function post(body, callback) {
    var requestParams = buildRequest(endpoint, body);

    var request = https.request(requestParams, function(response) {
        var responseBody = '';
        response.on('data', function(chunk) {
            responseBody += chunk;
        });

        response.on('end', function() {
            var info = JSON.parse(responseBody);
            var failedItems;
            var success;
            var error;

            if (response.statusCode >= 200 && response.statusCode < 299) {
                failedItems = info.items.filter(function(x) {
                    return x.index.status >= 300;
                });

                success = {
                    "attemptedItems": info.items.length,
                    "successfulItems": info.items.length - failedItems.length,
                    "failedItems": failedItems.length
                };
            }

            if (response.statusCode !== 200 || info.errors === true) {
                // prevents logging of failed entries, but allows logging 
                // of other errors such as access restrictions
                delete info.items;
                error = {
                    statusCode: response.statusCode,
                    responseBody: info
                };
            }

            callback(error, success, response.statusCode, failedItems);
        });
    }).on('error', function(e) {
        callback(e);
    });
    request.end(requestParams.body);
}

function buildRequest(endpoint, body) {
    var endpointParts = endpoint.match(/^([^\.]+)\.?([^\.]*)\.?([^\.]*)\.amazonaws\.com$/);
    var region = endpointParts[2];
    var service = endpointParts[3];
    var datetime = (new Date()).toISOString().replace(/[:\-]|\.\d{3}/g, '');
    var date = datetime.substr(0, 8);
    var kDate = hmac('AWS4' + process.env.AWS_SECRET_ACCESS_KEY, date);
    var kRegion = hmac(kDate, region);
    var kService = hmac(kRegion, service);
    var kSigning = hmac(kService, 'aws4_request');

    var request = {
        host: endpoint,
        method: 'POST',
        path: '/_bulk',
        body: body,
        headers: {
            'Content-Type': 'application/json',
            'Host': endpoint,
            'Content-Length': Buffer.byteLength(body),
            'X-Amz-Security-Token': process.env.AWS_SESSION_TOKEN,
            'X-Amz-Date': datetime
        }
    };

    var canonicalHeaders = Object.keys(request.headers)
        .sort(function(a, b) {
            return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
        })
        .map(function(k) {
            return k.toLowerCase() + ':' + request.headers[k];
        })
        .join('\n');

    var signedHeaders = Object.keys(request.headers)
        .map(function(k) {
            return k.toLowerCase();
        })
        .sort()
        .join(';');

    var canonicalString = [
        request.method,
        request.path, '',
        canonicalHeaders, '',
        signedHeaders,
        hash(request.body, 'hex'),
    ].join('\n');

    var credentialString = [date, region, service, 'aws4_request'].join('/');

    var stringToSign = [
        'AWS4-HMAC-SHA256',
        datetime,
        credentialString,
        hash(canonicalString, 'hex')
    ].join('\n');

    request.headers.Authorization = [
        'AWS4-HMAC-SHA256 Credential=' + process.env.AWS_ACCESS_KEY_ID + '/' + credentialString,
        'SignedHeaders=' + signedHeaders,
        'Signature=' + hmac(kSigning, stringToSign, 'hex')
    ].join(', ');

    return request;
}

function hmac(key, str, encoding) {
    return crypto.createHmac('sha256', key).update(str, 'utf8').digest(encoding);
}

function hash(str, encoding) {
    return crypto.createHash('sha256').update(str, 'utf8').digest(encoding);
}

function logFailure(error, failedItems) {
    if (logFailedResponses) {
        console.log('Error: ' + JSON.stringify(error, null, 2));

        if (failedItems && failedItems.length > 0) {
            console.log("Failed Items: " +
                JSON.stringify(failedItems, null, 2));
        }
    }
}
