import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const config = new pulumi.Config();

//const prefix = "mip";
const projectName ="sampleSecureRDS"
const stackName = pulumi.getStack();
const dbPassword = config.require("dbPassword");
const dbInstanceType = config.require("dbInstanceType");


// Allocate a new VPC with the default settings:
const vpc = new awsx.ec2.Vpc("custom");

// Export a few resulting fields to make them easy to use:
export const vpcId = vpc.id;
export const vpcPrivateSubnetIds = vpc.privateSubnetIds;
export const vpcPublicSubnetIds = vpc.publicSubnetIds;

const dbSubnets = new aws.rds.SubnetGroup("dbsubnets", {
    subnetIds: vpc.publicSubnetIds,
});

const publicCiders = vpcPublicSubnetIds.map(subnetId => 
    subnetId.apply(subnet => {
        return aws.ec2.getSubnet( {id:subnet}).cidrBlock;
    })
);

const rdsSecurityGroup = new aws.ec2.SecurityGroup(`${projectName}-${stackName}-dbsecgrp`, {
    ingress: [
        { protocol: "tcp", fromPort: 1433, toPort: 1433, cidrBlocks: publicCiders },
    ],
});

const webSecurityGroup = new aws.ec2.SecurityGroup(`${projectName}-${stackName}-websecgrp`, {
    ingress: [
        { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"]  },
    ],
});

const rds = new aws.rds.Instance(`${projectName}_${stackName}`, {
    identifier: `${projectName.toLowerCase()}${stackName.toLowerCase()}`,
    engine: "sqlserver-web",
    username: "admin",
    password: dbPassword,
    instanceClass: dbInstanceType,
    allocatedStorage: 20,
    skipFinalSnapshot: true,
    publiclyAccessible: true,

    // For a VPC cluster, you will also need the following:
    dbSubnetGroupName: dbSubnets.id,
    vpcSecurityGroupIds: [rdsSecurityGroup.id],
});



// Create Beanstalk application
const serviceRole = new aws.iam.Role(
    'elasticbeanstalk-service-role',
    {
        name: `${projectName}-elasticbeanstalk-service-role`,
        description: "Role assumed by Elastic Beanstalk when communicating with other AWS resources",
        assumeRolePolicy: pulumi.interpolate`{
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "sts:AssumeRole",
                    "Condition": {
                        "StringEquals": {
                            "sts:ExternalId": "elasticbeanstalk"
                        }
                    },
                    "Principal": {
                        "Service": "elasticbeanstalk.amazonaws.com"
                    },
                    "Effect": "Allow",
                    "Sid": ""
                }            
            ]
        }`
    }
);



const serviceRolePolicy = new aws.iam.RolePolicy('elasticbeanstalk-service-role-policy', {
    role: serviceRole,
    policy : pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [
            {        
                "Effect": "Allow",
                "Action": [
                    "logs:DescribeLogStreams",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                "Resource": ["arn:aws:logs:*:*:log-group:/aws/elasticbeanstalk/*:log-stream:*"]
            }
        ]
    }`
});
