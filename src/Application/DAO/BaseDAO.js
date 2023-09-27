const MysqlService = require('../../Infraestructure/AWS/RDS/MysqlService');

class BaseDAO {
    static async getAll(table, filter = '') {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql = filter == '' ? `SELECT * FROM ${table}` : `SELECT * FROM ${table} WHERE ${filter}`;
            getConnection.query(sql, (err, data) => {
                if (err) return reject(err);
                resolve(data);
                getConnection.end();
            })
        })
    }

    static async get(table, filter = '') {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM ${table} WHERE ${filter}`;
            getConnection.query(sql, (err, data) => {
                if (err) return reject(err);
                resolve(data);
                getConnection.end();
            })
        })
    }

    static async insert(table, data) {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO ${table} SET ?`;
            getConnection.query(sql, data, (err, res) => {
                if (err) return reject(err);
                resolve(res);
                getConnection.end();
            })
        })
    }
    
    static async update(table, data, id) {
        const getConnection = await MysqlService.getConnection();
        return new Promise((resolve, reject) => {
            const sql = `UPDATE ${table} SET ? WHERE ${id}`;
            getConnection.query(sql, [data], (err, res) => {
                if (err) return reject(err);
                resolve(res);
                getConnection.end();
            })
        })
    }
}

module.exports = BaseDAO;