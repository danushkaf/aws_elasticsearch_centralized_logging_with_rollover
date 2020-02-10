var querystring = require('querystring');
var http = require('https');

exports.handler = function(event, context) {

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
                            console.log("Deleting the index : ");
                            var delete_index_options = {
                                host: host,
                                port: 443,
                                path: '/' + key,
                                method: 'DELETE',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Content-Length': Buffer.byteLength(JSON.stringify(alias))
                                }
                            };
                            var deleteOutput = '';
                            var delete_index_req = http.request(delete_index_options, function(res) {
                                res.setEncoding('utf8');
                                res.on('data', (chunk) => {
                                    deleteOutput += chunk;
                                });

                                res.on('end', () => {
                                    console.log('Delete Index Response: ' + deleteOutput);
                                    context.succeed();
                                });
                                res.on('error', function(e) {
                                    console.log("Delete Index Got error: " + e.message);
                                    context.done(null, 'FAILURE');
                                });

                            });
                            delete_index_req.end();
                        }
                    } catch (e) {
                        // Continue when timestamp is not found
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
