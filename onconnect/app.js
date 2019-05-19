var AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
var DDB = new AWS.DynamoDB({ apiVersion: '2012-10-08' })

exports.handler = async event => {
    console.log('Received $onconnect event:', JSON.stringify(event, null, 2))

    let connectionId = event.requestContext.connectionId
    let userId = (event.requestContext.authorizer || {}).sub
    let domainName = event.requestContext.domainName
    let stage = event.requestContext.stage
    var putParams = {
        TableName: process.env.TABLE_NAME,
        Item: {
            connectionId: { S: connectionId },
            userId: { S: userId },
            endpoint: { S: `${domainName}/${stage}` }
        }
    }

    try {
        let resp = await DDB.putItem(putParams).promise()
        return {
            statusCode: 200,
            body: 'Connected.'
        }
    } catch (err) {
        console.log('Unable to save connection to DB.' + err)
        return {
            statusCode: 500,
            body: 'Failed to connect: ' + JSON.stringify(err)
        }
    }
}
