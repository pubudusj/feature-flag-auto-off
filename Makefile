# Discount code to track usage and feature flag.
DISCOUNT_CODE='XYZ100'
# No of times discout code can be used before feature flags set to off.
DISCOUNT_CODE_MAX_USAGE_COUNT = 3
# Admin's email address to receive notification when discount code usage reached to max limit
ADMIN_EMAIL = ''
# SES from email address to send email to admin
SES_FROM_EMAIL = ''
# EventBridge event source
EVENT_SOURCE = 'XYZCo'
# AWS CLI profile.
profile='default'
# AWS Region to deploy the stack
region='eu-central-1'

APPCONFIG_EXTENSION_ARN=$(shell grep ${region} .appconfig_extension_arns | cut -d '=' -f2)

help:
	@echo "make build: Install required dependencies"
	@echo "make deploy: Deploy the Feature Flag Auto Off stack"
	@echo "make destroy: Remove the Feature Flag Auto Off stack"

build:
	npm install
	cd ./src/checkDiscountCodeValidity && npm install

deploy:
	cdk deploy FeatureFlagInfra FeatureFlagAutoOffStack --profile=${profile} --parameters FeatureFlagInfra:discountCode=${DISCOUNT_CODE} --parameters FeatureFlagAutoOffStack:discountCode=${DISCOUNT_CODE} --parameters FeatureFlagAutoOffStack:discountCodeMaxUsage=${DISCOUNT_CODE_MAX_USAGE_COUNT} --parameters FeatureFlagAutoOffStack:adminEmail=${ADMIN_EMAIL} --parameters FeatureFlagAutoOffStack:sesFromEmail=${SES_FROM_EMAIL} --parameters FeatureFlagAutoOffStack:ebEventSource=${EVENT_SOURCE} --parameters FeatureFlagAutoOffStack:appConfigExtensionArn=${APPCONFIG_EXTENSION_ARN}
destroy:
	cdk destroy FeatureFlagInfra FeatureFlagAutoOffStack --profile=${profile} --parameters FeatureFlagInfra:discountCode=${DISCOUNT_CODE} --parameters FeatureFlagAutoOffStack:discountCode=${DISCOUNT_CODE} --parameters FeatureFlagAutoOffStack:discountCodeMaxUsage=${DISCOUNT_CODE_MAX_USAGE_COUNT} --parameters FeatureFlagAutoOffStack:adminEmail=${ADMIN_EMAIL} --parameters FeatureFlagAutoOffStack:sesFromEmail=${SES_FROM_EMAIL} --parameters FeatureFlagAutoOffStack:ebEventSource=${EVENT_SOURCE} --parameters FeatureFlagAutoOffStack:appConfigExtensionArn=${APPCONFIG_EXTENSION_ARN}
