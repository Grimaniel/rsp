const DashboardService = require('../Services/DashboardService');

class DashboardController {
    static async getCustomerDashboardSummary(query) {
        try {
            return await DashboardService.getCustomerDashboardSummary(query);
        } catch (error) {
            console.error(`Error en ${this.name}.getCustomerDashboardSummary`, error);
            throw error;
        }
    }

    static async getSalesPersonDashboardSummary(query) {
        try {
            return await DashboardService.getSalesPersonDashboardSummary(query);
        } catch (error) {
            console.error(`Error en ${this.name}.getSalesPersonDashboardSummary`, error);
            throw error;
        }
    }
}

module.exports = DashboardController;