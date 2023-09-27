const MysqlService = require('../../Infraestructure/AWS/RDS/MysqlService');

class StateDAO {
    static async getStateByStateId(stateid) {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql1 = `select ST.id_state,ST.id_salesperson,ST.state_id,ST.state_name, SA.salesperson_id, SA.name, SA.email, SA.phone from STATE as ST
            left join SALESPERSON as SA on ST.id_salesperson = SA.id_salesperson
               where ST.state_id='${stateid}'`;
            getConnection.query(sql1, (err, data) => {
                if (err) return reject(err);
                resolve(data[0]);
                getConnection.end();
            });
        });
    }
}

module.exports = StateDAO;