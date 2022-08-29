import {
  CfnOutput,
  Stack,
  StackProps,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs_lambda,
  aws_dynamodb as ddb,
  aws_stepfunctions_tasks as tasks,
  aws_stepfunctions as sfn,
  aws_iam as iam,
  aws_events as events,
  aws_events_targets as event_targets,
  aws_appconfig as appconfig,
  Duration,
  RemovalPolicy,
  CfnParameter,
  custom_resources as cr,
} from 'aws-cdk-lib';
import { HttpMethod, RuleTargetInput } from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import * as path from 'path';

export interface FeatureFlagInfraStackProps extends StackProps {
  appconfigApplication: appconfig.CfnApplication;
  appconfigConfigurationProfile: appconfig.CfnConfigurationProfile;
  appconfigEnv: appconfig.CfnEnvironment;
  discountCodeDeploymentStrategy: appconfig.CfnDeploymentStrategy;
}

export class FeatureFlagAutoOffStack extends Stack {
  private appconfigApplication: appconfig.CfnApplication;
  private appconfigConfigurationProfile: appconfig.CfnConfigurationProfile;
  private appconfigEnv: appconfig.CfnEnvironment;
  private discountCodeDeploymentStrategy: appconfig.CfnDeploymentStrategy;

  constructor(scope: Construct, id: string, props: FeatureFlagInfraStackProps) {
    super(scope, id, props);

    this.appconfigApplication = props.appconfigApplication;
    this.appconfigConfigurationProfile = props.appconfigConfigurationProfile;
    this.appconfigEnv = props.appconfigEnv;
    this.discountCodeDeploymentStrategy = props.discountCodeDeploymentStrategy;

    var paramDiscountCode = new CfnParameter(this, 'discountCode', { type: 'String' });
    var discountCodeMaxUsage = new CfnParameter(this, 'discountCodeMaxUsage', { type: 'Number' });
    var adminEMail = new CfnParameter(this, 'adminEmail', { type: 'String' });
    var sesFromEmail = new CfnParameter(this, 'sesFromEmail', { type: 'String' });
    var ebEventSource = new CfnParameter(this, 'ebEventSource', { type: 'String' });
    var appConfigExtensionArn = new CfnParameter(this, 'appConfigExtensionArn', { type: 'String' });

    const DISCOUNT_CODE = paramDiscountCode.valueAsString;
    const DISCOUNT_CODE_MAX_USAGE = discountCodeMaxUsage.valueAsString;
    const ADMIN_EMAIL = adminEMail.valueAsString;
    const SES_FROM_EMAIL = sesFromEmail.valueAsString;
    const EB_EVENT_SOURCE = ebEventSource.valueAsString;
    const EB_EVENT_NAME = 'DiscountCodeConsumed';
    const APPCONFIG_EXTENSION_ARN = appConfigExtensionArn.valueAsString;

    const eventBus = new events.EventBus(this, 'CompanyEventBus', {
      eventBusName: 'CompanyEventBus'
    });

    const table = new ddb.Table(this, 'DiscountCodesTable', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'type', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      stream: ddb.StreamViewType.NEW_IMAGE,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const consumeDiscountCodeLambda = new nodejs_lambda.NodejsFunction(this, "ConsumeDiscountCodeLambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/consumeDiscountCode/index.ts`),
      handler: "handler",
      retryAttempts: 0,
      timeout: Duration.seconds(15),
      environment: {
        EVENT_BUS: eventBus.eventBusName,
        EVENT_SOURCE: EB_EVENT_SOURCE,
        EVENT_NAME: EB_EVENT_NAME,
        DISCOUNT_CODE: DISCOUNT_CODE,
      }
    });

    const consumeDiscountCodeLambdaUrl = consumeDiscountCodeLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        'allowedOrigins': ['*'],
        'allowedHeaders': ['Content-Type'],
        'allowedMethods': [HttpMethod.GET],
      },
    });

    eventBus.grantPutEventsTo(consumeDiscountCodeLambda);

    const checkDiscountCodeValidityLambda = new nodejs_lambda.NodejsFunction(this, "CheckDiscountCodeValidityLambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/checkDiscountCodeValidity/index.ts`),
      handler: "handler",
      retryAttempts: 0,
      timeout: Duration.seconds(15),
      environment: {
        APPCONFIG_APPLICATION_ID: this.appconfigApplication.ref,
        APPCONFIG_ENVIRONMENT: this.appconfigEnv.name,
        APPCONFIG_CONFIGURATION_ID: this.appconfigConfigurationProfile.ref,
        DISCOUNT_CODE: DISCOUNT_CODE,
      }
    });

    checkDiscountCodeValidityLambda.addLayers(
      lambda.LayerVersion.fromLayerVersionArn(this, 'AppConfigLayer', APPCONFIG_EXTENSION_ARN)
    );

    const checkDiscountCodeValidityLambdaUrl = checkDiscountCodeValidityLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        'allowedOrigins': ['*'],
        'allowedHeaders': ['Content-Type'],
        'allowedMethods': [HttpMethod.GET],
      },
    });

    // Setting additional permissions
    checkDiscountCodeValidityLambda.role?.attachInlinePolicy(
      new iam.Policy(this, 'additionalPermissionsForAppConfig', {
        statements: [
          new iam.PolicyStatement({
            actions: ['appconfig:StartConfigurationSession', 'appconfig:GetLatestConfiguration'],
            resources: ['*'],
          }),
        ],
      }),
    )

    const incrementCounter = new tasks.DynamoUpdateItem(this, 'IncrementDicsountCodeCounter', {
      key: { pk: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.pk')), type: tasks.DynamoAttributeValue.fromString('DiscountCode') },
      table: table,
      expressionAttributeValues: {
        ':increment': tasks.DynamoAttributeValue.fromNumber(1),
        ':initVal': tasks.DynamoAttributeValue.fromNumber(0),
      },
      updateExpression: 'SET totalUsage = if_not_exists(totalUsage, :initVal) + :increment',
      conditionExpression: 'attribute_exists(pk)',
      returnValues: tasks.DynamoReturnValues.ALL_NEW,
    });

    const sendNotificationToAdmin = new tasks.CallAwsService(this, 'SendNotificationToAdmin', {
      service: 'sesv2',
      action: 'sendEmail',
      parameters: {
        "Destination": {
          "ToAddresses": [ADMIN_EMAIL]
        },
        "FromEmailAddress": SES_FROM_EMAIL,
        "Content": {
          "Simple": {
            "Body": {
              "Html": {
                "Charset": "UTF-8",
                "Data": sfn.JsonPath.format("<h2>Discount code exceeded</h2><p>Discount Code {} exceeded the limit.</p>", sfn.JsonPath.stringAt('$.Attributes.code.S')),
              },
            },
            "Subject": {
              "Charset": "UTF-8",
              "Data": "Discount code limit exceeded"
            }
          }
        }
      },
      iamResources: ['arn:aws:ses:' + Stack.of(this).region + ':' + Stack.of(this).account + ':identity/' + SES_FROM_EMAIL],
      resultPath: '$.result',
    });

    const discoutCodeKey = "discountCode_" + DISCOUNT_CODE;
    const createHostedConfigurationVersion = new tasks.CallAwsService(this, 'CreateHostedConfigurationVersion', {
      service: 'appconfig',
      action: 'createHostedConfigurationVersion',
      parameters: {
        "ApplicationId": this.appconfigApplication.ref,
        "ConfigurationProfileId": this.appconfigConfigurationProfile.ref,
        "Content": {
          "version": "1",
          "flags": {
            discountCodeEnabled: {
              "name": sfn.JsonPath.format("Discount Code {} Flag", sfn.JsonPath.stringAt('$.Attributes.code.S'))
            }
          },
          "values": {
            discountCodeEnabled: {
              "enabled": false
            }
          }
        },
        "ContentType": "application/json"
      },
      iamResources: [
        'arn:aws:appconfig:' + Stack.of(this).region + ':' + Stack.of(this).account + ':application/' + this.appconfigApplication.ref,
        'arn:aws:appconfig:' + Stack.of(this).region + ':' + Stack.of(this).account + ':application/' + this.appconfigApplication.ref + '/configurationprofile/' + this.appconfigConfigurationProfile.ref
      ],
      resultPath: '$.result',
    });

    const startDeployment = new tasks.CallAwsService(this, 'StartDeployment', {
      service: 'appconfig',
      action: 'startDeployment',
      parameters: {
        "ApplicationId": this.appconfigApplication.ref,
        "ConfigurationProfileId": this.appconfigConfigurationProfile.ref,
        "ConfigurationVersion": sfn.JsonPath.jsonToString(sfn.JsonPath.numberAt('$.result.VersionNumber')),
        "DeploymentStrategyId": this.discountCodeDeploymentStrategy.ref,
        "EnvironmentId": this.appconfigEnv.ref,
      },
      iamResources: [
        'arn:aws:appconfig:' + Stack.of(this).region + ':' + Stack.of(this).account + ':application/' + this.appconfigApplication.ref,
        'arn:aws:appconfig:' + Stack.of(this).region + ':' + Stack.of(this).account + ':application/' + this.appconfigApplication.ref + '/configurationprofile/' + this.appconfigConfigurationProfile.ref,
        'arn:aws:appconfig:' + Stack.of(this).region + ':' + Stack.of(this).account + ':deploymentstrategy/' + this.discountCodeDeploymentStrategy.ref,
        'arn:aws:appconfig:' + Stack.of(this).region + ':' + Stack.of(this).account + ':application/' + this.appconfigApplication.ref + '/environment/' + this.appconfigEnv.ref,
      ],
      resultPath: '$.result',
    });

    createHostedConfigurationVersion.next(startDeployment).next(sendNotificationToAdmin);

    const passToEnd = new sfn.Pass(this, 'Pass');
    passToEnd.endStates;

    const checkIfDiscountCodeCountExceeds = new sfn.Choice(this, 'CheckIfDiscountCodeCountExceeds')
      .when(sfn.Condition.stringEquals('$.Attributes.totalUsage.N', DISCOUNT_CODE_MAX_USAGE), createHostedConfigurationVersion)
      .otherwise(passToEnd);

    const stateMachineDefinition = incrementCounter.next(checkIfDiscountCodeCountExceeds);

    const stateMachine = new sfn.StateMachine(this, 'ManageDicountCodeStateMachine', {
      definition: stateMachineDefinition,
      stateMachineType: sfn.StateMachineType.STANDARD,
    });

    stateMachine.role?.attachInlinePolicy(
      new iam.Policy(this, 'additionalPermissions', {
        statements: [
          new iam.PolicyStatement({
            actions: ['ses:SendEmail'],
            resources: ['arn:aws:ses:' + Stack.of(this).region + ':' + Stack.of(this).account + ':identity/' + SES_FROM_EMAIL],
          }),
        ],
      }),
    )

    const stateMachineTarget = new event_targets.SfnStateMachine(stateMachine, {
      input: RuleTargetInput.fromEventPath('$.detail'),
    });

    const rule = new events.Rule(this, 'TriggerManageDicountCodeStateMachine', {
      eventBus: eventBus,
      eventPattern: {
        source: [EB_EVENT_SOURCE],
        detailType: [EB_EVENT_NAME],
      },
      targets: [stateMachineTarget],
    });

    // Outputs
    new CfnOutput(this, 'checkDiscountCodeValidityApi', {
      value: checkDiscountCodeValidityLambdaUrl.url,
      description: 'URL to check if discount code is valid',
      exportName: 'checkDiscountCodeValidityApi',
    });

    new CfnOutput(this, 'consumeDiscountCodeApi', {
      value: consumeDiscountCodeLambdaUrl.url,
      description: 'URL to mimic the discount code usage',
      exportName: 'consumeDiscountCodeApi',
    });

    const ddbInitData = new cr.AwsCustomResource(this, 'ddbInitData', {
      onCreate: {
        service: 'DynamoDB',
        action: 'putItem',
        parameters: {
          TableName: table.tableName,
          Item: {
            pk: { S: 'DiscountCode_' + DISCOUNT_CODE },
            type: { S: 'DiscountCode' },
            code: { S: DISCOUNT_CODE },
          }
        },
        physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
  }
}
