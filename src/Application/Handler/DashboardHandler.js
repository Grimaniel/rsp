const DashboardController = require('../Controller/DashboardController');
const util = require('./Util/Response');

const getCustomerDashboardSummary = async (event) => {
    try {
        const { queryStringParameters: query } = event;
        if (!query || !query.customerid)
            return util.response(400, 'get', 'Bad request', '', 'Enter customerid');
        const res = await DashboardController.getCustomerDashboardSummary(query);
        return util.response(200, 'get', 'Information extracted successfully', res, '');
    } catch (error) {
        console.error('Error general: ', error);
        return util.response(500, 'get', 'Information not extracted', '', error.stack);
    }
};

const getSalesPersonDashboardSummary = async (event) => {
    try {
        const { queryStringParameters: query } = event;
        if (!query || !query.salespersonid)
            return util.response(400, 'get', 'Bad request', '', 'Enter salespersonid');
        const res = await DashboardController.getSalesPersonDashboardSummary(query);
        return util.response(200, 'get', 'Information extracted successfully', res, '');
    } catch (error) {
        console.error('Error general: ', error);
        return util.response(500, 'get', 'Information not extracted', '', error.stack);
    }
};

module.exports = {
    getCustomerDashboardSummary,
    getSalesPersonDashboardSummary,
}