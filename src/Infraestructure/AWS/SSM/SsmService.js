const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
const ssm = new AWS.SSM();

class SsmService {
    static async getParameters() {
        const getParameter = await ssm.getParameter({
            Name: process.env.SSM_NAME_DATABASE_CREDENTIALS,
            WithDecryption: true
        }).promise();
        const getParameterParse = JSON.parse(getParameter.Parameter.Value);
        return getParameterParse;
    }
}

module.exports = SsmService;