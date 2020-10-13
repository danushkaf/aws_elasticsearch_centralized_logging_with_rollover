var querystring = require('querystring');
var https = require('https');
var AWS = require('aws-sdk');

let region = process.env.AWS_REGION;
let host = process.env.elasticsearch_cluster_dns;
let environment_name = process.env.environment_name;
let is_snapshots_enabled = process.env.is_snapshots_enabled;
let snapshot_bucket_name = process.env.snapshot_bucket_name;
let snapshot_role_name = process.env.snapshot_role_name;

exports.handler = async (event, context) => {
    await snapshotRegister(context);
    context.succeed();
}

function snapshotRegisterPromise(context) {
    return new Promise((resolve, reject) => {
        var snapshotReq = {
          "type": "s3",
          "settings": {
            "bucket": snapshot_bucket_name,
            "region": region,
            "role_arn": snapshot_role_name
          }
        };
        var endpoint = new AWS.Endpoint(host);
        var request = new AWS.HttpRequest(endpoint, region);
        request.method = 'POST';
        request.headers['Content-Type'] = 'application/json';
        request.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(snapshotReq));
        request.path = '/_snapshot/' + environment_name;
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

async function snapshotRegister(context) {
    try {
        let http_promise = snapshotRegisterPromise(context);
        let snapshot_register_output = await http_promise;
        return snapshot_register_output;
    } catch (error) {
        console.log(error);
        return "";
    }
}
