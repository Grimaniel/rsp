const MysqlService = require('../../Infraestructure/AWS/RDS/MysqlService');

class ContactDAO {
    static async getContactById(contactId) {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql1 = `select co.*, sa.salesperson_id, sa.name, sa.email, sa.phone from CONTACT co
                        inner join STATE st on co.state = st.state_id
                        inner join SALESPERSON sa on st.id_salesperson = sa.id_salesperson
                        where co.id_contact=${contactId}`;
            getConnection.query(sql1, (err, data) => {
                if (err) return reject(err);
                resolve(data[0]);
                getConnection.end();
            });
        });
    }
}

module.exports = ContactDAO;