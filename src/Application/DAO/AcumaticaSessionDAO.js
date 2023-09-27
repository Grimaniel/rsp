const MysqlService = require('../../Infraestructure/AWS/RDS/MysqlService');

class AcumaticaSessionDAO {
    static async getAcumaticaLastSession() {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql1 = `SELECT * FROM ACUMATICA_SESSION WHERE NOW() < expiration_date AND status=1 ORDER BY id_acumatica_session DESC LIMIT 1;`;
            getConnection.query(sql1, (err, data) => {
                if (err) return reject(err);
                resolve(data[0]);
                getConnection.end();
            });
        });
    }
}

module.exports = AcumaticaSessionDAO;