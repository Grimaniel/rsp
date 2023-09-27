const MysqlService = require('../../Infraestructure/AWS/RDS/MysqlService');

class SalesOrderDAO {
    static async getSumSalesOrderHoldUp(customerId) {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql = `SELECT customer_id, sum(sales_order_total) as sum_sales_order_hold_up
            FROM REWARDS_SALES_ORDER_ACUMATICA
            WHERE customer_id='${customerId}' and status='On Temporary Hold'
            group by customer_id;`;
            getConnection.query(sql, (err, data) => {
                if (err) return reject(err);
                resolve(data[0]);
                getConnection.end();
            });
        });
    }

    static async getTotalSalesOrdersOnTemporaryHold(customerId) {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql = `SELECT COUNT(id_sales_order) as number, IFNULL(SUM(sales_order_total), 0.00) as total
                        FROM REWARDS_SALES_ORDER_ACUMATICA
                        WHERE customer_id='${customerId}' AND status='On Temporary Hold'`;
            getConnection.query(sql, (err, data) => {
                if (err) return reject(err);
                resolve(data[0]);
                getConnection.end();
            });
        });
    }

    static async validateSaleOrderHoldUpInventory(saleOrderNbr) {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM REWARDS_SALES_ORDER_ACUMATICA WHERE sales_order_nbr='${saleOrderNbr}' AND status='On Temporary Hold' AND NOW() < expiration_date`;
            getConnection.query(sql, (err, data) => {
                if (err) return reject(err);
                resolve(data[0]);
                getConnection.end();
            });
        });
    }

    static async getPhoneByCustomerId(customerId) {
        const getConnection = await MysqlService.getConnection();
        /* console.log(getConnection) */
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT ba.phone_number
                FROM RSP_REWARDS_CLIENT rc
                INNER JOIN BUSINESS_APPLICATION ba ON ba.id_business_app = rc.id_business_app
                WHERE rc.id_customer='${customerId}'
            `;
            getConnection.query(sql, (err, data) => {
                if (err) return reject(err);
                resolve(data[0]);
                getConnection.end();
            });
        });
    }

    static async releaseSalesOrderOnTemporaryHold(status, saleOrderNbr) {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql = `UPDATE REWARDS_SALES_ORDER_ACUMATICA SET status='${status}' WHERE sales_order_nbr='${saleOrderNbr}'`;
            getConnection.query(sql, (err, data) => {
                if (err) return reject(err);
                resolve(data);
                getConnection.end();
            });
        });
    }

    static async getSumSalesOrderHoldUp(customerId) {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql = `SELECT customer_id, sum(sales_order_total) as sum_sales_order_hold_up
            FROM REWARDS_SALES_ORDER_ACUMATICA
            WHERE customer_id='${customerId}' and status='On Temporary Hold'
            group by customer_id;`;
            getConnection.query(sql, (err, data) => {
                if (err) return reject(err);
                resolve(data[0]);
                getConnection.end();
            });
        });
    }

    static async getExpiredSalesOrders() {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql1 = `select * from REWARDS_SALES_ORDER_ACUMATICA where NOW() > expiration_date and status='On Temporary Hold'`;
            getConnection.query(sql1, (err, data) => {
                if (err) return reject(err);
                resolve(data);
                getConnection.end();
            });
        });
    }

    static async getSalesOrdersOnTemporaryHold() {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql1 = `SELECT so.id_sales_order, so.sales_order_nbr, so.customer_id, so.customer_mail, ns.id_notification_sales_order, ns.time_left
            FROM REWARDS_NOTIFICATION_SALES_ORDER_ACUMATICA ns
            INNER JOIN REWARDS_SALES_ORDER_ACUMATICA so ON ns.id_sales_order = so.id_sales_order
            WHERE SEC_TO_TIME(TIMESTAMPDIFF(SECOND, now(), ns.expiration_date)) <= ns.time_left AND ns.status=1;`;
            getConnection.query(sql1, (err, data) => {
                if (err) return reject(err);
                resolve(data);
                getConnection.end();
            });
        });
    }
}

module.exports = SalesOrderDAO;