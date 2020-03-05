var querystring = require('querystring');
var https = require('https');

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
        var get_indices_options = {
            host: host,
            port: 443,
            path: '/*',
            method: 'GET'
        };
        var indicesOutput = '';

        var get_indices_request = https.request(get_indices_options, function(res) {
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                indicesOutput += chunk;
            });
            res.on('end', () => {
                console.log('Get Indices Response: ');
                indices = JSON.parse(indicesOutput);
                resolve(indices);
            });
            res.on('error', function(e) {
                console.log("Get Indices Got error: " + e.message);
                reject(e);
            });
        });
        get_indices_request.end();
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
        var delete_index_options = {
            host: host,
            port: 443,
            path: '/' + key,
            method: 'DELETE'
        };
        var deleteOutput = '';
        var delete_index_req = https.request(delete_index_options, function(delete_res) {
            delete_res.setEncoding('utf8');
            delete_res.on('data', (chunk) => {
                console.log('Data: ' + chunk);
                deleteOutput += chunk;
            });

            delete_res.on('end', () => {
                console.log('Delete Index Response: ' + deleteOutput);
                resolve(deleteOutput);
            });
            delete_res.on('error', function(e) {
                console.log("Delete Index Got error: " + e.message);
                reject(e);
            });

        });
        delete_index_req.end();
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
