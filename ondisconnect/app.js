var AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
var DDB = new AWS.DynamoDB({ apiVersion: '2012-10-08' })

exports.handler = async function (event, context) {
    var deleteParams = {
        TableName: process.env.TABLE_NAME,
        Key: {
            connectionId: { S: event.requestContext.connectionId }
        }
    }

    try {
        await DDB.deleteItem(deleteParams).promise()
        return {
            statusCode: 200,
            body: 'Disconnected.'
        }
    } catch (err) {
        console.log('Failed to disconnect:' + err)
        return {
            statusCode: 500,
            body: 'Failed to disconnect: ' + JSON.stringify(err)
        }
    }
}
