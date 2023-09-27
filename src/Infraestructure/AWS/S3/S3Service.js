const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
const s3 = new AWS.S3();

class S3Service {
    static async sendS3(bucket, key, body, contentType) {
        try {
            const paramsS3 = {
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
                ACL: 'public-read'
            };
            return await s3.upload(paramsS3).promise();
        } catch (error) {
            console.log(`Error en ${this.name}.sendS3`);
            throw error;
        }
    }
}

module.exports = S3Service;