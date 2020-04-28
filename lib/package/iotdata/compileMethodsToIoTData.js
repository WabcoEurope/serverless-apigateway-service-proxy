'use strict'

const _ = require('lodash')

module.exports = {
  compileMethodsToIoTData() {
    this.validated.events.forEach((event) => {
      if (event.serviceName === 'iotdata') {
        const resourceId = this.getResourceId(event.http.path)
        const resourceName = this.getResourceName(event.http.path)

        const template = {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: event.http.method.toUpperCase(),
            RequestParameters: event.http.acceptParameters || {},
            AuthorizationType: event.http.auth.authorizationType,
            AuthorizationScopes: event.http.auth.authorizationScopes,
            AuthorizerId: event.http.auth.authorizerId,
            ApiKeyRequired: Boolean(event.http.private),
            ResourceId: resourceId,
            RestApiId: this.provider.getApiGatewayRestApiId()
          }
        }

        _.merge(
          template,
          this.getIoTDataMethodIntegration(event.http),
          this.getMethodResponses(event.http)
        )

        // ensure every integration request and response param mapping is
        // also configured in the method request and response param mappings
        Object.values(template.Properties.Integration.RequestParameters)
          .filter((x) => typeof x === 'string' && x.startsWith('method.'))
          .forEach((x) => {
            template.Properties.RequestParameters[x] = true
          })

        template.Properties.Integration.IntegrationResponses.forEach((resp) => {
          Object.keys(resp.ResponseParameters)
            .filter((x) => x.startsWith('method.'))
            .forEach((x) => {
              const methodResp = template.Properties.MethodResponses.find(
                (y) => y.StatusCode === resp.StatusCode
              )
              methodResp.ResponseParameters[x] = true
            })
        })

        const methodLogicalId = this.provider.naming.getMethodLogicalId(
          resourceName,
          event.http.method
        )

        this.apiGatewayMethodLogicalIds.push(methodLogicalId)

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [methodLogicalId]: template
        })
      }
    })
  },

  getIntegrationHttpMethod(http) {
    switch (http.action) {
      case 'Publish':
        return 'POST'
    }
  },

  getObjectRequestParameter(http) {
    if (http.key.pathParam) {
      return `method.request.path.${http.key.pathParam}`
    }

    if (http.key.queryStringParam) {
      return `method.request.querystring.${http.key.queryStringParam}`
    }

    if (http.key.header) {
      return `method.request.header.${http.key.header}`
    }

    return `'${http.key}'`
  },

  getIntegrationResponseParameters(http) {
    switch (http.action) {
      case 'Publish':
        return {}
    }
  },

  getIoTDataMethodIntegration(http) {
    const { topic } = http
    const httpMethod = this.getIntegrationHttpMethod(http)
    let requestParams = {}
    if (_.has(http, 'key')) {
      const objectRequestParam = this.getObjectRequestParameter(http)
      requestParams = _.merge(requestParams, {
        'integration.request.path.object': objectRequestParam
      })
    }
    let service = 'iotdata'
    if (_.has(http, 'subdomain')) {
      service = http.subdomain + '.iotdata'
    }
    const responseParams = this.getIntegrationResponseParameters(http)

    const roleArn = http.roleArn || {
      'Fn::GetAtt': ['ApigatewayToIoTDataRole', 'Arn']
    }

    const integration = {
      IntegrationHttpMethod: httpMethod,
      Type: 'AWS',
      Credentials: roleArn,
      Uri: {
        'Fn::Sub': ['arn:aws:apigateway:${AWS::Region}:' + service + ':path//topics' + topic, {}]
      },
      PassthroughBehavior: 'WHEN_NO_MATCH',
      RequestParameters: _.merge(requestParams, http.requestParameters)
    }

    const integrationResponse = {
      IntegrationResponses: [
        {
          StatusCode: 400,
          SelectionPattern: '4\\d{2}',
          ResponseParameters: {},
          ResponseTemplates: {}
        },
        {
          StatusCode: 500,
          SelectionPattern: '5\\d{2}',
          ResponseParameters: {},
          ResponseTemplates: {}
        },
        {
          StatusCode: 200,
          SelectionPattern: '2\\d{2}',
          ResponseParameters: responseParams,
          ResponseTemplates: {}
        }
      ]
    }

    this.addCors(http, integrationResponse)

    _.merge(integration, integrationResponse)

    return {
      Properties: {
        Integration: integration
      }
    }
  }
}
