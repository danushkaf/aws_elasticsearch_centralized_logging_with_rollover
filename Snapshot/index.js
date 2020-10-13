var querystring = require('querystring');
var https = require('https');
var AWS = require('aws-sdk');

let region = process.env.AWS_REGION;
let host = process.env.elasticsearch_cluster_dns;
let environment_name = process.env.environment_name;
let is_snapshots_enabled = process.env.is_snapshots_enabled;
let snapshot_bucket_name = process.env.snapshot_bucket_name;
let snapshot_role_name = process.env.snapshot_role_name;

var responseStatus = "FAILED";
var responseData = {};

exports.handler = async (event, context) => {
    console.log("REQUEST RECEIVED:\n" + JSON.stringify(event));

    // For Delete requests, immediately send a SUCCESS response.
    if (event.RequestType == "Delete") {
        sendResponse(event, context, "SUCCESS");
        return;
    }
    await snapshotRegister(context, event);
    await sendResponse(context, event);
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

async function snapshotRegister(context, event) {
    try {
        let http_promise = snapshotRegisterPromise(context);
        let snapshot_register_output = await http_promise;
        responseStatus = "SUCCESS";
        responseData = {Status: "Success"};
        return snapshot_register_output;
    } catch (error) {
        console.log(error);
        responseData = {Error: "Register Snapshot repository call failed"};
        return "";
    }
}

async function sendResponse(context, event) {
    try {
        let http_promise = sendResponsePromise(event, context, responseStatus, responseData);
        let snapshot_register_output = await http_promise;
        return snapshot_register_output;
    } catch (error) {
        console.log(error);
        return "";
    }
}

// Send response to the pre-signed S3 URL
function sendResponsePromise(event, context, responseStatus, responseData) {
    return new Promise((resolve, reject) => {
        var responseBody = JSON.stringify({
            Status: responseStatus,
            Reason: "See the details in CloudWatch Log Stream: " + context.logStreamName,
            PhysicalResourceId: context.logStreamName,
            StackId: event.StackId,
            RequestId: event.RequestId,
            LogicalResourceId: event.LogicalResourceId,
            Data: responseData
        });

        console.log("RESPONSE BODY:\n", responseBody);

        var https = require("https");
        var url = require("url");

        var parsedUrl = url.parse(event.ResponseURL);
        var options = {
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.path,
            method: "PUT",
            headers: {
                "content-type": "",
                "content-length": responseBody.length
            }
        };

        console.log("SENDING RESPONSE...\n");

        var request = https.request(options, function(response) {
            console.log("STATUS: " + response.statusCode);
            console.log("HEADERS: " + JSON.stringify(response.headers));
            // Tell AWS Lambda that the function execution is done
            context.done();
        });

        request.on("error", function(error) {
            console.log("sendResponse Error:" + error);
            // Tell AWS Lambda that the function execution is done
            context.done();
        });

        // write data to request body
        request.write(responseBody);
        request.end();
    });
}
