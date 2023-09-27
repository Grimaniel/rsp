const SalesOrderService = require('../Services/SalesOrderService');

class SalesOrderController {
    static async getSalesOrder(orderNbr) {
        try {
            return await SalesOrderService.getSalesOrder(orderNbr);
        } catch (error) {
            console.error(`Error en ${this.name}.getSalesOrder`, error);
            throw error;
        }
    }

    static async getSalesOrders(query) {
        try {
            return await SalesOrderService.getSalesOrders(query);
        } catch (error) {
            console.error(`Error en ${this.name}.getSalesOrders`, error);
            throw error;
        }
    }

    static async createSalesOrder(event) {
        try {
            return await SalesOrderService.createSalesOrder(event);
        } catch (error) {
            console.error(`Error en ${this.name}.createSalesOrder`, error);
            throw error;
        }
    }

    static async getSalesOrdersGroupedCustomer(query) {
        try {
            return await SalesOrderService.getSalesOrdersGroupedCustomer(query);
        } catch (error) {
            console.error(`Error en ${this.name}.getSalesOrdersGroupedCustomer`, error);
            throw error;
        }
    }
}

module.exports = SalesOrderController;