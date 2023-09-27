const MysqlService = require('../../Infraestructure/AWS/RDS/MysqlService');

class BusinessApplicationDAO {
    static async getBusinessAppById(businessAppId) {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql1 = `select ba.*, oc.* from BUSINESS_APPLICATION ba
                        left join OTP_CODE oc on ba.id_otp_code = oc.id_otp_code
                        where id_business_app=${businessAppId}`;
            getConnection.query(sql1, (err, data) => {
                if (err) return reject(err);
                resolve(data[0]);
                getConnection.end();
            });
        });
    }
}

module.exports = BusinessApplicationDAO;