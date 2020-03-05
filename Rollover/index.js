var querystring = require('querystring');
var http = require('https');
var host = "search-xxx.xxx.es.amazonaws.com";

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
        var aliasesOutput = '';

        var post_alias_req = https.request(post_alias_options, function(post_alias_res) {
            post_alias_res.setEncoding('utf8');
            post_alias_res.on('data', (chunk) => {
                console.log("Data : " + chunk);
                aliasesOutput += chunk;
            });

            post_alias_res.on('end', () => {
                console.log('Post Alias Response: ' + aliasesOutput);
                resolve(aliasesOutput);
            });
            post_alias_res.on('error', function(e) {
                console.log("Post Alias Got error: " + e.message);
                reject(e);
            });

        });
        post_alias_req.write(JSON.stringify(alias));
        post_alias_req.end();
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
        var post_rollover_req = https.request(post_rollover_options, function(post_rollover_res) {
            post_rollover_res.setEncoding('utf8');
            post_rollover_res.on('data', (chunk) => {
                console.log("Data : " + chunk);
                rolloverOutput += chunk;
            });

            post_rollover_res.on('end', () => {
                console.log('Post Rollover Response: ' + rolloverOutput);
                resolve(rolloverOutput);
            });
            post_rollover_res.on('error', function(e) {
                console.log("Post Rollover Got error: " + e.message);
                reject(e);
            });

        });
        console.log("Starting to Rollover Index : " + index + ", Alias : " + aliasName);
        post_rollover_req.write(JSON.stringify(obj));
        post_rollover_req.end();
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
