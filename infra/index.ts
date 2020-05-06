import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const config = new pulumi.Config();

const dbPassword = config.require("dbPassword");

// Allocate a new VPC with the default settings:
const vpc = new awsx.ec2.Vpc("custom");

// Create RDS database
const rdsSecurityGroup = new aws.ec2.SecurityGroup(`dbsecgrp`, {
  vpcId: vpc.id,
  ingress: [
    {
      protocol: "tcp",
      fromPort: 1433,
      toPort: 1433,
      cidrBlocks: [vpc.vpc.cidrBlock],
    },
  ],
});

const dbSubnets = new aws.rds.SubnetGroup("dbsubnets", {
  subnetIds: vpc.privateSubnetIds,
});

const rds = new aws.rds.Instance(`database-dev`, {
  engine: "sqlserver-ex",
  username: "admin",
  password: dbPassword,
  instanceClass: "db.t2.micro",
  allocatedStorage: 20,
  skipFinalSnapshot: true,
  publiclyAccessible: false,
  // For a VPC cluster, you will also need the following:
  dbSubnetGroupName: dbSubnets.id,
  vpcSecurityGroupIds: [rdsSecurityGroup.id],
});


const instanceProfileRole = new aws.iam.Role("eb-ec2-role", {
  name: "eb-ec2-role",
  description: "Role for EC2 managed by EB",
  assumeRolePolicy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": "sts:AssumeRole",
                "Principal": {
                    "Service": "ec2.amazonaws.com"
                },
                "Effect": "Allow",
                "Sid": ""
            }
        ]
    }`,
});


const ebAppDeployBucket = new aws.s3.Bucket("eb-app-deploy", {});

const ebAppDeployObject = new aws.s3.BucketObject("default", {
  bucket: ebAppDeployBucket.id,
  key: "deployment.zip",
  source: new pulumi.asset.FileAsset("../deployment.zip"),
});

const instanceProfile = new aws.iam.InstanceProfile("eb-ec2-instance-profile", {
  role: instanceProfileRole.name,
});

// CREATE BEANSTALK APPLICATION
const app = new aws.elasticbeanstalk.Application(`webapp`, {
  name: `webapp`,
});

const defaultApplicationVersion = new aws.elasticbeanstalk.ApplicationVersion(
  "default",
  {
    application: app,
    bucket: ebAppDeployBucket.id,
    description: "Version 0.1",
    key: ebAppDeployObject.id,
  }
);

// SQL CONNECTION STRING
export const connectionString = pulumi
  .all([rds.address, rds.port])
  .apply(
    ([serverName, port]) =>
      `Server=${serverName},${port};uid=admin;pwd=${dbPassword};`
  );

const tfenvtest = new aws.elasticbeanstalk.Environment("webapp-env", {
  application: app,
  version: defaultApplicationVersion,
  solutionStackName: "64bit Amazon Linux 2018.03 v4.13.1 running Node.js",
  settings: [
    {
      name: "VPCId",
      namespace: "aws:ec2:vpc",
      value: vpc.id,
    },
    {
      name: "Subnets",
      namespace: "aws:ec2:vpc",
      value: vpc.publicSubnetIds[0],
    },
    {
      name: "IamInstanceProfile",
      namespace: "aws:autoscaling:launchconfiguration",
      value: instanceProfile.name,
    },
    {
      name: `CONNECTION_STRING`,
      namespace: "aws:elasticbeanstalk:application:environment",
      value: connectionString,
    },
    {
      name: "SecurityGroups",
      namespace: "aws:autoscaling:launchconfiguration",
      value: rdsSecurityGroup.id,
    },
  ]
});

export const endpointUrl = tfenvtest.endpointUrl;