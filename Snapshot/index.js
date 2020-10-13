var querystring = require('querystring');
var https = require('https');
var AWS = require('aws-sdk');

let region = process.env.AWS_REGION;
let host = process.env.elasticsearch_cluster_dns;
let environment_name = process.env.environment_name;

exports.handler = async (event, context) => {
    await snapshot(context);
    context.succeed();
}

function snapshotPromise(context) {
    return new Promise((resolve, reject) => {
        timestamp = Date.now();
        var snapshotReq = {};
        var endpoint = new AWS.Endpoint(host);
        var request = new AWS.HttpRequest(endpoint, region);
        request.method = 'PUT';
        request.headers['Content-Type'] = 'application/json';
        request.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(snapshotReq));
        request.path = '/_snapshot/' + environment_name + '/' + timestamp;
        request.body = JSON.stringify(snapshotReq);
        request.headers['host'] = host;
        request.headers['port'] = 443;
        var snapshotRegisterOutput = '';

        var credentials = new AWS.EnvironmentCredentials('AWS');
        var signer = new AWS.Signers.V4(request, 'es');
        signer.addAuthorization(credentials, new Date());
        var client = new AWS.HttpClient();
        client.handleRequest(request, null, function(response) {
            console.log(response.statusCode + ' ' + response.statusMessage);
            response.on('data', function(chunk) {
                console.log("Data : " + chunk);
                snapshotRegisterOutput += chunk;
            });
            response.on('end', function(chunk) {
                console.log('Post Alias Response: ' + snapshotRegisterOutput);
                resolve(snapshotRegisterOutput);
            });
        }, function(e) {
            console.log("Post Alias Got error: " + e.message);
            reject(e);
        });

    });
}

async function snapshot(context) {
    try {
        let http_promise = snapshotPromise(context);
        let snapshot_output = await http_promise;
        return snapshot_output;
    } catch (error) {
        console.log(error);
        return "";
    }
}
