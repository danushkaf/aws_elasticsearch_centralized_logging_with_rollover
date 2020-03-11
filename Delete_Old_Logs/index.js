var querystring = require('querystring');
var https = require('https');
var AWS = require('aws-sdk');

var region = 'xxx';
var host = "search-xxxx.xxx.es.amazonaws.com";

exports.handler = async (event, context) => {

    var indices = await getIndices(context);

    for (let key in indices) {
        if (!key.startsWith("development_")) {
            continue;
        }
        if (indices.hasOwnProperty(key)) {
            try {
                var createdTimeStamp = indices[key].settings.index.creation_date;
                var createdDate = new Date(parseInt(createdTimeStamp));
                console.log("Current Index : " + key + ", Created Date : " + createdDate);
                var now = new Date();
                var ageDays = (now.getTime() - createdDate.getTime()) / (1000 * 3600 * 24);
                console.log("Current Index : " + key + ", Age in Days : " + ageDays);
                if (ageDays > 3) {
                    console.log("Deleting the index : " + key);
                    await delIndices(context, key);
                }
            } catch (e) {
                console.log(e);
                // Continue when timestamp is not found
            }
        }
    }
    context.succeed();
}

function getIndicesPromise(context) {
    return new Promise((resolve, reject) => {
        var aliases = {};
        var indices = [];
        var indicesOutput = '';
        var endpoint = new AWS.Endpoint(host);
        var request = new AWS.HttpRequest(endpoint, region);
        request.method = 'GET';
        request.headers['Content-Type'] = 'application/json';
        request.headers['Content-Length'] = 0;
        request.path = '/*';
        request.headers['host'] = host;
        request.headers['port'] = 443;
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
        return "";
    }
}

function delIndicesPromise(context, key) {
    return new Promise((resolve, reject) => {
        var deleteOutput = '';
        var endpoint = new AWS.Endpoint(host);
        var request = new AWS.HttpRequest(endpoint, region);
        request.method = 'DELETE';
        request.headers['Content-Type'] = 'application/json';
        request.headers['Content-Length'] = 0;
        request.path = '/' + key;
        request.headers['host'] = host;
        request.headers['port'] = 443;
        var credentials = new AWS.EnvironmentCredentials('AWS');
        var signer = new AWS.Signers.V4(request, 'es');
        signer.addAuthorization(credentials, new Date());
        var client = new AWS.HttpClient();
        client.handleRequest(request, null, function(response) {
            console.log(response.statusCode + ' ' + response.statusMessage);
            response.on('data', function(chunk) {
                console.log('Data: ' + chunk);
                deleteOutput += chunk;
            });
            response.on('end', function(chunk) {
                console.log('Delete Index Response: ' + deleteOutput);
                resolve(deleteOutput);
            });
        }, function(e) {
            console.log("Delete Index Got error: " + e.message);
            reject(e);
        });
    });
}

async function delIndices(context, key) {
    try {
        let http_promise = delIndicesPromise(context, key);
        let del_indices = await http_promise;
        return del_indices;
    } catch (error) {
        console.log(error);
        return "";
    }
}
