var https = require('https')
var jose = require('node-jose')

var keys_url =
    'https://cognito-idp.' +
    (process.env.COGNITO_REGION || process.env.AWS_REGION) +
    '.amazonaws.com/' +
    process.env.COGNITO_USERPOOLID +
    '/.well-known/jwks.json'

exports.handler = async (event, context) => {
    console.log('Received event:', JSON.stringify(event, null, 2))

    // Retrieve request parameters from the Lambda function input:
    var headers = event.headers
    var queryStringParameters = event.queryStringParameters
    var stageVariables = event.stageVariables
    var requestContext = event.requestContext

    // Parse the input for the parameter values
    var tmp = event.methodArn.split(':')
    var apiGatewayArnTmp = tmp[5].split('/')
    var awsAccountId = tmp[4]
    var region = tmp[3]
    var restApiId = apiGatewayArnTmp[0]
    var stage = apiGatewayArnTmp[1]
    var route = apiGatewayArnTmp[2]

    // Perform authorization to return the Allow policy for correct parameters and
    // the 'Unauthorized' error, otherwise.
    var authResponse = {}
    var condition = {}
    condition.IpAddress = {}

    let token = headers.Authorization
    if (token) {
        try {
            let claims = await validateToken(token)
            let resp = generateAllow(claims.sub, event.methodArn)
            resp.context = claims
            return resp
        } catch (err) {
            console.log('Token not valid: ' + err)
            throw new Error('Unauthorized')
        }
    } else {
        throw new Error('Unauthorized')
    }
}

// Help function to generate an IAM policy
var generatePolicy = function(principalId, effect, resource) {
    // Required output:
    var authResponse = {}
    authResponse.principalId = principalId
    if (effect && resource) {
        var policyDocument = {}
        policyDocument.Version = '2012-10-17' // default version
        policyDocument.Statement = []
        var statementOne = {}
        statementOne.Action = 'execute-api:Invoke' // default action
        statementOne.Effect = effect
        statementOne.Resource = resource
        policyDocument.Statement[0] = statementOne
        authResponse.policyDocument = policyDocument
    }
    // Optional output with custom properties of the String, Number or Boolean type.
    authResponse.context = {
        stringKey: 'stringval',
        numberKey: 123,
        booleanKey: true
    }
    return authResponse
}

var generateAllow = function(principalId, resource) {
    return generatePolicy(principalId, 'Allow', resource)
}

var generateDeny = function(principalId, resource) {
    return generatePolicy(principalId, 'Deny', resource)
}

let keysMap = undefined

const getPublicKeys = () => {
    return new Promise((resolve, reject) => {
        if (keysMap) {
            resolve(keysMap)
        } else {
            https.get(keys_url, function(response) {
                if (response.statusCode == 200) {
                    response.on('data', function(body) {
                        keysMap = {}
                        let keys = JSON.parse(body)['keys']

                        // search for the kid in the downloaded public keys
                        for (var i = 0; i < keys.length; i++) {
                            keysMap[keys[i].kid] = keys[i]
                        }
                        console.log(
                            'got all public keys:' + JSON.stringify(keysMap)
                        )
                        resolve(keysMap)
                    })
                } else {
                    reject('Unable to get keys.')
                }
            })
        }
    })
}

const validateToken = async token => {
    var sections = token.split('.')

    // get the kid from the headers prior to verification
    var header = jose.util.base64url.decode(sections[0])
    header = JSON.parse(header)
    var kid = header.kid

    // download the public keys
    let keys = await getPublicKeys()
    let key = keys[kid]

    if (key) {
        let result = await jose.JWK.asKey(key)
        let verifyResult = await jose.JWS.createVerify(result).verify(token)

        // now we can use the claims
        var claims = JSON.parse(verifyResult.payload)

        // additionally we can verify the token expiration
        var current_ts = Math.floor(new Date() / 1000)
        if (current_ts > claims.exp) {
            throw new Error('Token is expired')
        }

        // and the Audience (use claims.client_id if verifying an access token) if appclient specified
        if (
            process.env.COGNITO_APPCLIENT &&
            claims.aud != process.env.COGNITO_APPCLIENT
        ) {
            throw new Error('Token was not issued for this audience')
        }

        return claims
    } else {
        throw new Error('No key for kid.')
    }
}
