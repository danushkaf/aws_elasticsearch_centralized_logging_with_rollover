var querystring = require('querystring');
var https = require('https');
var AWS = require('aws-sdk');

var region = 'xxx';
var host = "search-xxxx.xxx.es.amazonaws.com";

exports.handler = async (event, context) => {
    var indices = await getIndices(context);
    for (let key in indices) {
        if (key.startsWith(".")) {
            continue;
        }
        if (indices.hasOwnProperty(key)) {
            var index = indices[key];
            var aliasName = key.substr(0, key.lastIndexOf("-"));
            if (!Object.keys(index.aliases).length) {
                console.log("Creating Alias for : " + key + ", Alias name : " + aliasName);
                var alias = await createAlias(context, aliasName, key);
            }
            await rollover(context, aliasName, key);
        }
    }
    context.succeed();
}

function getIndicesPromise(context) {
    return new Promise((resolve, reject) => {
        var aliases = {};
        var indices = [];
        var endpoint = new AWS.Endpoint(host);
        var request = new AWS.HttpRequest(endpoint, region);
        request.method = 'GET';
        request.headers['Content-Type'] = 'application/json';
        request.headers['Content-Length'] = 0;
        request.path = '/*';
        request.headers['host'] = host;
        request.headers['port'] = 443;
        var indicesOutput = '';

        var credentials = new AWS.EnvironmentCredentials('AWS');
        var signer = new AWS.Signers.V4(request, 'es');
        signer.addAuthorization(credentials, new Date());
        var client = new AWS.HttpClient();
        client.handleRequest(request, null, function(response) {
            console.log(response.statusCode + ' ' + response.statusMessage);
            response.on('data', function(chunk) {
                indicesOutput += chunk;
            });
            response.on('end', function(chunk) {
                console.log('Get Indices Response: ');
                indices = JSON.parse(indicesOutput);
                resolve(indices);
            });
        }, function(e) {
            console.log("Get Indices Got error: " + e.message);
            reject(e);
        });
    });
}

async function getIndices(context) {
    try {
        let http_promise = getIndicesPromise(context);
        let indices = await http_promise;
        return indices;
    } catch (error) {
        console.log(error);
        return [];
    }
}

function createAliasPromise(context, aliasName, index) {
    return new Promise((resolve, reject) => {
        var alias = {
            "actions": [{
                "add": {
                    "index": index,
                    "alias": aliasName,
                    "is_write_index": true
                }
            }]
        };
        var endpoint = new AWS.Endpoint(host);
        var request = new AWS.HttpRequest(endpoint, region);
        request.method = 'POST';
        request.headers['Content-Type'] = 'application/json';
        request.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(alias));
        request.path = '/_aliases';
        request.body = JSON.stringify(alias);
        request.headers['host'] = host;
        request.headers['port'] = 443;
        var indicesOutput = '';
        var aliasesOutput = '';

        var credentials = new AWS.EnvironmentCredentials('AWS');
        var signer = new AWS.Signers.V4(request, 'es');
        signer.addAuthorization(credentials, new Date());
        var client = new AWS.HttpClient();
        client.handleRequest(request, null, function(response) {
            console.log(response.statusCode + ' ' + response.statusMessage);
            response.on('data', function(chunk) {
                console.log("Data : " + chunk);
                aliasesOutput += chunk;
            });
            response.on('end', function(chunk) {
                console.log('Post Alias Response: ' + aliasesOutput);
                resolve(aliasesOutput);
            });
        }, function(e) {
            console.log("Post Alias Got error: " + e.message);
            reject(e);
        });

    });
}

async function createAlias(context, aliasName, index) {
    try {
        let http_promise = createAliasPromise(context, aliasName, index);
        let alias_output = await http_promise;
        return alias_output;
    } catch (error) {
        console.log(error);
        return "";
    }
}

function rolloverPromise(context, aliasName, index) {
    return new Promise((resolve, reject) => {
        var obj = {
            "conditions": {
                "max_age": "1d"
            }
        };
        var rolloverOutput = '';
        var endpoint = new AWS.Endpoint(host);
        var request = new AWS.HttpRequest(endpoint, region);
        request.method = 'POST';
        request.headers['Content-Type'] = 'application/json';
        request.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(obj));
        request.body = JSON.stringify(obj);
        request.path = '/' + aliasName + '/_rollover';
        request.headers['host'] = host;
        request.headers['port'] = 443;
        var credentials = new AWS.EnvironmentCredentials('AWS');
        var signer = new AWS.Signers.V4(request, 'es');
        signer.addAuthorization(credentials, new Date());
        var client = new AWS.HttpClient();
        client.handleRequest(request, null, function(response) {
            console.log(response.statusCode + ' ' + response.statusMessage);
            response.on('data', function(chunk) {
                console.log("Data : " + chunk);
                rolloverOutput += chunk;
            });
            response.on('end', function(chunk) {
                console.log('Post Rollover Response: ' + rolloverOutput);
                resolve(rolloverOutput);
            });
        }, function(e) {
            console.log("Post Rollover Got error: " + e.message);
            reject(e);
        });
    });
}

async function rollover(context, aliasName, index) {
    try {
        let http_promise = rolloverPromise(context, aliasName, index);
        let rollover_output = await http_promise;
        return rollover_output;
    } catch (error) {
        console.log(error);
        return "";
    }
}
