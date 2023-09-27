const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
const mysql = require('mysql');
const SsmService = require('../SSM/SsmService');

class MysqlService {
    static async getConnection() {
        const ssmService = await SsmService.getParameters();
        const dbConfig = {
            host: ssmService.host,
            port: ssmService.port,
            user: ssmService.user,
            password: ssmService.password,
            database: ssmService.database,
            dateStrings: true,
        };
        const connection = mysql.createConnection(dbConfig);
        connection.connect((err) => {
            if (err) {
                throw err;
            } else {
                console.log("conectado a mysql!");
            }
        });
        return connection;
    }
}

module.exports = MysqlService;