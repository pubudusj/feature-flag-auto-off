#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FeatureFlagAutoOffStack } from '../lib/feature-flag-auto-off-stack';
import { FeatureFlagInfraStack } from '../lib/feature-flag-infra-stack';

const app = new cdk.App();

const featureFlagInfra = new FeatureFlagInfraStack(app, 'FeatureFlagInfra');

new FeatureFlagAutoOffStack(app, 'FeatureFlagAutoOffStack', {
  appconfigApplication: featureFlagInfra.appconfigApplication,
  appconfigConfigurationProfile: featureFlagInfra.appconfigConfigurationProfile,
  appconfigEnv: featureFlagInfra.appconfigEnv,
  discountCodeDeploymentStrategy: featureFlagInfra.discountCodeDeploymentStrategy,
});
