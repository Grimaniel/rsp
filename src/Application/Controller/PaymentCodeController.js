const PaymentCodeService = require('../Services/PaymentCodeService');

class PaymentCodeController {
   
    static async createPaymentCode(event) {
        try {
            
            return await PaymentCodeService.createPaymentCode(event);
        } catch (error) {
            
            throw error;
        }
    }

    static async declinedPaymentCode(event) {
        try {
            
            return await PaymentCodeService.declinedPaymentCode(event);
        } catch (error) {
            
            throw error;
        }
    }
  
}

module.exports = PaymentCodeController;