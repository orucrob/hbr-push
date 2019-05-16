var AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
var DDB = new AWS.DynamoDB({ apiVersion: '2012-10-08' })

exports.handler = function(event, context, callback) {
    console.log('Received $onconnect event:', JSON.stringify(event, null, 2))
    var putParams = {
        TableName: process.env.TABLE_NAME,
        Item: {
            connectionId: { S: event.requestContext.connectionId },
            endpoint: {
                S:
                    event.requestContext.domainName +
                    '/' +
                    event.requestContext.stage
            }
        }
    }

    DDB.putItem(putParams, function(err) {
        callback(null, {
            statusCode: err ? 500 : 200,
            body: err
                ? 'Failed to connect: ' + JSON.stringify(err)
                : 'Connected.'
        })
    })
}
