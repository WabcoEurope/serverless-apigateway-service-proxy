'use strict'

const _ = require('lodash')

const SERVICE_NAME = 'iotdata'

module.exports = {
  compileIamRoleToIoTData() {
    if (!this.shouldCreateDefaultRole(SERVICE_NAME)) {
      return
    }

    const bucketActions = _.flatMap(this.getAllServiceProxies(), (serviceProxy) => {
      return _.flatMap(Object.keys(serviceProxy), (serviceName) => {
        if (serviceName !== SERVICE_NAME) {
          return []
        }
        return {
          action: serviceProxy.iotdata.action
        }
      })
    })

    const permissions = bucketActions.map(({ action }) => {
      return {
        Effect: 'Allow',
        Action: `iot:${action}*`, // e.g. PutObject*, GetObject*, DeleteObject*
        Resource: '*'
      }
    })

    const template = {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Service: 'apigateway.amazonaws.com'
              },
              Action: 'sts:AssumeRole'
            }
          ]
        },
        Policies: [
          {
            PolicyName: 'apigatewaytoiodata',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: [
                    'logs:CreateLogGroup',
                    'logs:CreateLogStream',
                    'logs:DescribeLogGroups',
                    'logs:DescribeLogStreams',
                    'logs:PutLogEvents',
                    'logs:GetLogEvents',
                    'logs:FilterLogEvents'
                  ],
                  Resource: '*'
                },
                ...permissions
              ]
            }
          }
        ]
      }
    }

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      ApigatewayToIoTDataRole: template
    })
  }
}
