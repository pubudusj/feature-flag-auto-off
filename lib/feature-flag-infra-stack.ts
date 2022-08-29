import {
  Stack,
  StackProps,
  aws_appconfig as appconfig,
  CfnParameter
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class FeatureFlagInfraStack extends Stack {
  public readonly appconfigApplication: appconfig.CfnApplication;
  public readonly appconfigConfigurationProfile: appconfig.CfnConfigurationProfile;
  public readonly appconfigEnv: appconfig.CfnEnvironment;
  public readonly discountCodeDeploymentStrategy: appconfig.CfnDeploymentStrategy;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    var paramDiscountCode = new CfnParameter(this, 'discountCode', { type: 'String' });

    this.appconfigApplication = new appconfig.CfnApplication(this, 'DiscountCodeAppConfigApp', {
      name: 'DiscountCodeApp',
    });

    this.appconfigConfigurationProfile = new appconfig.CfnConfigurationProfile(this, 'DiscountCodeConfigurationProfile', {
      applicationId: this.appconfigApplication.ref,
      locationUri: 'hosted',
      name: 'DiscountCodeConfigurationProfile',
      type: 'AWS.AppConfig.FeatureFlags',
    });

    const cfnHostedConfigurationVersion = new appconfig.CfnHostedConfigurationVersion(this, 'MyCfnHostedConfigurationVersion', {
      applicationId: this.appconfigApplication.ref,
      configurationProfileId: this.appconfigConfigurationProfile.ref,
      contentType: 'application/json',
      content: JSON.stringify({
        "version": "1",
        "flags": {
          discountCodeEnabled: {
            "name": "Discount Code " + paramDiscountCode.valueAsString + " Flag",
          }
        },
        "values": {
          discountCodeEnabled: {
            "enabled": true,
          }
        }
      }),
    });

    this.appconfigEnv = new appconfig.CfnEnvironment(this, 'DiscountCodeEnvironment', {
      applicationId: this.appconfigApplication.ref,
      name: 'dev',
    });

    this.discountCodeDeploymentStrategy = new appconfig.CfnDeploymentStrategy(this, 'DiscountCodeDeploymentStrategy', {
      deploymentDurationInMinutes: 0,
      growthFactor: 100,
      name: 'discountCodeDeploymentStrategy',
      replicateTo: 'SSM_DOCUMENT',
      finalBakeTimeInMinutes: 0,
    });

    const deployment = new appconfig.CfnDeployment(this, 'InitialDeployment', {
      applicationId: this.appconfigApplication.ref,
      configurationProfileId: this.appconfigConfigurationProfile.ref,
      configurationVersion: cfnHostedConfigurationVersion.ref,
      deploymentStrategyId: this.discountCodeDeploymentStrategy.ref,
      environmentId: this.appconfigEnv.ref,
    });
  }
}
