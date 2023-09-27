const PaymentCodeController = require('../Controller/PaymentCodeController');
const util = require('./Util/Response');

/*
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
*/
const createPaymentCode = async (event) => {
    try {
        //console.log("handler 1: ", event);
        const res = await PaymentCodeController.createPaymentCode(event);
        //console.log("handler 2: ", res);
        return util.response(res.statusCode,'post',res.message,res.data,res.error);
    } catch (error) {
        console.error('Error general: ', error);
        return util.response(500,'post','Failed to create payment code','',error.stack);
    }
};
const declinedPaymentCode = async (event) => {
    try {
        //console.log("handler 1: ", event);
        const res = await PaymentCodeController.declinedPaymentCode(event);
        //console.log("handler 2: ", res);
        return util.response(res.statusCode,'post',res.message,res.data,res.error);
    } catch (error) {
        console.error('Error general: ', error);
        return util.response(500,'post','Failed to create payment code','',error.stack);
    }
};

module.exports = {
    //getSalesOrder,
    createPaymentCode,
    declinedPaymentCode,
}