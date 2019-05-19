var AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
var DDB = new AWS.DynamoDB({ apiVersion: '2012-08-10' })

// Add ApiGatewayManagementApi to the AWS namespace
// This is a temporary "fix" to provide the SDK until it becomes available.

require('aws-sdk/clients/apigatewaymanagementapi')

const { TABLE_NAME } = process.env

let apigwManagementApi = {}
const getApi = function(endpoint) {
    if (!apigwManagementApi[endpoint]) {
        apigwManagementApi[endpoint] = new AWS.ApiGatewayManagementApi({
            apiVersion: '2018-11-29',
            endpoint: endpoint
        })
    }
    return apigwManagementApi[endpoint]
}

exports.handler = async (event, context) => {
    console.log('Event:', JSON.stringify(event))
    //all Records in event shoud be like: {userId, message}

    //prepare data to send
    let userMessages = undefined
    if (event.Records && event.Records.length > 0) {
        //messages from sqs
        let data = event.Records.map(rec => JSON.parse(rec.body))
        userMessages = data.reduce((acc, d) => {
            if (!acc[d.userId]) {
                acc[d.userId] = []
            }
            acc[d.userId].push(d.message)
            return acc
        }, {})
    } else {
        //nothing to send
    }

    console.log('User messages to send: ' + JSON.stringify(userMessages))
    //send all messages to users
    if (userMessages) {
        const userPromisses = Object.keys(userMessages).map(async userId => {
            var params = {
                IndexName: 'userGSI',
                ExpressionAttributeValues: {
                    ':uId': { S: userId }
                },
                KeyConditionExpression: 'userId = :uId',
                TableName: TABLE_NAME
            }
            let userRec = await DDB.query(params).promise()

            console.log(
                'Found user connection in DB ' + JSON.stringify(userRec.Items)
            )
            //post data to all active connections (it should be only one or none)
            const postCalls = userRec.Items.map(
                async ({ connectionId, endpoint }) => {
                    try {
                        for (const message of userMessages[userId]) {
                            console.log('Sending message: ' + message)
                            await getApi(endpoint.S)
                                .postToConnection({
                                    ConnectionId: connectionId.S,
                                    Data: message
                                })
                                .promise()
                            console.log('Message sent')
                        }
                    } catch (e) {
                        if (e.statusCode === 410) {
                            console.log(
                                `Found stale connection, deleting ${
                                    connectionId.S
                                }`
                            )
                            await DDB.deleteItem({
                                TableName: TABLE_NAME,
                                Key: { connectionId }
                            }).promise()
                        } else {
                            console.log(`Error sending message: ${e}`)
                            //some other exception
                            throw e
                        }
                    }
                }
            )

            //wait to finish
            await Promise.all(postCalls)
            console.log('All messages processed for user: ' + userId)
            return `OK for user: ${userId}`
        }) //end userId

        //wait to finish
        try {
            await Promise.all(userPromisses)
        } catch (e) {
            return { statusCode: 500, body: e.stack }
        }
        return { statusCode: 200, body: 'Data sent.' }
    } else {
        console.log('Nothing to send. Wrong event.' + JSON.stringify(event))
        return { statusCode: 200, body: 'No data to send.' }
    }
}
