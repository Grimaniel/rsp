const SalesOrderController = require('../Controller/SalesOrderController');
const util = require('./Util/Response');

const getSalesOrder = async (event) => {
    try {
        const orderNbr = event.pathParameters.ordernbr;
        const res = await SalesOrderController.getSalesOrder(orderNbr);
        return util.response(200,'get','Information extracted successfully',res,'');
    } catch (error) {
        console.error('Error general: ', error);
        return util.response(500,'get','Information not extracted','',error.stack);
    }
};

const getSalesOrders = async (event) => {
    try {
        const { queryStringParameters: query } = event;
        if(!query || (!query.customerid && !query.salespersonid))
            return util.response(400,'get','Bad request','','Enter customerid or salespersonid');
        const res = await SalesOrderController.getSalesOrders(query);
        return util.response(200,'get','Information extracted successfully',res,'');
    } catch (error) {
        console.error('Error general: ', error);
        return util.response(500,'get','Information not extracted','',error.stack);
    }
};

const createSalesOrder = async (event) => {
    try {
        const res = await SalesOrderController.createSalesOrder(event);
        return util.response(res.statusCode,'post',res.message,res.data,res.error);
    } catch (error) {
        console.error('Error general: ', error);
        return util.response(500,'post','Failed to create sales order','',error.stack);
    }
};

const getSalesOrdersGroupedCustomer = async (event) => {
    try {
        const { queryStringParameters: query } = event;
        if(!query || (!query.salespersonid || !query.segment))
            return util.response(400,'get','Bad request','','Enter salespersonid and segment');
        const res = await SalesOrderController.getSalesOrdersGroupedCustomer(query);
        return util.response(200,'get','Information extracted successfully',res,'');
    } catch (error) {
        console.error('Error general: ', error);
        return util.response(500,'get','Information not extracted','',error.stack);
    }
};

module.exports = {
    getSalesOrder,
    getSalesOrders,
    createSalesOrder,
    getSalesOrdersGroupedCustomer,
}