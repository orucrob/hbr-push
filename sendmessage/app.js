const AWS = require('aws-sdk')

// Add ApiGatewayManagementApi to the AWS namespace
require('aws-sdk/clients/apigatewaymanagementapi')

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' })

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

    let connectionData

    //get active connections from DB
    try {
        connectionData = await ddb
            .scan({
                TableName: TABLE_NAME,
                ProjectionExpression: 'connectionId, endpoint'
            })
            .promise()
    } catch (e) {
        return { statusCode: 500, body: e.stack }
    }

    //prepare data to send
    let recs = []
    if (event.Records && event.Records.length > 0) {
        //messages from sqs
        recs = event.Records
    } else if (event.body) {
        //direct message from api gateway
        recs.push(event)
    }
    let postData = recs.map(rec => JSON.parse(rec.body).data)

    //post data to all active connections
    const postCalls = connectionData.Items.map(
        async ({ connectionId, endpoint }) => {
            try {
                for (const postDataItem of postData) {
                    await getApi(endpoint)
                        .postToConnection({
                            ConnectionId: connectionId,
                            Data: postDataItem
                        })
                        .promise()
                }
            } catch (e) {
                if (e.statusCode === 410) {
                    console.log(
                        `Found stale connection, deleting ${connectionId}`
                    )
                    await ddb
                        .delete({
                            TableName: TABLE_NAME,
                            Key: { connectionId }
                        })
                        .promise()
                } else {
                    throw e
                }
            }
        }
    )

    //wait to finish
    try {
        await Promise.all(postCalls)
    } catch (e) {
        return { statusCode: 500, body: e.stack }
    }

    return { statusCode: 200, body: 'Data sent.' }
}
