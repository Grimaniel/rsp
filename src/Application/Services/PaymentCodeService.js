const crypto=require('crypto');
const AcumaticaService = require('../../Infraestructure/Http/AcumaticaService');
const S3Service = require('../../Infraestructure/AWS/S3/S3Service');
const BaseDAO = require('../DAO/BaseDAO');
const MultipartParser = require('./Util/MultipartParser');
const Validations = require('./Util/Validations');

class PaymentCodeService {
    
    static async createPaymentCode(event){
        try {
            //console.log("valor event :", event);
            //queryStringParameters;
            const body = await MultipartParser.transformEvent(event);
            const { customerID, paymentType, totalAmount } = body;
            const paymentCode = crypto.randomBytes(6).toString('hex');
            console.log("los valores son: ", customerID," - ", paymentCode," - ", paymentType," - ",totalAmount);
            //let totalAmount = body.totalAmount;

            const payment_data = { customer_id: customerID, payment_code: paymentCode, payment_type: paymentType,total_amount: totalAmount };
            const createPayment = await BaseDAO.insert(process.env.RSP_PAYMENT, payment_data);
            createPayment.paymentCode = paymentCode;
            return { statusCode: 200, message: 'Payment Code created successfully', error: '', data: createPayment } 

        } catch (error) {
            console.error(`Error en ${this.name}.createPaymentCode`, error);
            throw error;
        }
    }

    static async declinedPaymentCode(event){
        try {
            //console.log("valor event :", event);
            //queryStringParameters;
            const body = await MultipartParser.transformEvent(event);
            const { paymentId, paymentCode } = body;
            //const paymentCode = crypto.randomBytes(6).toString('hex');
            //console.log("los valores son: ", customerID," - ", paymentCode," - ", paymentType," - ",totalAmount);
            //let totalAmount = body.totalAmount;

            //const payment_data = { status: 0 };
            const declinedPayment = await BaseDAO.update(process.env.RSP_PAYMENT, { status: 0 } , `id_payments=${paymentId} and payment_code='${paymentCode}'`);

            //createPayment.paymentCode = paymentCode;
            return { statusCode: 200, message: 'Declined payment successfully', error: '', data: declinedPayment } 

        } catch (error) {
            console.error(`Error en ${this.name}.declinedPaymentCode`, error);
            throw error;
        }
    }

}

module.exports = PaymentCodeService;