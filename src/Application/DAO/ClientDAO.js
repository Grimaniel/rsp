const MysqlService = require('../../Infraestructure/AWS/RDS/MysqlService');

class ClientDAO {
    static async getRemainingCreditLimitForSalesOrderHoldUp(customerId) {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql1 = `SELECT cl.id_customer, IFNULL(cl.credit_line - SUM(so.sales_order_total), cl.credit_line) AS remaining_credit_limit
            FROM RSP_REWARDS_CLIENT cl
            LEFT JOIN REWARDS_SALES_ORDER_ACUMATICA so ON cl.id_customer = so.customer_id AND so.status='On Temporary Hold'
            WHERE cl.id_customer='${customerId}'
            GROUP BY cl.id_customer;`;
            getConnection.query(sql1, (err, data) => {
                if (err) return reject(err);
                resolve(data[0]);
                getConnection.end();
            });
        });
    }
}

module.exports = ClientDAO;