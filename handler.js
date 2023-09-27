'use strict';
// Requires
const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment');
const multipartParser = require('lambda-multipart-parser');
const { sendMailPaymentCompleted } = require('./src/functions/mailings');
const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
const Util = require('./src/Application/Util/Util'); 

// Functions
const AcumaticaService = require('./src/Infraestructure/Http/AcumaticaService');
const acumatica = require('./src/functions/acumatica.js');
const rsp = require('./src/functions/rsp');
const cognito = require('./src/functions/cognito');
const BaseDAO = require('./src/Application/DAO/BaseDAO');
const SalesOrderDAO = require('./src/Application/DAO/SalesOrderDAO');
const StateDAO = require('./src/Application/DAO/StateDAO');
const mailings = require('./src/functions/mailings');

// Dynamo
const { ScanCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const dynamo = require('./src/db/dynamo');

// Services
const sns = new AWS.SNS(); // service SNS
const s3 = new AWS.S3(); // service S3

// Headers
const _headers_get = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
  "Content-Type": "application/json"
};

const _headers_post = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Content-Type": "application/json"
};

const createPayment = async (event) => {
  const response = { statusCode: 200, headers: _headers_post };
  try {
    const date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    const body = await multipartParser.parse(event);
    const documentsToApply = JSON.parse(body.DocumentsToApply);
    const file = body.files[0] || '';
    const errors = [];

    if (!body.PaymentAmount) {
      errors.push({ PaymentAmount: "PaymentAmount is empty" });
    }
    if (!body.PaymentRef) {
      errors.push({ PaymentRef: "PaymentRef is empty" });
    }
    if (!body.CustomerID) {
      errors.push({ CustomerID: "CustomerID is empty" });
    }
    if (!body.PaymentMethod) {
      errors.push({ PaymentMethod: "PaymentMethod is empty" });
    }
    else {
      if (body.PaymentMethod == "CHECK") {
        if (file == '') {
          errors.push({ file: "Need to upload a file" });
        }
      }
      else if (body.PaymentMethod == "CREDITCARD" || body.PaymentMethod == "WIRETRANSFER") {
        console.log("body.PaymentMethod", "CREDITCARD OR WIRETRANSFER");
      }
      else {
        errors.push({ PaymentMethod: "Wrong payment method" });
      }
    }

    if (!Object.keys(documentsToApply).length) {
      errors.push({ documentsToApply: "DocumentsToApply is empty" });
    }
    else {
      documentsToApply.forEach(function (item, index) {
        if (!item.DocType) {
          errors.push({ DetailsContent: "DocType is empty in position " + index });
        }
        if (!item.ReferenceNbr) {
          errors.push({ DetailsContent: "ReferenceNbr is empty in position " + index });
        }
        if (!item.AmountPaid) {
          errors.push({ DetailsContent: "AmountPaid is empty in position " + index });
        }
      });
    }

    if (Object.keys(errors).length) {
      response.statusCode = 400;
      response.body = JSON.stringify({
        data: "",
        message: "Failed to create order.",
        errors: errors,
      });
    } else {

      var body_format = {
        PaymentAmount: { value: body.PaymentAmount },
        PaymentRef: { value: body.PaymentRef },
        CustomerID: { value: body.CustomerID },
        Type: { value: "Payment" },
        DocumentsToApply: documentsToApply
      };

      if (body.PaymentMethod == "CHECK") {
        body_format.CashAccount = { "value": "10100" };
        body_format.PaymentMethod = { "value": body.PaymentMethod };
        body_format.Hold = { "value": true };
      }
      else if (body.PaymentMethod == "CREDITCARD") {
        body_format.CashAccount = { "value": "10450" };
        body_format.PaymentMethod = { "value": "CC" };
        body_format.Hold = { "value": false };
      }
      else if (body.PaymentMethod == "WIRETRANSFER") {
        delete body_format.PaymentAmount
        let amount = Number(body.PaymentAmount) / 100
        body_format.PaymentAmount = { "value": amount.toString() },
        body_format.CashAccount = { "value": "10100" };
        body_format.PaymentMethod = { "value": "WT" };
        body_format.Hold = { "value": true };
      }

      const createPaymentAcumaticaResult = await acumatica.createPayment(body_format);

      if (createPaymentAcumaticaResult.status == 200) {

        if (file != '') {
          await acumatica.addFileToPayment(createPaymentAcumaticaResult.data.Type.value, createPaymentAcumaticaResult.data.ReferenceNbr.value, createPaymentAcumaticaResult.data.PaymentRef.value, file);
        }

        const docType = createPaymentAcumaticaResult.data.Type.value
        const referenceNbr = createPaymentAcumaticaResult.data.ReferenceNbr.value

        await paymentRelases(docType, referenceNbr);

        response.body = JSON.stringify({
          //message: "Payment created successfully",
          data: createPaymentAcumaticaResult.data,
          errors: ""
        });
      }else{
        response.body = JSON.stringify({
          errors: "createPayment error"
        });
      }
    }
  } catch (e) {
    response.statusCode = 500;
    response.body = JSON.stringify({
      //message: "Failed to create order.",
      data: "",
      errors: e.message,
      errorStack: e.stack,
    });
  }
  return response;
}

async function createSalesOrderBalance(event){
  const response = { statusCode: 200, headers: _headers_post };
  try{
      const body = await multipartParser.parse(event);
      const documentsToApply = JSON.parse(body.DocumentsToApply);
      console.log("doccumets apply: ", documentsToApply)
      const file = body.files[0] || '';
      const errors = [];
      console.log("files: ", body.files)
      console.log(file)
      if (!body.PaymentAmount) {
      errors.push({ PaymentAmount: "PaymentAmount is empty" });
      }
      if (!body.PaymentRef) {
      errors.push({ PaymentRef: "PaymentRef is empty" });
      }
      if (!body.CustomerID) {
      errors.push({ CustomerID: "CustomerID is empty" });
      }
      if (!body.PaymentMethod) {
      errors.push({ PaymentMethod: "PaymentMethod is empty" });
      }
      else {
        if (body.PaymentMethod == "CHECK") {
            if (file == '') {
            errors.push({ file: "Need to upload a file" });
            }
        }
        else if (body.PaymentMethod == "CREDITCARD" || body.PaymentMethod == "WIRETRANSFER") {
            console.log("body.PaymentMethod", "CREDITCARD OR WIRETRANSFER");
        }
        else {
            errors.push({ PaymentMethod: "Wrong payment method" });
        }
      }

      if (!Object.keys(documentsToApply).length) {
        errors.push({ documentsToApply: "DocumentsToApply is empty" });
      }
      else {
        documentsToApply.forEach(function (item, index) {
          if (!item.OrderNbr) {
            errors.push({ DetailsContent: "OrderNbr is empty in position " + index });
          }
          if (!item.AmountPaid) {
            errors.push({ DetailsContent: "AmountPaid is empty in position " + index });
          }
        });
      }

      if (Object.keys(errors).length) {

        response.statusCode = 400;
        response.body = JSON.stringify({
            data: "",
            message: "Failed to create order.",
            errors: errors,
        });

      } else {

        let documentsToApplyPayment = []

        if(body.PaymentMethod == "CREDITCARD" || body.PaymentMethod == "WIRETRANSFER"){
          let newIvoice = await createInvoice(body.PaymentAmount, body.CustomerID, body.PaymentRef, body.PaymentMethod);
          documentsToApplyPayment = [{
            DocType: {value: newIvoice.TypeDocIn},
            ReferenceNbr:{value: newIvoice.ReferenceNbrIn}
          }]
        }

        const amountWithFeeCreditCard = parseFloat(body.PaymentAmount) + parseFloat(body.PaymentAmount*0.03)
        const amountWithFeeWireTransfer = parseFloat(body.PaymentAmount) + parseFloat(body.PaymentAmount*0.03)
        
        var body_format = {
            PaymentRef: { value: body.PaymentRef },
            CustomerID: { value: body.CustomerID },
            Type: { value: "Payment" },
            DocumentsToApply: documentsToApplyPayment
        };

        if (body.PaymentMethod == "CHECK") {
            body_format.PaymentAmount = { value: body.PaymentAmount },
            body_format.CashAccount = { "value": "10100" };
            body_format.PaymentMethod = { "value": body.PaymentMethod };
            body_format.Hold = { "value": true };
            delete body_format.DocumentsToApply
        }
        else if (body.PaymentMethod == "CREDITCARD") {
            body_format.PaymentAmount = { value: await Util.dosDecimales(amountWithFeeCreditCard) },
            body_format.CashAccount = { "value": "10450" };
            body_format.PaymentMethod = { "value": "CC" };
            body_format.Hold = { "value": false };
        }
        else if (body.PaymentMethod == "WIRETRANSFER") {
            body_format.PaymentAmount = { value: await Util.dosDecimales(amountWithFeeWireTransfer) },
            body_format.CashAccount = { "value": "10100" };
            body_format.PaymentMethod = { "value": "WT" };
        }

        const createPaymentAcumaticaResult = await acumatica.createPayment(body_format);

        if (createPaymentAcumaticaResult.status == 200) {
          
            const orderNbr = documentsToApply[0].OrderNbr.value;
            const docType = createPaymentAcumaticaResult.data.Type.value
            const referenceNbr = createPaymentAcumaticaResult.data.ReferenceNbr.value
            const FilterPayment = `$select=ReferenceNbr,CustomerID,Status&$filter=ReferenceNbr eq '${referenceNbr}'`
            
            if (file != '') {
              await acumatica.addFileToPayment(createPaymentAcumaticaResult.data.Type.value, createPaymentAcumaticaResult.data.ReferenceNbr.value, createPaymentAcumaticaResult.data.PaymentRef.value, file);
            }

            const { data: salesOrder } = await AcumaticaService.sendRequest('get', 'SalesOrder', '', `$filter=OrderNbr%20eq%20'${orderNbr}'`, '', '$select=Status,OrderType');
  
            const OrderType = salesOrder[0].OrderType.value;

            const paramsModifiedPayment = {
              OrdersToApply: [
                {
                    OrderNbr: {
                        value: orderNbr
                    },
                    OrderType: {
                        value: OrderType
                    }
                }
              ]
            }

            await AcumaticaService.sendRequest('put', 'Payment', '', FilterPayment, '', '', paramsModifiedPayment,'','')

            await paymentRelases(docType, referenceNbr);
            await salesOrderOpen(salesOrder);

            response.body = JSON.stringify({
            //message: "Payment created successfully",
            data: createPaymentAcumaticaResult.data,
            errors: ""
            });
        }else{
            console.log("error: ", createPaymentAcumaticaResult)
            response.body = JSON.stringify({
            errors: "createPayment error"
            });
        }
  }

  }catch(e){
    response.statusCode = 500;
    response.body = JSON.stringify({
      //message: "Failed to create order.",
      data: "",
      errors: e.message,
      errorStack: e.stack,
    });
  }
  return response;
}

async function createInvoice(PaymentAmount, CustomerID, CustomerOrder, PaymentMethod){

      const fee = PaymentMethod == 'WIRETRANSFER' ? 0.03 : PaymentMethod == 'CREDITCARD' && 0.03;
      const InventoryID = PaymentMethod == 'WIRETRANSFER' ? "WTFEE" : PaymentMethod == 'CREDITCARD' && "CCFEE";
      const TransactionDescr = PaymentMethod == 'WIRETRANSFER' ? "WireTransferFee" : PaymentMethod == 'CREDITCARD' && "Credit Card Fee";
      const comissionCC = PaymentAmount * fee
      const paramsInvoice = 
          {
              CustomerID: { value: CustomerID },
              Description: { value: "New Invoice" },
              Details: [{ 
                  InventoryID: { value: InventoryID },
                  TransactionDescr: { value: TransactionDescr },
                      Quantity: { value: 1 },
                      UnitPrice: { value: comissionCC },
                      Account: { value: "48100" },
                      Subaccount: { value: "01" }
                  }],
              Hold: { value: true },
              CustomerOrder: { value: CustomerOrder }
          };
      const { data: createInvoice } = await AcumaticaService.sendRequest('put', 'Invoice', '', '', '', '', paramsInvoice);
      const TypeDocIn = createInvoice.Type.value;
      const ReferenceNbrIn = createInvoice.ReferenceNbr.value;
      let paramsActionInvoice = {
          entity: { 
              Type: { value: TypeDocIn },
              ReferenceNbr: { value: ReferenceNbrIn }
          }

  }

  await AcumaticaService.sendRequest('post', 'Invoice', 'ReleaseFromHoldInvoice', '', '', '', paramsActionInvoice);
  
  const data = await AcumaticaService.sendRequest('get', 'Invoice', '', `$filter=ReferenceNbr%20eq%20'${ReferenceNbrIn}'`, '', '');
  const getInvoice = data.data
  
  if(getInvoice[0].Status.value == 'Credit Hold'){
      await AcumaticaService.sendRequest('post', 'Invoice', 'ReleaseFromCreditHoldInvoice', '', '', '', paramsActionInvoice);
  }

  await AcumaticaService.sendRequest('post', 'Invoice', 'ReleaseInvoice', '', '', '', paramsActionInvoice);

  return { TypeDocIn, ReferenceNbrIn, AmountPaid: comissionCC };
      
}

async function paymentRelases(docType, referenceNbr){
    
  const FilterPayment = `$select=ReferenceNbr,CustomerID,Status&$filter=ReferenceNbr eq '${referenceNbr}'`
  
  const { data: paymentData } = await AcumaticaService.sendRequest('get', 'Payment', '', FilterPayment, '', '');

  if(paymentData[0].Status.value == 'On Hold'){
      await AcumaticaService.sendRequest('post', 'Payment', 'ReleaseFromHold', '', '', '', {
          entity: { Type: { value: docType }, ReferenceNbr: { value: referenceNbr } }
      });
  }
  
  await AcumaticaService.sendRequest('post', 'Payment', 'ReleasePayment', '', '', '', {
      entity: { Type: { value: docType }, ReferenceNbr: { value: referenceNbr } }
  });

}

async function salesOrderOpen(salesOrder) {
    
  const OrderNbr = salesOrder[0].OrderNbr.value
  
  if(salesOrder[0].Status.value == 'On Hold' ){
      await AcumaticaService.sendRequest('post', 'SalesOrder', 'ReleaseFromHold', '', '', '', {
          entity: {
              OrderType: { value: OrderType },
              OrderNbr: { value: OrderNbr }
          }
      });
  }
  
  const { data: getSalesOrder2 } = await AcumaticaService.sendRequest('get', 'SalesOrder', '', `$filter=OrderNbr%20eq%20'${OrderNbr}'`, '', '$select=Status');
  
  if(getSalesOrder2[0].Status.value == 'Credit Hold' ){
      await AcumaticaService.sendRequest('post', 'SalesOrder', 'ReleaseFromCreditHold', '', '', '', {
          entity: {
              OrderType: { value: OrderType },
              OrderNbr: { value: OrderNbr }
          }
      });
  }

}

const releaseSalesOrderOnTemporaryHold = async (event) => {
  const response = { statusCode: 200, headers: _headers_post };
  try {
    const date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    const body = await multipartParser.parse(event);
    let totalAmountSaleOrden = 0.00;
    const file = body.files[0] || '';
    const errors = [];

    // validations - begin
    if (!body.CustomerID) {
      errors.push({ CustomerID: "CustomerID is empty" });
    }
    if (!body.Description) {
      errors.push({ Description: "Description is empty" });
    }
    if (!body.OrderNbr) {
      errors.push({ OrderNbr: "OrderNbr is empty" });
    } else {
      console.log("body.OrderNbr", body.OrderNbr);
      const validateSaleOrderHoldUpInventory = await rsp.validateSaleOrderHoldUpInventory(body.OrderNbr);
      console.log("validateSaleOrderHoldUpInventory", validateSaleOrderHoldUpInventory);

      if (!validateSaleOrderHoldUpInventory || validateSaleOrderHoldUpInventory == '') {
        errors.push({ validateSaleOrderHoldUpInventory: "Sale order expired or not found." });
      }
    }
    if (!body.OrderType) {
      errors.push({ OrderType: "OrderType is empty" });
    }
    if (!body.LocationID) {
      errors.push({ LocationID: "LocationID is empty" });
    }
    if (!body.ScheduledShipmentDate) {
      errors.push({ ScheduledShipmentDate: "ScheduledShipmentDate is empty" });
    }
    if (body.ShippingTerms && !body.FreightPrice) {
      errors.push({ FreightPrice: "FreightPrice is empty" });
    }
    if (!body.PaymentType) {
      errors.push({ PaymentType: "PaymentType is empty" });
    }
    else {
      if (body.PaymentType == "CREDITLINE") {
        const getOrderAcumatica = await acumatica.getSalesOrder(body.OrderNbr);
        const getCustomerLocationsResult = await acumatica.getCustomerLocations({ customerid: body.CustomerID, locationid: body.LocationID });
        const getCustomerResult = await acumatica.getCustomer(body.CustomerID);
        let freightPrice = parseFloat(getCustomerLocationsResult[0].custom.FreightPrice.value);
        if (body.ShippingTerms) freightPrice = parseFloat(body.FreightPrice);
        let totalTaxRate = parseFloat(getCustomerLocationsResult[0].custom.totalTaxRate.value);
        let remainingCreditLimit = parseFloat(getCustomerResult.RemainingCreditLimit.value);
        let orderTotal = parseFloat(getOrderAcumatica.OrderTotal.value);
        let subTotal = 0.00;
        console.log("freightPrice", freightPrice);
        console.log("totalTaxRate", totalTaxRate);
        console.log("remainingCreditLimit", remainingCreditLimit);

        getOrderAcumatica.Details.forEach(function (item) {
          subTotal += parseFloat(item.OrderQty.value) * parseFloat(item.UnitPrice.value);
        });
        totalAmountSaleOrden += freightPrice;
        totalAmountSaleOrden += parseFloat(((totalTaxRate / 100) * subTotal).toFixed(2));
        totalAmountSaleOrden += subTotal;

        console.log("totalAmountSaleOrden", totalAmountSaleOrden);

        if (totalAmountSaleOrden > orderTotal && totalAmountSaleOrden > remainingCreditLimit + orderTotal) {
          errors.push({ RemainingCreditLimit: "Insufficient remaining credit limit." });
        }
      }
      else if (body.PaymentType == "CHECK" || body.PaymentType == "CREDITCARD" || body.PaymentType == "WIRETRANSFER") {
        if (body.PaymentType == "CHECK" && file == '') {
          errors.push({ File: "The check must have an attachment." });
        }
        if (!body.PaymentRef) {
          errors.push({ PaymentRef: "PaymentRef is empty" });
        }
        if (!body.PaymentAmount) {
          errors.push({ PaymentAmount: "PaymentAmount is empty" });
        }
        if (!body.AppliedToOrder) {
          errors.push({ AppliedToOrder: "AppliedToOrder is empty" });
        } else {
          const getOrderAcumatica = await acumatica.getSalesOrder(body.OrderNbr);
          console.log("getOrderAcumatica", getOrderAcumatica);
          const getCustomerLocationsResult = await acumatica.getCustomerLocations({ customerid: body.CustomerID, locationid: body.LocationID });
          console.log("getCustomerLocationsResult", getCustomerLocationsResult);
          let freightPrice = parseFloat(getCustomerLocationsResult[0].custom.FreightPrice.value);
          if (body.ShippingTerms) freightPrice = parseFloat(body.FreightPrice);
          let totalTaxRate = parseFloat(getCustomerLocationsResult[0].custom.totalTaxRate.value);
          let subTotal = 0.00;

          getOrderAcumatica.Details.forEach(function (item) {
            subTotal += parseFloat(item.OrderQty.value) * parseFloat(item.UnitPrice.value);
          });
          totalAmountSaleOrden += freightPrice;
          totalAmountSaleOrden += parseFloat(((totalTaxRate / 100) * subTotal).toFixed(2));
          totalAmountSaleOrden += subTotal;
          totalAmountSaleOrden = totalAmountSaleOrden.toFixed(2);//util.format2DecimalExact(totalAmountSaleOrden);

          console.log("totalAmountSaleOrden", totalAmountSaleOrden);

          if (body.PaymentType == "CHECK" || body.PaymentType == "WIRETRANSFER") {
            if (body.PaymentAmount < totalAmountSaleOrden) {
              errors.push({ PaymentAmount: "The payment amount must be greater than or equal to the total amount of the sales order." });
            }
          } else if (body.PaymentType == "CREDITCARD") {
            if (body.PaymentAmount > totalAmountSaleOrden) {
              errors.push({ PaymentAmount: "Payment amount exceeds the total amount of the sales order." });
            }
          }
        }
      }
      else if (body.PaymentType == "MIXTO") {
        let fullPaymentAmount = 0.00;
        const getOrderAcumatica = await acumatica.getSalesOrder(body.OrderNbr);

        if (!body.PaymentDetail) {
          errors.push({ PaymentDetail: "PaymentDetail is empty" });
        } else {
          let paymentDetail = JSON.parse(body.PaymentDetail);
          paymentDetail.forEach(async function (paymentItem, paymentIndex) {

            if (!paymentItem.PaymentMethod) {
              errors.push({ PaymentDetail: "PaymentMethod is empty in position " + paymentIndex });
            } else {
              if (paymentItem.PaymentMethod.value == "CREDITLINE") {
                const getCustomerResult = await acumatica.getCustomer(body.CustomerID);
                let remainingCreditLimit = parseFloat(getCustomerResult.RemainingCreditLimit.value);
                if (!paymentItem.PaymentAmount) {
                  errors.push({ PaymentDetail: "PaymentAmount is empty in position " + paymentIndex });
                } else {
                  fullPaymentAmount += parseFloat(paymentItem.PaymentAmount.value);
                }
                if (paymentItem.PaymentAmount.value > remainingCreditLimit) {
                  errors.push({ PaymentDetail: "Insufficient remaining credit limit in position " + paymentIndex });
                }
              } else if (paymentItem.PaymentMethod.value == "CHECK") {
                if (!paymentItem.PaymentAmount) {
                  errors.push({ PaymentDetail: "PaymentAmount is empty in position " + paymentIndex });
                }
                if (!paymentItem.PaymentRef) {
                  errors.push({ PaymentDetail: "PaymentRef is empty in position " + paymentIndex });
                }
                if (!paymentItem.AppliedToOrder) {
                  errors.push({ PaymentDetail: "AppliedToOrder is empty in position " + paymentIndex });
                } else {
                  if (parseFloat(paymentItem.AppliedToOrder.value) > parseFloat(paymentItem.PaymentAmount.value)) {
                    errors.push({ PaymentDetail: "AppliedToOrder is greater than PaymentAmount in position " + paymentIndex });
                  } else {
                    fullPaymentAmount += parseFloat(paymentItem.AppliedToOrder.value);
                  }
                }
                if (file == '') {
                  errors.push({ PaymentDetail: "The check must have an attachment in position " + paymentIndex });
                }
              } else if (paymentItem.PaymentMethod.value == "CREDITCARD") {
                if (!paymentItem.PaymentRef) {
                  errors.push({ PaymentDetail: "PaymentRef is empty in position " + paymentIndex });
                }
                if (!paymentItem.PaymentAmount) {
                  errors.push({ PaymentDetail: "PaymentAmount is empty in position " + paymentIndex });
                }
                if (!paymentItem.AppliedToOrder) {
                  errors.push({ PaymentDetail: "AppliedToOrder is empty in position " + paymentIndex });
                } else {
                  fullPaymentAmount += parseFloat(paymentItem.AppliedToOrder.value);
                }
              } else {
                errors.push({ PaymentDetail: "PaymentMethod is invalid." });
              }
            }
          });
          const getCustomerLocationsResult = await acumatica.getCustomerLocations({ customerid: body.CustomerID, locationid: body.LocationID });
          let freightPrice = parseFloat(getCustomerLocationsResult[0].custom.FreightPrice.value);
          if (body.ShippingTerms) freightPrice = parseFloat(body.FreightPrice);
          let totalTaxRate = parseFloat(getCustomerLocationsResult[0].custom.totalTaxRate.value);
          let subTotal = 0.00;

          getOrderAcumatica.Details.forEach(function (item) {
            subTotal += parseFloat(item.OrderQty.value) * parseFloat(item.UnitPrice.value);
          });
          totalAmountSaleOrden += freightPrice;
          totalAmountSaleOrden += parseFloat(((totalTaxRate / 100) * subTotal).toFixed(2));
          totalAmountSaleOrden += subTotal;

          if (fullPaymentAmount > totalAmountSaleOrden) {
            errors.push({ PaymentDetail: "Amount applied exceeds the total amount of the sales order.." });
          }
        }
        console.log("Here mixto");
      }
      else {
        errors.push({ PaymentType: "Wrong payment type" });
      }
    }
    // validations - end

    if (Object.keys(errors).length) {
      response.statusCode = 400;
      response.body = JSON.stringify({
        data: "",
        message: "Sales order release failed.",
        errors: errors,
      });
    } else {
      const getOrderResult = await acumatica.getSalesOrder(body.OrderNbr);
      console.log("getOrderResult", getOrderResult);
      const getCustomerResult = await acumatica.getCustomer(getOrderResult.CustomerID.value);
      console.log("getCustomerResult", getCustomerResult);
      const body_update_customer = {
        CustomerID: { value: body.CustomerID },
        CreditLimit: { value: parseFloat(getCustomerResult.CreditLimit.value) - parseFloat(getOrderResult.OrderTotal.value) }
      };
      const action_on_hold = {
        entity: {
          OrderType: { value: getOrderResult.OrderType.value },
          OrderNbr: { value: getOrderResult.OrderNbr.value }
        }
      };
      console.log("body_update_customer", body_update_customer);
      await acumatica.updateCustomer(body_update_customer);
      await acumatica.actionOnHoldSalesOrder(action_on_hold);
      const scheduledShipmentDate = new Date(body.ScheduledShipmentDate);
      scheduledShipmentDate.setDate(scheduledShipmentDate.getDate() - 4);

      var body_format = {
        OrderType: { value: body.OrderType },
        OrderNbr: { value: body.OrderNbr },
        Description: { value: body.Description },
        ShippingSettings: { ScheduledShipmentDate: { value: scheduledShipmentDate.toISOString().slice(0, 10) } },
        ShipToAddress: { OverrideAddress: { value: true } },
        ShipToContact: { OverrideContact: { value: true } },
        LocationID: { value: body.LocationID }
      };

      if (body.CustomerOrder) {
        body_format.CustomerOrder = { value: body.CustomerOrder };
      } else {
        body_format.CustomerOrder = { value: '--' };
      }

      if (body.ShippingTerms && body.ShippingTerms != '') {
        body_format.ShippingSettings.ShippingTerms = { value: body.ShippingTerms };
      }
      if (body.AddressLine1 && body.AddressLine1 != '') {
        body_format.ShipToAddress.AddressLine1 = { value: body.AddressLine1 };
      }
      if (body.State && body.State != '') {
        body_format.ShipToAddress.State = { value: body.State };
      }
      if (body.PostalCode && body.PostalCode != '') {
        body_format.ShipToAddress.PostalCode = { value: body.PostalCode };
      }
      if (body.Attention && body.Attention != '') {
        body_format.ShipToContact.Attention = { value: body.Attention };
      }
      if (body.Phone1 && body.Phone1 != '') {
        body_format.ShipToContact.Phone1 = { value: body.Phone1 };
      }

      if (body.PaymentType == "CREDITLINE") {
        body_format.Hold = { value: false };
        body_format.Payments = [];
      }
      else if (body.PaymentType == "CHECK") {
        body_format.Hold = { value: true };
        body_format.Payments = [{
          Hold: { value: true },
          AppliedToOrder: { value: body.AppliedToOrder },
          CashAccount: { value: "10100" },
          PaymentAmount: { value: body.PaymentAmount },
          PaymentMethod: { value: "CHECK" },
          PaymentRef: { value: body.PaymentRef },
          DocType: { value: "Prepayment" }
        }];
      }
      else if (body.PaymentType == "WIRETRANSFER") {
        body_format.Hold = { value: true };
        body_format.Payments = [{
          Hold: { value: true },
          AppliedToOrder: { value: body.AppliedToOrder },
          CashAccount: { value: "10100" },
          PaymentAmount: { value: body.PaymentAmount },
          PaymentMethod: { value: "WT" },
          PaymentRef: { value: body.PaymentRef },
          DocType: { value: "Prepayment" }
        }];
      }
      else if (body.PaymentType == "MIXTO") {
        let paymentDetail = JSON.parse(body.PaymentDetail);
        paymentDetail.forEach(function (paymentItem) {
          if (paymentItem.PaymentMethod.value == "CHECK") {
            body_format.Hold = { value: true };
            body_format.Payments = [{
              "Hold": { "value": true },
              "AppliedToOrder": { "value": paymentItem.AppliedToOrder.value },
              "CashAccount": { "value": "10100" },
              "PaymentAmount": { "value": paymentItem.PaymentAmount.value },
              "PaymentMethod": { "value": "CHECK" },
              "PaymentRef": { "value": paymentItem.PaymentRef.value },
              "DocType": { "value": "Prepayment" }
            }];
          } else if (paymentItem.PaymentMethod.value == "CREDITCARD") {
            body_format.Hold = { value: true };
            body_format.Payments = [{
              "Hold": { "value": false },
              "AppliedToOrder": { "value": paymentItem.AppliedToOrder.value },
              "CashAccount": { "value": "10450" },
              "PaymentAmount": { "value": paymentItem.PaymentAmount.value },
              "PaymentMethod": { "value": "CC" },
              "PaymentRef": { "value": paymentItem.PaymentRef.value },
              "DocType": { "value": "Prepayment" }
            }];
          }
        });
      }
      else if (body.PaymentType == "CREDITCARD") {
        body_format.Hold = { value: false };
        body_format.Payments = [{
          "Hold": { "value": false },
          "AppliedToOrder": { "value": body.AppliedToOrder },
          "CashAccount": { "value": "10450" },
          "PaymentAmount": { "value": body.PaymentAmount },
          "PaymentMethod": { "value": "CC" },
          "PaymentRef": { "value": body.PaymentRef },
          "DocType": { "value": "Prepayment" }
        }];
      }
      console.log("body_format", body_format);

      const createOrderAcumaticaResult = await acumatica.createSalesOrder(body_format);
      console.log("createOrderAcumaticaResult", createOrderAcumaticaResult);

      if (createOrderAcumaticaResult.status == 200) {
        //const getOrderAcumaticaResult = await acumatica.getSalesOrder(createOrderAcumaticaResult.data.OrderNbr.value);
        //const commission = getOrderAcumaticaResult.Payments[0].PaymentAmount.value * 0.03 || 0.00;
        //console.log("commission", commission);
        //const descriptionJournal = `${body.CustomerID} - ${getOrderAcumaticaResult.Payments[0].ReferenceNbr.value} - ${date}`;
        const getOrderAcumaticaResult = await acumatica.getSalesOrder(createOrderAcumaticaResult.data.OrderNbr.value);
        let commission = 0.00;
        let descriptionJournal = "";

        if (body.PaymentType != "CREDITLINE") {
          commission = getOrderAcumaticaResult.Payments[0].PaymentAmount.value * 0.03;
          descriptionJournal = `${body.CustomerID} - ${getOrderAcumaticaResult.Payments[0].ReferenceNbr.value} - ${date}`;
        }
        console.log("commission", commission);

        if (body.PaymentType == "CREDITLINE") {
          await rsp.releaseSalesOrderOnTemporaryHold('Release', body.OrderNbr);
        }
        if (body.PaymentType == "CHECK") {
          await acumatica.addFileToPayment(getOrderAcumaticaResult.Payments[0].DocType.value, getOrderAcumaticaResult.Payments[0].ReferenceNbr.value, getOrderAcumaticaResult.Payments[0].PaymentRef.value, file);
          await rsp.releaseSalesOrderOnTemporaryHold('Validating Payment', body.OrderNbr);
        } else if (body.PaymentType == "CREDITCARD") {
          const action_params = {
            entity: {
              Type: { value: getOrderAcumaticaResult.Payments[0].DocType.value },
              ReferenceNbr: { value: getOrderAcumaticaResult.Payments[0].ReferenceNbr.value }
            }
          };
          await acumatica.actionReleasePayment(action_params);
          await rsp.releaseSalesOrderOnTemporaryHold('Release', body.OrderNbr);
          await acumatica.createJournalTransaction(descriptionJournal, getOrderAcumaticaResult.Payments[0].ReferenceNbr.value, commission);
        } else if (body.PaymentType == "MIXTO") {
          let paymentDetail = JSON.parse(body.PaymentDetail);
          for (var i = 0; i < paymentDetail.length; i++) {
            if (paymentDetail[i].PaymentMethod.value == "CREDITLINE") {
              const getCustomerResult = await acumatica.getCustomer(body.CustomerID);
              const body_update_customer = {
                CustomerID: { value: body.CustomerID },
                CreditLimit: { value: parseFloat(getCustomerResult.CreditLimit.value) - parseFloat(paymentDetail[i].PaymentAmount.value) }
              };
              await acumatica.updateCustomer(body_update_customer);
              await rsp.releaseSalesOrderOnTemporaryHold('Release', body.OrderNbr);
            } else if (paymentDetail[i].PaymentMethod.value == "CHECK") {
              await acumatica.addFileToPayment(getOrderAcumaticaResult.Payments[0].DocType.value, getOrderAcumaticaResult.Payments[0].ReferenceNbr.value, getOrderAcumaticaResult.Payments[0].PaymentRef.value, file);
              await rsp.releaseSalesOrderOnTemporaryHold('Validating Payment', body.OrderNbr);
            } else if (paymentDetail[i].PaymentMethod.value == "CREDITCARD") {
              const action_params_release_payment = {
                entity: {
                  Type: { value: getOrderAcumaticaResult.Payments[0].DocType.value },
                  ReferenceNbr: { value: getOrderAcumaticaResult.Payments[0].ReferenceNbr.value }
                }
              };
              console.log("action_params_release_payment", action_params_release_payment);
              const action_params_release_from_hold = {
                entity: {
                  OrderType: { value: getOrderAcumaticaResult.OrderType.value },
                  OrderNbr: { value: getOrderAcumaticaResult.OrderNbr.value }
                }
              };
              console.log("action_params_release_from_hold", action_params_release_from_hold);
              await acumatica.actionReleasePayment(action_params_release_payment);
              await acumatica.actionReleaseFromHold(action_params_release_from_hold);
              await rsp.releaseSalesOrderOnTemporaryHold('Release', body.OrderNbr);
              await acumatica.createJournalTransaction(descriptionJournal, getOrderAcumaticaResult.Payments[0].ReferenceNbr.value, commission);
            }
          }
        }

        response.body = JSON.stringify({
          data: getOrderAcumaticaResult,
          errors: "",
        });
      }
    }
  } catch (e) {
    response.statusCode = 500;
    response.body = JSON.stringify({
      data: "",
      errors: e.message,
      errorStack: e.stack,
    });
  }
  return response;
}

const createSalesOrder = async (event) => {
  const response = { statusCode: 200, headers: _headers_post };

  try {
    let date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    let SaleOrderId = crypto.randomBytes(10).toString('hex');
    let totalAmountSaleOrden = 0.00;
    const body = await multipartParser.parse(event);
    const details = JSON.parse(body.Details) || '';
    const email = body.Email || '';
    const file = body.files[0] || '';
    const errors = [];

    // validations - begin
    if (!body.CustomerID) {
      errors.push({ CustomerID: "CustomerID is empty" });
    }
    if (!body.Description) {
      errors.push({ Description: "Description is empty" });
    }
    if (!Object.keys(details).length) {
      errors.push({ Details: "Details is empty" });
    }
    else {
      details.forEach(function (item, index) {
        if (!item.InventoryID) {
          errors.push({ DetailsContent: "InventoryID is empty in position " + index });
        }
        if (!item.OrderQty) {
          errors.push({ DetailsContent: "OrderQty is empty in position " + index });
        }
        if (!item.UnitPrice) {
          errors.push({ DetailsContent: "UnitPrice is empty in position " + index });
        }
        if (!item.WarehouseID) {
          errors.push({ DetailsContent: "WarehouseID is empty in position " + index });
        }
        if (!item.SQFTPrice) {
          errors.push({ DetailsContent: "SQFTPrice is empty in position " + index });
        }
      });
    }

    if (!body.OrderType) {
      errors.push({ OrderType: "OrderType is empty" });
    }
    if (!body.LocationID) {
      errors.push({ LocationID: "LocationID is empty" });
    }
    if (!body.ScheduledShipmentDate) {
      errors.push({ ScheduledShipmentDate: "ScheduledShipmentDate is empty" });
    }
    if (body.ShippingTerms && !body.FreightPrice) {
      errors.push({ FreightPrice: "FreightPrice is empty" });
    }
    if (!body.PaymentType) {
      errors.push({ PaymentType: "PaymentType is empty" });
    }
    else {
      if (body.PaymentType == "CREDITLINE") {
        const getCustomerLocationsResult = await acumatica.getCustomerLocations({ customerid: body.CustomerID, locationid: body.LocationID });
        const getCustomerResult = await acumatica.getCustomer(body.CustomerID);
        let freightPrice = parseFloat(getCustomerLocationsResult[0].custom.FreightPrice.value);
        if (body.ShippingTerms) freightPrice = parseFloat(body.FreightPrice);
        let totalTaxRate = parseFloat(getCustomerLocationsResult[0].custom.totalTaxRate.value);
        let remainingCreditLimit = parseFloat(getCustomerResult.RemainingCreditLimit.value);
        let subTotal = 0.00;

        if (details != '') {
          details.forEach(function (item) {
            subTotal += parseFloat(item.OrderQty.value) * parseFloat(item.UnitPrice.value);
          });
          totalAmountSaleOrden += freightPrice;
          totalAmountSaleOrden += parseFloat(((totalTaxRate / 100) * subTotal).toFixed(2));
          totalAmountSaleOrden += subTotal;

          if (totalAmountSaleOrden > remainingCreditLimit) {
            errors.push({ RemainingCreditLimit: "Insufficient credit limit." });
          }
        } else {
          errors.push({ DetailsContent: "Invalid detail." });
        }
      }
      else if (body.PaymentType == "CHECK" || body.PaymentType == "CREDITCARD" || body.PaymentType == "WIRETRANSFER") {
        if (body.PaymentType == "CHECK" && file == '') {
          errors.push({ File: "The check must have an attachment." });
        }
          //codigo de stripe
        /*if (!body.PaymentRef) {
          errors.push({ PaymentRef: "PaymentRef is empty" });
        }*/
        if (!body.PaymentAmount) {
          errors.push({ PaymentAmount: "PaymentAmount is empty" });
        }
        if (!body.AppliedToOrder) {
          errors.push({ AppliedToOrder: "AppliedToOrder is empty" });
        } else {
          const getCustomerLocationsResult = await acumatica.getCustomerLocations({ customerid: body.CustomerID, locationid: body.LocationID });
          console.log("getCustomerLocationsResult", getCustomerLocationsResult);
          let freightPrice = parseFloat(getCustomerLocationsResult[0].custom.FreightPrice.value);
          console.log("getCustomerLocationsResult[0].custom.FreightPrice.value", getCustomerLocationsResult[0].custom.FreightPrice.value);
          if (body.ShippingTerms) freightPrice = parseFloat(body.FreightPrice);
          let totalTaxRate = parseFloat(getCustomerLocationsResult[0].custom.totalTaxRate.value);
          let subTotal = 0.00;

          if (details != '') {
            details.forEach(function (item) {
              subTotal += parseFloat(item.OrderQty.value) * parseFloat(item.UnitPrice.value);
            });
            totalAmountSaleOrden += freightPrice;
            totalAmountSaleOrden += parseFloat(((totalTaxRate / 100) * subTotal).toFixed(2));
            totalAmountSaleOrden += subTotal;
            totalAmountSaleOrden = totalAmountSaleOrden.toFixed(2); //util.format2DecimalExact(totalAmountSaleOrden);

            console.log("totalAmountSaleOrden", totalAmountSaleOrden);

            if (body.PaymentType == "CHECK" || body.PaymentType == "WIRETRANSFER") {
              if (body.PaymentAmount < totalAmountSaleOrden) {
                errors.push({ PaymentAmount: "The payment amount must be greater than or equal to the total amount of the sales order." });
              }
            } else if (body.PaymentType == "CREDITCARD") {
              if (body.PaymentAmount > totalAmountSaleOrden) {
                errors.push({ PaymentAmount: "Payment amount exceeds the total amount of the sales order." });
              }
            }
          } else {
            errors.push({ DetailsContent: "Invalid detail." });
          }
        }
      }
      else if (body.PaymentType == "MIXTO") {
        let fullPaymentAmount = 0.00;

        if (!body.PaymentDetail) {
          errors.push({ PaymentDetail: "PaymentDetail is empty" });
        } else {
          let paymentDetail = JSON.parse(body.PaymentDetail);
          paymentDetail.forEach(async function (paymentItem, paymentIndex) {
            if (!paymentItem.PaymentMethod) {
              errors.push({ PaymentDetail: "PaymentMethod is empty in position " + paymentIndex });
            } else {
              if (paymentItem.PaymentMethod.value == "CREDITLINE") {
                const getCustomerResult = await acumatica.getCustomer(body.CustomerID);
                let remainingCreditLimit = parseFloat(getCustomerResult.RemainingCreditLimit.value);
                if (!paymentItem.PaymentAmount) {
                  errors.push({ PaymentDetail: "PaymentAmount is empty in position " + paymentIndex });
                } else {
                  fullPaymentAmount += parseFloat(paymentItem.PaymentAmount.value);
                }
                if (paymentItem.PaymentAmount.value > remainingCreditLimit.credit_line) {
                  errors.push({ PaymentDetail: "Insufficient remaining credit limit in position " + paymentIndex });
                }
              } else if (paymentItem.PaymentMethod.value == "CHECK") {
                //stripe
                /*
                if (!paymentItem.PaymentRef) {
                  errors.push({ PaymentDetail: "PaymentRef is empty in position " + paymentIndex });
                }*/
                if (!paymentItem.PaymentAmount) {
                  errors.push({ PaymentDetail: "PaymentAmount is empty in position " + paymentIndex });
                }
                if (!paymentItem.AppliedToOrder) {
                  errors.push({ PaymentDetail: "AppliedToOrder is empty in position " + paymentIndex });
                } else {
                  if (parseFloat(paymentItem.AppliedToOrder.value) > parseFloat(paymentItem.PaymentAmount.value)) {
                    errors.push({ PaymentDetail: "AppliedToOrder is greater than PaymentAmount in position " + paymentIndex });
                  } else {
                    fullPaymentAmount += parseFloat(paymentItem.AppliedToOrder.value);
                  }
                }
                if (file == '') {
                  errors.push({ PaymentDetail: "The check must have an attachment in position " + paymentIndex });
                }
              } else if (paymentItem.PaymentMethod.value == "CREDITCARD") {
                //stripe
                /*
                if (!paymentItem.PaymentRef) {
                  errors.push({ PaymentDetail: "PaymentRef is empty in position " + paymentIndex });
                }
                */
                if (!paymentItem.PaymentAmount) {
                  errors.push({ PaymentDetail: "PaymentAmount is empty in position " + paymentIndex });
                }
                if (!paymentItem.AppliedToOrder) {
                  errors.push({ PaymentDetail: "AppliedToOrder is empty in position " + paymentIndex });
                } else {
                  fullPaymentAmount += parseFloat(paymentItem.AppliedToOrder.value);
                }
              } else {
                errors.push({ PaymentDetail: "PaymentMethod is invalid." });
              }
            }
          });
          const getCustomerLocationsResult = await acumatica.getCustomerLocations({ customerid: body.CustomerID, locationid: body.LocationID });
          let freightPrice = parseFloat(getCustomerLocationsResult[0].custom.FreightPrice.value);
          if (body.ShippingTerms) freightPrice = parseFloat(body.FreightPrice);
          let totalTaxRate = parseFloat(getCustomerLocationsResult[0].custom.totalTaxRate.value);
          let subTotal = 0.00;

          if (details != '') {
            details.forEach(function (item) {
              subTotal += parseFloat(item.OrderQty.value) * parseFloat(item.UnitPrice.value);
            });
            totalAmountSaleOrden += freightPrice;
            totalAmountSaleOrden += parseFloat(((totalTaxRate / 100) * subTotal).toFixed(2));
            totalAmountSaleOrden += subTotal;

            if (fullPaymentAmount > totalAmountSaleOrden) {
              errors.push({ PaymentDetail: "Amount applied exceeds the total amount of the sales order." });
            }
          } else {
            errors.push({ DetailsContent: "Invalid detail." });
          }
        }
      }
      else {
        errors.push({ PaymentType: "Wrong payment type" });
      }
    }

    if (Object.keys(errors).length) {
      response.statusCode = 400;
      response.body = JSON.stringify({
        data: "",
        message: "Failed to create order.",
        errors: errors,
      });
    }
    else {
      // body to send to SNS - begin
      const scheduledShipmentDate = new Date(body.ScheduledShipmentDate);
      scheduledShipmentDate.setDate(scheduledShipmentDate.getDate() - 4);

      var body_sns = {
        CustomerID: { value: body.CustomerID },
        Description: { value: body.Description },
        ShippingSettings: {
          ScheduledShipmentDate: {
            value: scheduledShipmentDate.toISOString().slice(0, 10)
          },
        },
        ShipToAddress: {
          OverrideAddress: {
            value: true
          }
        },
        ShipToContact: {
          OverrideContact: {
            value: true
          }
        },
        Details: details,
        OrderType: { value: body.OrderType },
        LocationID: { value: body.LocationID }
      };
      // body to send to SNS - end

      if (body.CustomerOrder) {
        body_sns.CustomerOrder = { value: body.CustomerOrder };
      } else {
        body_sns.CustomerOrder = { value: '--' };
      }

      //ShippingSettings
      if (body.ShippingTerms && body.ShippingTerms != '') {
        body_sns.ShippingSettings.ShippingTerms = { value: body.ShippingTerms };
      }

      // ShipToAddress
      if (body.AddressLine1 && body.AddressLine1 != '') {
        body_sns.ShipToAddress.AddressLine1 = { value: body.AddressLine1 };
      }
      if (body.State && body.State != '') {
        body_sns.ShipToAddress.State = { value: body.State };
      }
      if (body.PostalCode && body.PostalCode != '') {
        body_sns.ShipToAddress.PostalCode = { value: body.PostalCode };
      }

      // ShipToContact
      if (body.Attention && body.Attention != '') {
        body_sns.ShipToContact.Attention = { value: body.Attention };
      }
      if (body.Phone1 && body.Phone1 != '') {
        body_sns.ShipToContact.Phone1 = { value: body.Phone1 };
      }

      // adding attributes to the body sns - begin
      if (body.PaymentType == "CREDITLINE") {
        body_sns.Hold = { value: false };
        body_sns.Payments = [];
      }
      else if (body.PaymentType == "CHECK") {
        body_sns.Hold = { value: true };
        body_sns.Payments = [{
          "Hold": { "value": true },
          "AppliedToOrder": { "value": body.AppliedToOrder },
          "CashAccount": { "value": "10100" },
          "PaymentAmount": { "value": body.PaymentAmount },
          "PaymentMethod": { "value": "CHECK" },
          //"PaymentRef": { "value": body.PaymentRef },
          "DocType": { "value": "Prepayment" }
        }];
      }
      else if (body.PaymentType == "WIRETRANSFER") {
        body_sns.Hold = { value: true };
        body_sns.Payments = [{
          "Hold": { "value": true },
          "AppliedToOrder": { "value": body.AppliedToOrder },
          "CashAccount": { "value": "10100" },
          "PaymentAmount": { "value": body.PaymentAmount },
          "PaymentMethod": { "value": "WT" },
          //"PaymentRef": { "value": body.PaymentRef },
          "DocType": { "value": "Prepayment" }
        }];
      }
      else if (body.PaymentType == "MIXTO") {
        let paymentDetail = JSON.parse(body.PaymentDetail);
        paymentDetail.forEach(function (paymentItem) {
          if (paymentItem.PaymentMethod.value == "CHECK") {
            body_sns.Hold = { value: true };
            body_sns.Payments = [{
              "Hold": { "value": true },
              "AppliedToOrder": { "value": paymentItem.AppliedToOrder.value },
              "CashAccount": { "value": "10100" },
              "PaymentAmount": { "value": paymentItem.PaymentAmount.value },
              "PaymentMethod": { "value": "CHECK" },
              //"PaymentRef": { "value": paymentItem.PaymentRef.value },
              "DocType": { "value": "Prepayment" }
            }];
          } else if (paymentItem.PaymentMethod.value == "CREDITCARD") {
            body_sns.Hold = { value: true };
            body_sns.Payments = [{
              "Hold": { "value": false },
              "AppliedToOrder": { "value": paymentItem.AppliedToOrder.value },
              "CashAccount": { "value": "10450" },
              "PaymentAmount": { "value": paymentItem.PaymentAmount.value },
              "PaymentMethod": { "value": "CC" },
              //"PaymentRef": { "value": paymentItem.PaymentRef.value },
              "DocType": { "value": "Prepayment" }
            }];
          }
        });
      }
      else if (body.PaymentType == "CREDITCARD") {
        body_sns.Hold = { value: false };
        body_sns.Payments = [{
          "Hold": { "value": false },
          "AppliedToOrder": { "value": body.AppliedToOrder },
          "CashAccount": { "value": "10450" },
          "PaymentAmount": { "value": body.PaymentAmount },
          "PaymentMethod": { "value": "CC" },
          //"PaymentRef": { "value": body.PaymentRef },
          "DocType": { "value": "Prepayment" }
        }];
        // hay que hacer un action release al payment creado (solo creditcard).
      }
      body_sns.ExternalRef = { value: SaleOrderId };
      // adding attributes to the body sns - end
      console.log("body_sns", body_sns);

      // body to send to dynamo - begin
      var body_dynamo = {
        SaleOrderId: SaleOrderId,
        CustomerID: body.CustomerID,
        CustomerEmail: email,
        Description: body.Description,
        Details: details,
        OrderType: body.OrderType,
        LocationID: body.LocationID,
        PaymentType: body.PaymentType,
        Payments: body_sns.Payments,
        CreationDate: date,
        ModificationDate: date,
        Hold: body_sns.Hold.value,
        State: 1,
      };
      // body to send to dynamo - end

      // Sending DynamoDB - begin
      /*const params_dynamo = {
        TableName: process.env.DYNAMODB_TABLE_SALEORDER,
        Item: marshall(body_dynamo, { removeUndefinedValues: true }),
      };
      const createOrderDynamoResult = await dynamo.send(new PutItemCommand(params_dynamo));*/
      // Sending DynamoDB - end

      //if (createOrderDynamoResult.$metadata.httpStatusCode == 200) {

      let message_body = {};

      if (file) {
        const timestamp = Date.now();
        const filename_s3 = `${body_dynamo.SaleOrderId}_${timestamp}`;
        const params_send_s3 = {
          Bucket: process.env.BUCKET_RSP,
          Key: `checks/${filename_s3}`,
          Body: file.content,
          ContentType: file.contentType,
          ACL: 'public-read'
        };
        await s3.upload(params_send_s3).promise();
        message_body.filename = filename_s3;
      }

      const createOrderAcumaticaResult = await acumatica.createSalesOrder(body_sns);
      if (createOrderAcumaticaResult.status == 200) {
        const getOrderAcumaticaResult = await acumatica.getSalesOrder(createOrderAcumaticaResult.data.OrderNbr.value);
        let commission = 0.00;
        let descriptionJournal = "";

        if (body.PaymentType != "CREDITLINE") {
          commission = getOrderAcumaticaResult.Payments[0].PaymentAmount.value * 0.03;
          descriptionJournal = `${body.CustomerID} - ${getOrderAcumaticaResult.Payments[0].ReferenceNbr.value} - ${date}`;
        }
        console.log("commission", commission);

        if (body.PaymentType == "CREDITLINE") {
          const action_params_release_from_hold = {
            entity: {
              OrderType: { value: getOrderAcumaticaResult.OrderType.value },
              OrderNbr: { value: getOrderAcumaticaResult.OrderNbr.value }
            }
          };
          await acumatica.actionReleaseFromHold(action_params_release_from_hold);
        }
        else if (body.PaymentType == "CHECK") {
          await acumatica.addFileToPayment(getOrderAcumaticaResult.Payments[0].DocType.value, getOrderAcumaticaResult.Payments[0].ReferenceNbr.value, getOrderAcumaticaResult.Payments[0].PaymentRef.value, file);
        }
        else if (body.PaymentType == "CREDITCARD") {
          const action_params_release_payment = {
            entity: {
              Type: { value: getOrderAcumaticaResult.Payments[0].DocType.value },
              ReferenceNbr: { value: getOrderAcumaticaResult.Payments[0].ReferenceNbr.value }
            }
          };
          const action_params_release_from_hold = {
            entity: {
              OrderType: { value: getOrderAcumaticaResult.OrderType.value },
              OrderNbr: { value: getOrderAcumaticaResult.OrderNbr.value }
            }
          };
          await acumatica.actionReleasePayment(action_params_release_payment);
          await acumatica.actionReleaseFromHold(action_params_release_from_hold);
          await acumatica.createJournalTransaction(descriptionJournal, getOrderAcumaticaResult.Payments[0].ReferenceNbr.value, commission);
        } else if (body.PaymentType == "MIXTO") {
          let paymentDetail = JSON.parse(body.PaymentDetail);
          for (var i = 0; i < paymentDetail.length; i++) {
            if (paymentDetail[i].PaymentMethod.value == "CREDITLINE") {
              /*const getCustomerResult = await acumatica.getCustomer(body.CustomerID);
              const body_update_customer = {
                CustomerID: { value: body.CustomerID },
                CreditLimit: { value: parseFloat(getCustomerResult.CreditLimit.value) - parseFloat(paymentDetail[i].PaymentAmount.value) }
              };
              await acumatica.updateCustomer(body_update_customer);*/
            } else if (paymentDetail[i].PaymentMethod.value == "CHECK") {
              await acumatica.addFileToPayment(getOrderAcumaticaResult.Payments[0].DocType.value, getOrderAcumaticaResult.Payments[0].ReferenceNbr.value, getOrderAcumaticaResult.Payments[0].PaymentRef.value, file);
            } else if (paymentDetail[i].PaymentMethod.value == "CREDITCARD") {
              const action_params_release_payment = {
                entity: {
                  Type: { value: getOrderAcumaticaResult.Payments[0].DocType.value },
                  ReferenceNbr: { value: getOrderAcumaticaResult.Payments[0].ReferenceNbr.value }
                }
              };
              console.log("action_params_release_payment", action_params_release_payment);
              const action_params_release_from_hold = {
                entity: {
                  OrderType: { value: getOrderAcumaticaResult.OrderType.value },
                  OrderNbr: { value: getOrderAcumaticaResult.OrderNbr.value }
                }
              };
              console.log("action_params_release_from_hold", action_params_release_from_hold);
              await acumatica.actionReleasePayment(action_params_release_payment);
              await acumatica.actionReleaseFromHold(action_params_release_from_hold);
              await acumatica.createJournalTransaction(descriptionJournal, getOrderAcumaticaResult.Payments[0].ReferenceNbr.value, commission);
            }
          }
        }

        // Sending message to topic - begin
        if (body.Email && body.Email != '') {
          message_body.saleorder = getOrderAcumaticaResult;
        }

        if (message_body.filename || message_body.saleorder) {

          const params_topic = {
            Message: JSON.stringify(message_body),
            TopicArn: 'arn:aws:sns:us-east-1:241125307495:sls-sqs-test-dev-my-sns-topic',
          };
          const publishTextPromise = await sns.publish(params_topic).promise();
        }
        // Sending message to topic - end

        response.body = JSON.stringify({
          //message: "Order created successfully",
          data: getOrderAcumaticaResult,
          errors: "",
        });
      }
      //}
    }
  } catch (e) {
    response.statusCode = 500;
    response.body = JSON.stringify({
      //message: "Failed to create order.",
      data: "",
      errors: e.message,
      errorStack: e.stack,
    });
  }
  return response;
};

const createSalesOrderOnTemporaryHold = async (event) => {
  const response = { statusCode: 200, headers: _headers_post };

  try {
    const date = new Date().toLocaleString('sv-SE', { timeZone: 'US/Central' });
    var SaleOrderId = crypto.randomBytes(10).toString('hex');
    const body = await multipartParser.parse(event);
    const details = JSON.parse(body.Details);
    const email = body.Email;
    const file = body.files[0];
    const errors = [];
    let totalAmountSaleOrden = 0.00;

    // validations - begin
    if (!body.CustomerID) {
      errors.push({ CustomerID: "CustomerID is empty" });
    }
    if (!Object.keys(details).length) {
      errors.push({ Details: "Details is empty" });
    }
    else {
      details.forEach(function (item, index) {
        if (!item.InventoryID) {
          errors.push({ DetailsContent: "InventoryID is empty in position " + index });
        }
        if (!item.OrderQty) {
          errors.push({ DetailsContent: "OrderQty is empty in position " + index });
        }
        if (!item.UnitPrice) {
          errors.push({ DetailsContent: "UnitPrice is empty in position " + index });
        }
        if (!item.WarehouseID) {
          errors.push({ DetailsContent: "WarehouseID is empty in position " + index });
        }
        if (!item.SQFTPrice) {
          errors.push({ DetailsContent: "SQFTPrice is empty in position " + index });
        }
      });
    }

    if (!body.OrderType) {
      errors.push({ OrderType: "OrderType is empty" });
    }
    if (!body.LocationID) {
      errors.push({ LocationID: "LocationID is empty" });
    }
    if (!body.ScheduledShipmentDate) {
      errors.push({ ScheduledShipmentDate: "ScheduledShipmentDate is empty" });
    }
    const getCustomerLocationsResult = await acumatica.getCustomerLocations({ customerid: body.CustomerID, locationid: body.LocationID });
    const getCustomerResult = await acumatica.getCustomer(body.CustomerID);
    let freightPrice = parseFloat(getCustomerLocationsResult[0].custom.FreightPrice.value);
    if (body.ShippingTerms) freightPrice = parseFloat(body.FreightPrice);
    let totalTaxRate = parseFloat(getCustomerLocationsResult[0].custom.totalTaxRate.value);
    const getSumSalesOrderHoldUpResult = await SalesOrderDAO.getSumSalesOrderHoldUp(body.CustomerID);
    const sumSalesOrderHoldUp = getSumSalesOrderHoldUpResult === undefined ? 0.00 : getSumSalesOrderHoldUpResult.sum_sales_order_hold_up;
    const remainingCreditLimit = getCustomerResult.CreditLimit.value - (sumSalesOrderHoldUp * 2);
    let subTotal = 0.00;

    if (details != '') {
      details.forEach(function (item) {
        subTotal += parseFloat(item.OrderQty.value) * parseFloat(item.UnitPrice.value);
      });
      totalAmountSaleOrden += freightPrice;
      totalAmountSaleOrden += parseFloat(((totalTaxRate / 100) * subTotal).toFixed(2));
      totalAmountSaleOrden += subTotal;

      if (totalAmountSaleOrden > remainingCreditLimit) {
        errors.push({ RemainingCreditLimit: "Insufficient credit limit." });
      }
    } else {
      errors.push({ DetailsContent: "Invalid detail." });
    }

    if (Object.keys(errors).length) {
      response.statusCode = 400;
      response.body = JSON.stringify({ data: "", message: "Failed to create sales order.", errors: errors });
    }
    else {
      const scheduledShipmentDate = new Date(body.ScheduledShipmentDate);
      scheduledShipmentDate.setFullYear(scheduledShipmentDate.getFullYear() + 3);

      var body_sns = {
        CustomerID: { value: body.CustomerID },
        Description: { value: 'RSP On Temporary Hold' },
        ShippingSettings: {
          ScheduledShipmentDate: {
            value: scheduledShipmentDate.toISOString().slice(0, 10)
          },
        },
        ShipToAddress: {
          OverrideAddress: {
            value: true
          }
        },
        ShipToContact: {
          OverrideContact: {
            value: true
          }
        },
        Details: details,
        OrderType: { value: body.OrderType },
        LocationID: { value: body.LocationID }
      };

      if (body.CustomerOrder) {
        body_sns.CustomerOrder = { value: body.CustomerOrder };
      } else {
        body_sns.CustomerOrder = { value: '--' };
      }

      //ShippingSettings
      if (body.ShippingTerms && body.ShippingTerms != '') {
        body_sns.ShippingSettings.ShippingTerms = { value: body.ShippingTerms };
      }

      // ShipToAddress
      if (body.AddressLine1 && body.AddressLine1 != '') {
        body_sns.ShipToAddress.AddressLine1 = { value: body.AddressLine1 };
      }
      if (body.State && body.State != '') {
        body_sns.ShipToAddress.State = { value: body.State };
      }
      if (body.City && body.City != '') {
        body_sns.ShipToAddress.City = { value: body.City };
      }
      if (body.PostalCode && body.PostalCode != '') {
        body_sns.ShipToAddress.PostalCode = { value: body.PostalCode };
      }

      // ShipToContact
      if (body.Attention && body.Attention != '') {
        body_sns.ShipToContact.Attention = { value: body.Attention };
      }
      if (body.Phone1 && body.Phone1 != '') {
        body_sns.ShipToContact.Phone1 = { value: body.Phone1 };
      }

      // adding attributes to the body sns - begin
      if (body.PaymentType == "CREDITLINE") {
        //body_sns.Hold = { value: false };
        body_sns.Payments = [];
      }
      body_sns.ExternalRef = { value: SaleOrderId };
      // adding attributes to the body sns - end
      console.log("body_sns", body_sns);

      // body to send to dynamo - begin
      var body_dynamo = {
        SaleOrderId: SaleOrderId,
        CustomerID: body.CustomerID,
        CustomerEmail: email,
        Description: body.Description,
        Details: details,
        OrderType: body.OrderType,
        LocationID: body.LocationID,
        PaymentType: body.PaymentType,
        Payments: body_sns.Payments,
        CreationDate: date,
        ModificationDate: date,
        Hold: false,
        State: 2,
      };
      // body to send to dynamo - end

      // Sending DynamoDB - begin
      /*const params_dynamo = {
        TableName: process.env.DYNAMODB_TABLE_SALEORDER,
        Item: marshall(body_dynamo, { removeUndefinedValues: true }),
      };
      const createOrderDynamoResult = await dynamo.send(new PutItemCommand(params_dynamo));*/
      // Sending DynamoDB - end

      //if (createOrderDynamoResult.$metadata.httpStatusCode == 200) {

      const message_body = {};

      if (file) {
        const timestamp = Date.now();
        const filename_s3 = `${body_dynamo.SaleOrderId}_${timestamp}`;
        const params_send_s3 = {
          Bucket: process.env.BUCKET_RSP,
          Key: `checks/${filename_s3}`,
          Body: file.content,
          ContentType: file.contentType,
          ACL: 'public-read'
        };
        await s3.upload(params_send_s3).promise();
        message_body.filename = filename_s3;
      }

      const createOrderAcumaticaResult = await acumatica.createSalesOrder(body_sns);
      let salesOrder = createOrderAcumaticaResult.data;
      console.log("createOrderAcumaticaResult", createOrderAcumaticaResult);
      if (createOrderAcumaticaResult.status == 200) {
        const getOrderAcumaticaResult = await acumatica.getSalesOrder(createOrderAcumaticaResult.data.OrderNbr.value);
        const getRewardsCustomerResult = await rsp.getClientByIdCustomer(body.CustomerID);
        console.log("getRewardsCustomerResult", getRewardsCustomerResult);
        /*
        let expiration_hour = 24;
        if (getRewardsCustomerResult.id_level == 2) {
          expiration_hour = 48;
        } else if (getRewardsCustomerResult.id_level == 3) {
          expiration_hour = 72;
        }*/

        //const level = 0;
        const hours = {
          0 : 0,
          1 : 24,
          2 : 48,
          3 : 72
        }
        const hours_default = 24;
        const expiration_hour = hours[getRewardsCustomerResult[0].id_level] || hours_default;
        console.log("expiration_hour: ", expiration_hour);
        const expiration_date = moment(date).add(expiration_hour, 'hours').format('YYYY-MM-DD HH:mm:ss');

        const body_sale_order_on_temporary_hold = {
          sales_order_type: createOrderAcumaticaResult.data.OrderType.value,
          sales_order_nbr: createOrderAcumaticaResult.data.OrderNbr.value,
          customer_id: createOrderAcumaticaResult.data.CustomerID.value,
          customer_mail: createOrderAcumaticaResult.data.ShipToContact.Email.value,
          sales_order_total: createOrderAcumaticaResult.data.OrderTotal.value,
          expiration_date: expiration_date,
          status: 'On Temporary Hold'
        };
        console.log("body_sale_order_on_temporary_hold", body_sale_order_on_temporary_hold);

        const createSalesOrderOnTemporaryHoldResult = await rsp.createSalesOrderOnTemporaryHold(body_sale_order_on_temporary_hold);
        console.log("createSalesOrderOnTemporaryHoldResult", createSalesOrderOnTemporaryHoldResult);

        const getCustomerResult = await acumatica.getCustomer(body.CustomerID);
        console.log("getCustomerResult", getCustomerResult);

        let body_update_customer = {
          CustomerID: {
            value: body.CustomerID
          },
          CreditLimit: {
            value: parseFloat(getCustomerResult.CreditLimit.value) + parseFloat(getOrderAcumaticaResult.OrderTotal.value)
          }
        };

        console.log("body_update_customer", body_update_customer);
        const updateCustomer = await acumatica.updateCustomer(body_update_customer);
        console.log("updateCustomer", updateCustomer);
        const action_params_release_from_hold = {
          entity: {
            OrderType: { value: getOrderAcumaticaResult.OrderType.value },
            OrderNbr: { value: getOrderAcumaticaResult.OrderNbr.value }
          }
        };
        await acumatica.actionReleaseFromHold(action_params_release_from_hold);
        console.log("actionReleaseFromHold");

        // Sending message to topic - begin
        if (body.Email && body.Email != '') {
          message_body.saleorder = getOrderAcumaticaResult;
        }

        if (message_body.filename || message_body.saleorder) {

          const params_topic = {
            Message: JSON.stringify(message_body),
            TopicArn: 'arn:aws:sns:us-east-1:241125307495:sls-sqs-test-dev-my-sns-topic',
          };
          await sns.publish(params_topic).promise();
        }
        // Sending message to topic - end

        let datesEmail = {
          orderNumber: salesOrder.OrderNbr.value,
          clientName: salesOrder.ShipToContact.BusinessName.value,
          clientEmail: salesOrder.ShipToContact.Email.value,
          shippingOrder: salesOrder.ShippingSettings.Freight.value,
          taxOrder: salesOrder.TaxTotal.value,
          subTotalOrder: salesOrder.OrderTotal.value,
          paymentMethod: 'CREDITLINE',
          totalOrder: salesOrder.OrderTotal.value,
          date: salesOrder.Date.value.split('T')[0],
          items: [],
          amounts: []
        }

        salesOrder.Details.forEach( detail => {
          datesEmail.items.push(detail.LineDescription.value)
          datesEmail.amounts.push(detail.Amount.value)
        })

        await sendMailPaymentCompleted(datesEmail);

        response.body = JSON.stringify({ data: getOrderAcumaticaResult, message: "Sales order created successfully.", errors: "" });
      }
    }
  } catch (err) {
    response.statusCode = 500;
    response.body = JSON.stringify({ data: "", message: "Failed to create sales order.", errors: err });
  }
  return response;
};

const createQuote = async (event) => {
  const response = { statusCode: 200, headers: _headers_post };

  try {
    let date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    let quoteId = crypto.randomBytes(10).toString('hex');
    const body = await multipartParser.parse(event);
    const details = JSON.parse(body.Details) || '';
    const email = body.Email || '';
    const errors = [];

    if (!body.CustomerID) {
      errors.push({ CustomerID: "CustomerID is empty" });
    }
    if (!body.Description) {
      errors.push({ Description: "Description is empty" });
    }
    if (!Object.keys(details).length) {
      errors.push({ Details: "Details is empty" });
    }
    else {
      details.forEach(function (item, index) {
        if (!item.InventoryID) {
          errors.push({ DetailsContent: "InventoryID is empty in position " + index });
        }
        if (!item.OrderQty) {
          errors.push({ DetailsContent: "OrderQty is empty in position " + index });
        }
        if (!item.UnitPrice) {
          errors.push({ DetailsContent: "UnitPrice is empty in position " + index });
        }
        if (!item.WarehouseID) {
          errors.push({ DetailsContent: "WarehouseID is empty in position " + index });
        }
        if (!item.SQFTPrice) {
          errors.push({ DetailsContent: "SQFTPrice is empty in position " + index });
        }
      });
    }
    if (!body.LocationID) {
      errors.push({ LocationID: "LocationID is empty" });
    }
    if (!body.ScheduledShipmentDate) {
      errors.push({ ScheduledShipmentDate: "ScheduledShipmentDate is empty" });
    }

    if (Object.keys(errors).length) {
      response.statusCode = 400;
      response.body = JSON.stringify({ message: "Failed to create quote.", data: "", errors: errors });
    }
    else {
      const scheduledShipmentDate = new Date(body.ScheduledShipmentDate);
      scheduledShipmentDate.setDate(scheduledShipmentDate.getDate() - 4);

      var body_quote = {
        CustomerID: { value: body.CustomerID },
        Description: { value: body.Description },
        ShippingSettings: {
          ScheduledShipmentDate: {
            value: scheduledShipmentDate.toISOString().slice(0, 10)
          },
        },
        ShipToAddress: {
          OverrideAddress: {
            value: true
          }
        },
        ShipToContact: {
          OverrideContact: {
            value: true
          }
        },
        Details: details,
        OrderType: { value: "QT" },
        LocationID: { value: body.LocationID }
      };

      if (body.CustomerOrder) {
        body_quote.CustomerOrder = { value: body.CustomerOrder };
      } else {
        body_quote.CustomerOrder = { value: '--' };
      }

      //ShippingSettings
      if (body.ShippingTerms && body.ShippingTerms != '') {
        body_quote.ShippingSettings.ShippingTerms = { value: body.ShippingTerms };
      }

      // ShipToAddress
      if (body.AddressLine1 && body.AddressLine1 != '') {
        body_quote.ShipToAddress.AddressLine1 = { value: body.AddressLine1 };
      }
      if (body.State && body.State != '') {
        body_quote.ShipToAddress.State = { value: body.State };
      }
      if (body.PostalCode && body.PostalCode != '') {
        body_quote.ShipToAddress.PostalCode = { value: body.PostalCode };
      }

      // ShipToContact
      if (body.Attention && body.Attention != '') {
        body_quote.ShipToContact.Attention = { value: body.Attention };
      }
      if (body.Phone1 && body.Phone1 != '') {
        body_quote.ShipToContact.Phone1 = { value: body.Phone1 };
      }

      const createQuoteAcumaticaResult = await acumatica.createSalesOrder(body_quote);
      if (createQuoteAcumaticaResult.status == 200) {
        const getQuoteAcumaticaResult = await acumatica.getQuote(createQuoteAcumaticaResult.data.OrderNbr.value);
        const action_params_release_from_hold = {
          entity: {
            OrderType: { value: getQuoteAcumaticaResult.OrderType.value },
            OrderNbr: { value: getQuoteAcumaticaResult.OrderNbr.value }
          }
        };
        await acumatica.actionReleaseFromHold(action_params_release_from_hold);
        response.body = JSON.stringify({
          message: "Quote created successfully",
          data: getQuoteAcumaticaResult,
          errors: "",
        });
      }
    }
  } catch (e) {
    response.statusCode = 500;
    response.body = JSON.stringify({
      message: "Failed to create quote.",
      data: "",
      errors: e,
    });
  }
  return response;
};

const cancelExpiredSalesOrders = async (event) => {

  try {
    const credentials = { "name": "RSP_cron", "password": "123456" };
    const getExpiredSalesOrdersResult = await rsp.getExpiredSalesOrders();
    const login = await acumatica.loginAcumatica(credentials);
    const cookie = login.companyid + "; " + login.userbranch + "; " + login.token + "; " + login.sessionid + "; " + login.locale;

    for (var i = 0; i < getExpiredSalesOrdersResult.length; i++) {
      const customer_id = getExpiredSalesOrdersResult[i].customer_id;
      const sales_order_total = getExpiredSalesOrdersResult[i].sales_order_total;
      const sales_order_nbr = getExpiredSalesOrdersResult[i].sales_order_nbr;
      const sales_order_type = getExpiredSalesOrdersResult[i].sales_order_type;
      const releaseSalesOrderHoldUpResult = await rsp.releaseSalesOrderOnTemporaryHold('Expired', sales_order_nbr);

      if (releaseSalesOrderHoldUpResult.affectedRows > 0) {
        const getCustomerResult = await acumatica.getCustomer(customer_id, cookie);
        if (getCustomerResult.CustomerID.value) {
          const body_update_customer = {
            CustomerID: { value: customer_id },
            CreditLimit: { value: parseFloat(getCustomerResult.CreditLimit.value) - parseFloat(sales_order_total) }
          };
          const updateCustomerResult = await acumatica.updateCustomer(body_update_customer, cookie);
          console.log("updateCustomerResult", updateCustomerResult.status);
          const action_on_hold = { entity: { OrderType: { value: sales_order_type }, OrderNbr: { value: sales_order_nbr } } };
          const actionOnHoldSalesOrderResult = await acumatica.actionOnHoldSalesOrder(action_on_hold, cookie);
          console.log("actionOnHoldSalesOrderResult.status", actionOnHoldSalesOrderResult.status);
        }
      }
    }
  } catch (e) {
    console.log("errors", e);
  }
};

/*const updateOrder = async (event) => {
  const response = { statusCode: 200 };

  try {
    const body = JSON.parse(event.body);
    const objKeys = Object.keys(body);
    const params = {
      TableName: process.env.DYNAMODB_TABLE_SALEORDER,
      Key: marshall({ SaleOrderId: event.pathParameters.OrderId }),
      UpdateExpression: `SET ${objKeys.map((_, index) => `#key${index} = :value${index}`).join(", ")}`,
      ExpressionAttributeNames: objKeys.reduce((acc, key, index) => ({
        ...acc,
        [`#key${index}`]: key,
      }), {}),
      ExpressionAttributeValues: marshall(objKeys.reduce((acc, key, index) => ({
        ...acc,
        [`:value${index}`]: body[key],
      }), {})),
    }
    const updateResult = await dynamo.send(new UpdateItemCommand(params));
    response.body = JSON.stringify({
      //message: "Successfully updated order",
      data: updateResult,
      errors: ""
    });
  } catch (e) {
    response.statusCode = 500;
    response.body = JSON.stringify({
      //message: "Failed to update order.",
      data: "",
      errors: e.message,
      errorStack: e.stack,
    });
  }

  return response;
};*/

const getColors = async () => {
  const response = { statusCode: 200, headers: _headers_get };

  try {
    const params1 = {
      TableName: process.env.DYNAMODB_TABLE_COLOR,
      FilterExpression: '#Type = :type and #Status = :status',
      ExpressionAttributeValues: {
        ':status': { N: "1" },
        ':type': { S: "Primary" }
      },
      ExpressionAttributeNames: {
        '#Status': "Status",
        '#Type': "Type"
      }
    };

    const params2 = {
      TableName: process.env.DYNAMODB_TABLE_COLOR,
      FilterExpression: '#Status = :status AND #Type = :type',
      ExpressionAttributeValues: {
        ':status': { N: "1" },
        ':type': { S: "Secondary" }
      },
      ExpressionAttributeNames: {
        '#Status': "Status",
        '#Type': "Type"
      }
    };

    const PrimaryItems = await dynamo.send(new ScanCommand(params1));
    const SecondaryItems = await dynamo.send(new ScanCommand(params2));
    const PrimaryItemsFormat = PrimaryItems.Items.map((item) => unmarshall(item));
    const SecondaryItemsFormat = SecondaryItems.Items.map((item) => unmarshall(item));

    for (var i = 0; i < PrimaryItemsFormat.length; i++) {
      PrimaryItemsFormat[i]['Details'] = [];
      for (var j = 0; j < SecondaryItemsFormat.length; j++) {
        if (PrimaryItemsFormat[i]['Color'] == SecondaryItemsFormat[j]['Color']) {
          PrimaryItemsFormat[i]['Details'].push(SecondaryItemsFormat[j]);
        }
      }
    }

    PrimaryItemsFormat.sort(function (a, b) {
      return parseFloat(a.Weight) - parseFloat(b.Weight);
    });

    response.body = JSON.stringify({
      //message: "Successfully retrieved all colors.",
      data: PrimaryItemsFormat,
      errors: ""
    });
  } catch (e) {
    console.error(e);
    response.statusCode = 500;
    response.body = JSON.stringify({
      //message: "Failed to retrieve colors.",
      data: "",
      errors: e.message,
      errorStack: e.stack,
    });
  }

  return response;
};

const getCustomer = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const CustomerID = event.pathParameters.customerid;
  
  acumatica.getCustomer(CustomerID)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const getCustomers = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const params = event.queryStringParameters;
  acumatica.getCustomers(params)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const getSalesPerson = (event, context, callback) => {
  console.log("iNGRESO A LA FUNCION");
  context.callbackWaitsForEmptyEventLoop = false;
  const SalesPersonID = event.pathParameters.salespersonid;
  acumatica.getSalesPerson(SalesPersonID)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const getCustomerLocations = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const params = event.queryStringParameters;
  acumatica.getCustomerLocations(params)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const createCustomerLocations = async (event) => {
  const response = { statusCode: 200, headers: _headers_post };
  try {
    const body = await multipartParser.parse(event);
    console.log("body", body);
    const errors = [];

    // validations - begin
    if (!body.CustomerID) {
      errors.push({ CustomerID: "CustomerID is empty" });
    }
    if (!body.LocationID) {
      errors.push({ LocationID: "LocationID is empty" });
    } else {
      const getCustomerLocationsResult = await acumatica.getCustomerLocations({ customerid: body.CustomerID, locationid: body.LocationID });
      console.log("getCustomerLocationsResult", getCustomerLocationsResult);
      console.log("getCustomerLocationsResult.length", getCustomerLocationsResult.length);
      if (getCustomerLocationsResult.length !== 0) {
        errors.push({ LocationID: "LocationID already exists." });
      }
    }
    if (!body.LocationName) {
      errors.push({ LocationName: "LocationName is empty" });
    }
    if (!body.Country) {
      errors.push({ Country: "Country is empty" });
    }
    if (!body.State) {
      errors.push({ State: "State is empty" });
    }
    if (!body.City) {
      errors.push({ City: "City is empty" });
    }
    if (!body.AddressLine1) {
      errors.push({ AddressLine1: "AddressLine1 is empty" });
    }
    if (!body.PostalCode) {
      errors.push({ PostalCode: "PostalCode is empty" });
    }
    if (!body.Attention) {
      errors.push({ Attention: "Attention is empty" });
    }
    if (!body.Phone1) {
      errors.push({ Phone1: "Phone1 is empty" });
    }
    if (!body.ShippingTerms) {
      errors.push({ ShippingTerms: "ShippingTerms is empty" });
    }
    if (!body.TaxZone) {
      errors.push({ TaxZone: "TaxZone is empty" });
    }
    // validations - end

    if (Object.keys(errors).length) {
      response.statusCode = 400;
      response.body = JSON.stringify({
        data: "",
        message: "Customer location creation failed.",
        errors: errors,
      });
    } else {
      var body_create_customer_location = {
        CustomerID: { value: body.CustomerID },
        LocationID: { value: body.LocationID },
        LocationAddress: {
          Override: { value: true },
          LocationName: { value: body.LocationName },
          Country: { value: body.Country },
          State: { value: body.State },
          City: { value: body.City },
          AddressLine1: { value: body.AddressLine1 },
          PostalCode: { value: body.PostalCode },
        },
        LocationAdditionalInfo: {
          Override: { value: true },
          Attention: { value: body.Attention },
          Phone1: { value: body.Phone1 }
        },
        ShippingInstructions: {
          ShippingTerms: { value: body.ShippingTerms }
        },
        ShippingTax: {
          TaxZone: { value: body.TaxZone }
        }
      };

      console.log("body_create_customer_location", body_create_customer_location);

      const createCustomerLocationResult = await acumatica.createCustomerLocations(body_create_customer_location);
      console.log("createCustomerLocationResult", createCustomerLocationResult);

      if (createCustomerLocationResult.status == 200) {

        const getTaxResult = await acumatica.getTax({ taxzoneid: body.TaxZone });
        createCustomerLocationResult.data.custom.taxDetail = getTaxResult.detail;
        createCustomerLocationResult.data.custom.totalTaxRate = getTaxResult.totalTaxRate;

        response.body = JSON.stringify({
          data: createCustomerLocationResult.data,
          errors: ""
        });
      }
    }
  } catch (e) {
    response.statusCode = 500;
    response.body = JSON.stringify({
      data: "",
      errors: e.message,
    });
  }
  return response;
};

/*const getQuotes = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const params = event.queryStringParameters;
  acumatica.getQuotes(params)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};*/

const getPaymentMethods = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  acumatica.getPaymentMethods()
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

/*const getEta = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const params = event.queryStringParameters;
  acumatica.getEta(params)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};*/

const getInventoryInquiry = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  acumatica.getInventoryInquiry()
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const getInventoryInquiryGrouped = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const params = event.queryStringParameters || '';
  acumatica.getInventoryInquiryGrouped(params)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const getMoldings = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const params = event.queryStringParameters || '';
  acumatica.getMoldings(params)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const getInvoices = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const params = event.queryStringParameters;
  acumatica.getInvoices(params)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const getInvoice = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const referenceNbr = event.pathParameters.referenceNbr;
  acumatica.getInvoice(referenceNbr)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const getCountries = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  acumatica.getCountries()
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const getStates = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const params = event.queryStringParameters;
  acumatica.getStates(params)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const getTaxZones = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const params = event.queryStringParameters;
  acumatica.getTaxZones(params)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

/*const getTax = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const params = event.queryStringParameters;
  acumatica.getTax(params)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};*/

const updateRewardsLevelInAcumatica = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  acumatica.updateRewardsLevelInAcumatica()
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const processRewardsPoints = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  let response = {};
  const RSP_REWARDS_LEVEL = "RSP_REWARDS_LEVEL";
  const RSP_REWARDS_CLIENT = "RSP_REWARDS_CLIENT";
  const RSP_REWARDS_POINT = "RSP_REWARDS_POINT";
  const RSP_REWARDS_POINT_DETAIL = "RSP_REWARDS_POINT_DETAIL";
  const RSP_REWARDS_CLIENT_LEVEL_RECORD = "RSP_REWARDS_CLIENT_LEVEL_RECORD";

  try {
    
    const credentials = {
      "name": "RSP_cron",
      "password": "123456"
    };
    const login = await acumatica.loginAcumatica(credentials);
    console.log("login: ", login);
    const cookie = login.companyid + "; " + login.userbranch + "; " + login.token + "; " + login.sessionid + "; " + login.locale;
    const clients = await BaseDAO.getAll(RSP_REWARDS_CLIENT);
    const levels = await BaseDAO.getAll(RSP_REWARDS_LEVEL);
    const points = await BaseDAO.getAll(RSP_REWARDS_POINT);
    console.log("clientes: ", clients);
    console.log("levels: ", levels);
    console.log("points: ", points);
    //clients.map(async (client) => {
    for (let i = 0; i < clients.length; i++) {
      console.log("customer: ", clients[i].id_customer);
      let current_customer_level = clients[i].id_level;
      let amount_ytd = clients[i].amount_ytd;
      let total_points_client = clients[i].total_points;
      let config = {
        method: 'get',
        url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/SalesInvoice?$filter=CustomerID%20eq%20'${clients[i].id_customer}'%20and%20Type%20eq%20'Invoice'and%20Date%20ge%20datetimeoffset'2023-03-01T00:58:57.837-08:00'`,
        headers: { 'Cookie': cookie }
      };

      let invoices = await axios(config);
      let invoicesFilter = [];

      for (let j = 0; j < invoices.data.length; j++) {
        if ((invoices.data[j]['Status'].value == 'Closed' || invoices.data[j]['Status'].value == 'Open') && invoices.data[j]['Amount'].value > 0) {
          invoicesFilter.push(invoices.data[j]);
        }
      }
      console.log("cantidad invoices: ", invoicesFilter.length);
      //invoicesFilter.map(async (invoice) => {
      for (let k = 0; k < invoicesFilter.length; k++) {
        let invoice_nbr = invoicesFilter[k].ReferenceNbr.value;
        let exists_invoice = await rsp.getPointByInvoiceNbr(invoice_nbr);
        console.log("exist invoice: ", exists_invoice);

        let invoice_due_date = new Date(invoicesFilter[k].DueDate.value).toISOString().replace(/T/, ' ').replace(/\..+/, '');
        console.log((clients[i].id_customer === invoicesFilter[k].CustomerID.value) && !exists_invoice.length);
        if (clients[i].id_customer === invoicesFilter[k].CustomerID.value && !exists_invoice.length) {
          let invoice_amount = invoicesFilter[k].Amount.value;
          let data_insert_point = {
            id_client: clients[i].id_client,
            total_points: 0,
            invoice_nbr: invoice_nbr,
            invoice_due_date: invoice_due_date,
            invoice_amount: invoice_amount,
          };
          // insert point
          let response_insert_point = await BaseDAO.insert(RSP_REWARDS_POINT, data_insert_point);
          console.log("insert: ", response_insert_point)
          let remaining = 0.00;
          let total_points = 0.00;
          //levels.map(async (level) => {
          for (let l = 0; l < levels.length; l++) {
            let initial_rank = levels[l].initial_rank;
            let end_rank = levels[l].end_rank;
            let current_level = levels[l].id_level;
            let factor = levels[l].factor;
            let amount_detail = 0;
            let point_detail = 0;
            //let range_difference = end_rank;// - initial_rank;
            let ramaining_amount = end_rank - amount_ytd;

            if (current_customer_level == current_level) {
              //if (end_rank != 0.00) {
              //let ramaining_amount = end_rank - amount_ytd;
              if (remaining > 0.00) {
                amount_detail = remaining;
                amount_ytd += remaining;
                console.log("1.invoice_nbr", invoice_nbr);
                console.log("1.ramaining_amount", ramaining_amount);
                console.log("1.amount_ytd", amount_ytd);
              } else {
                if (invoice_amount > ramaining_amount) {
                  if (Math.sign(ramaining_amount) == -1) {
                    amount_detail = invoice_amount;
                    amount_ytd += invoice_amount;
                    console.log("2.invoice_nbr", invoice_nbr);
                    console.log("2.ramaining_amount", ramaining_amount);
                    console.log("2.amount_ytd", amount_ytd);
                  } else {
                    amount_detail = ramaining_amount;
                    remaining = invoice_amount - ramaining_amount;
                    amount_ytd += ramaining_amount;
                    current_customer_level += 1;
                    let data_insert_client_level_record = {
                      id_client: clients[i].id_client,
                      id_level_current: current_customer_level,
                      id_level_previous: current_level,
                      amount_current: 0,
                      amount_previous: 0,
                    };

                    if (current_customer_level <= 3) {
                      await BaseDAO.insert(RSP_REWARDS_CLIENT_LEVEL_RECORD, data_insert_client_level_record);
                      await BaseDAO.update(RSP_REWARDS_CLIENT, { id_level: current_customer_level, moved_up_class: 1 }, `id_client=${clients[i].id_client}`);
                    }
                    console.log("3.invoice_nbr", invoice_nbr);
                    console.log("3.ramaining_amount", ramaining_amount);
                    console.log("3.amount_ytd", amount_ytd);
                  }
                } else {
                  amount_detail = invoice_amount;
                  amount_ytd += invoice_amount;
                  console.log("4.invoice_nbr", invoice_nbr);
                  console.log("4.ramaining_amount", ramaining_amount);
                  console.log("4.amount_ytd", amount_ytd);
                }
              }

              point_detail = amount_detail * factor;
              total_points += point_detail;

              let data_insert_point_detail = {
                id_point: response_insert_point.insertId,
                amount: amount_detail,
                factor: factor,
                points: point_detail
              };
              await BaseDAO.insert(RSP_REWARDS_POINT_DETAIL, data_insert_point_detail);
            }
          };

          let data_update_point = {
            total_points: total_points
          };
          await BaseDAO.update(RSP_REWARDS_POINT, data_update_point, `id_point=${response_insert_point.insertId}`);

          total_points_client += total_points;
        }
      };

      await BaseDAO.update(RSP_REWARDS_CLIENT, { amount_ytd: amount_ytd, total_points: total_points_client }, `id_client=${clients[i].id_client}`);
    };
  } catch (e) {
    console.log("error", e);
  }

  return response;
}

/*const getCustomerBusinessApp = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const id = event.pathParameters.id;
  rsp.getCustomerBusinessApp(id)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};*/

const createCustomerBusinessApp = async (event, context, callback) => {
  const response = { statusCode: 200, headers: _headers_post };
  try {
    const body = await multipartParser.parse(event);
    console.log("cuerpo de body", body);
    const file = body.files[0] || '';
    const errors = [];
    let url_file = ``;
    if (!body.IdCompanyType) {
      errors.push({ IdCompanyType: "IdCompanyType is empty" });
    }
    if (!body.TypeCreation) {
      errors.push({ TypeCreation: "TypeCreation is empty" });
    } else {
      if (body.TypeCreation == "OTPCODE") {
        if (!body.IdOtpCode) {
          errors.push({ IdOtpCode: "IdOtpCode is empty" });
        }
      } else if (body.TypeCreation == "CONTACT") {
        if (!body.IdContact) {
          errors.push({ IdContact: "IdContact is empty" });
        }
      } else {
        errors.push({ TypeCreation: "Invalid creation type." });
      }
    }
    if (!body.CompanyName) {
      errors.push({ CompanyName: "CompanyName is empty" });
    }
    if (!body.PhoneNumber) {
      errors.push({ PhoneNumber: "PhoneNumber is empty" });
    }
    if (!body.Mail) {
      errors.push({ Mail: "Mail is empty" });
    }
    if (!body.StreetAddress1) {
      errors.push({ StreetAddress1: "StreetAddress1 is empty" });
    }
    if (!body.State) {
      errors.push({ State: "State is empty" });
    }
    if (!body.City) {
      errors.push({ City: "City is empty" });
    }
    if (!body.ZipCode) {
      errors.push({ ZipCode: "ZipCode is empty" });
    }
    if (!body.TaxZone) {
      errors.push({ TaxZone: "TaxZone is empty" });
    }
    if (!body.FederalIdNumber) {
      errors.push({ FederalIdNumber: "FederalIdNumber is empty" });
    }
    if (!body.ResaleCertificate) {
      errors.push({ ResaleCertificate: "ResaleCertificate is empty" });
    } else {
      if (body.ResaleCertificate == 1) {
        if (!body.ResaleCertificateNumber) {
          errors.push({ ResaleCertificateNumber: "ResaleCertificateNumber is empty" });
        }
        if (file == '') {
          errors.push({ File: "You must attach a file." });
        }
      }
    }
    if (!body.CreditConditions) {
      errors.push({ CreditConditions: "CreditConditions is empty" });
    } else {
      if (body.CreditConditions == 1) {
        if (!body.PayableContactFirtsName) {
          errors.push({ PayableContactFirtsName: "PayableContactFirtsName is empty" });
        }
        if (!body.PayableContactLastName) {
          errors.push({ PayableContactLastName: "PayableContactLastName is empty" });
        }
        if (!body.PayableContactPhone) {
          errors.push({ PayableContactPhone: "PayableContactPhone is empty" });
        }
        if (!body.PayableContactMail) {
          errors.push({ PayableContactMail: "PayableContactMail is empty" });
        }
        if (!body.BillAddressStreetAddress1) {
          errors.push({ BillAddressStreetAddress1: "BillAddressStreetAddress1 is empty" });
        }
        if (!body.BillAddressCity) {
          errors.push({ BillAddressCity: "BillAddressCity is empty" });
        }
        if (!body.BillAddressState) {
          errors.push({ BillAddressState: "BillAddressState is empty" });
        }
        if (!body.BillAddressZipCode) {
          errors.push({ BillAddressZipCode: "BillAddressZipCode is empty" });
        }
      }
    }
    if (!body.TermsAndConditions) {
      errors.push({ TermsAndConditions: "TermsAndConditions is empty" });
    }
    if (!body.Password) {
      errors.push({ Password: "Password is empty" });
    }

    if (Object.keys(errors).length) {
      response.statusCode = 400;
      response.body = JSON.stringify({
        message: "Failed to create customer business app.",
        data: "",
        errors: errors,
      });
    } else {

      if (body.TypeCreation == "CONTACT") {
        if (body.ResaleCertificate == 1) {
          const filename = `resale_${body.IdContact}`;
          const send_to_s3 = {
            Bucket: process.env.BUCKET_RSP,
            Key: `resale/${filename}`,
            Body: file.content,
            ContentType: file.contentType,
            ACL: 'public-read'
          };
          console.log("send_to_s3", send_to_s3);
          const uploadResult = await s3.upload(send_to_s3).promise();
          url_file = `https://rspgallery-dev.s3.amazonaws.com/resale/${filename}`;
          console.log("uploadResult", uploadResult);
        }
        else {
          url_file = ``;
        }
      }

      let data = {
        id_company_type: body.IdCompanyType,
        id_contact: body.IdContact || null,
        id_otp_code: body.IdOtpCode || null,
        company_name: body.CompanyName || null,
        phone_number: body.PhoneNumber || null,
        fax_number: body.FaxNumber || null,
        mail: body.Mail || null,
        street_address_1: body.StreetAddress1 || null,
        street_address_2: body.StreetAddress2 || null,
        state: body.State || null,
        city: body.City || null,
        zip_code: body.ZipCode || null,
        tax_zone: body.TaxZone || null,
        federal_id_number: body.FederalIdNumber || null,
        resale_certificate: body.ResaleCertificate,
        url_file: url_file,
        resale_certificate_number: body.ResaleCertificateNumber || null,
        credit_conditions: body.CreditConditions,
        terms_and_conditions: body.TermsAndConditions,
        payable_contact_firts_name: body.PayableContactFirtsName || null,
        payable_contact_last_name: body.PayableContactLastName || null,
        payable_contact_phone: body.PayableContactPhone || null,
        payable_contact_fax: body.PayableContactFax || null,
        payable_contact_mail: body.PayableContactMail || null,
        bill_address_street_address_1: body.BillAddressStreetAddress1 || null,
        bill_address_street_address_2: body.BillAddressStreetAddress2 || null,
        bill_address_city: body.BillAddressCity || null,
        bill_address_state: body.BillAddressState || null,
        bill_address_zip_code: body.BillAddressZipCode || null,
        bank_info_savings_account: body.BankInfoSavingsAccount || null,
        bank_info_checking_account: body.BankInfoCheckingAccount || null,
        bank_info_other_account: body.BankInfoOtherAccount || null,
        password: body.Password || null,
      };

      let createCustomerBusinessAppResult = await rsp.createCustomerBusinessApp(body.TypeCreation, data);
      let getStateByStateIdResult = await StateDAO.getStateByStateId(body.State);

      if (body.TypeCreation == "OTPCODE") {
        let customer_data = {
          General: {
            AccountName: { value: createCustomerBusinessAppResult.company_name },
            AddressLine1: { value: createCustomerBusinessAppResult.street_address_1 },
            AddressLine2: { value: createCustomerBusinessAppResult.street_address_2 },
            State: { value: createCustomerBusinessAppResult.state },
            City: { value: createCustomerBusinessAppResult.city },
            PostalCode: { value: createCustomerBusinessAppResult.zip_code },
            Email: { value: createCustomerBusinessAppResult.mail },
            Phone1: { value: createCustomerBusinessAppResult.phone_number },
            Phone1Type: { value: "Business 1" },
            Fax: { value: createCustomerBusinessAppResult.fax_number },
            FaxType: { value: "Fax" },
          },
          ShipToAddress: {
            Override: { value: true },
            AddressLine1: { value: createCustomerBusinessAppResult.street_address_1 },
            AddressLine2: { value: createCustomerBusinessAppResult.street_address_2 },
            City: { value: createCustomerBusinessAppResult.city },
            PostalCode: { value: createCustomerBusinessAppResult.zip_code },
            State: { value: createCustomerBusinessAppResult.state },
            TaxRegistrationID: { value: createCustomerBusinessAppResult.federal_id_number },
            TaxExemptionNumber: { value: createCustomerBusinessAppResult.resale_certificate_number || '' },
            TaxZone: { value: createCustomerBusinessAppResult.tax_zone },
          },
          Salespersons: [
            {
              SalespersonID: { value: getStateByStateIdResult.salesperson_id },
              LocationID: { value: "MAIN" }
            }
          ]
        };

        if (body.CreditConditions == 1) {
          customer_data.BillToAddress = {
            Override: { value: true },
            AddressLine1: { value: createCustomerBusinessAppResult.bill_address_street_address_1 },
            AddressLine2: { value: createCustomerBusinessAppResult.bill_address_street_address_2 },
            City: { value: createCustomerBusinessAppResult.bill_address_city },
            PostalCode: { value: createCustomerBusinessAppResult.bill_address_zip_code },
            State: { value: createCustomerBusinessAppResult.bill_address_state }
          };
          customer_data.Financial = {
            CheckingAccount: { value: createCustomerBusinessAppResult.bank_info_checking_account || '' },
            SavingAccount: { value: createCustomerBusinessAppResult.bank_info_savings_account || '' },
            OtherAccount: { value: createCustomerBusinessAppResult.bank_info_other_account || '' }
          };
        }

        let createCustomerAcumaticaResult = await acumatica.updateCustomer(customer_data);

        if (body.CreditConditions == 1) {
          let contact_data = {
            FirstName: { value: createCustomerBusinessAppResult.payable_contact_firts_name },
            LastName: { value: createCustomerBusinessAppResult.payable_contact_last_name },
            JobTitle: { value: "Accounts Payable Contact" },
            Email: { value: createCustomerBusinessAppResult.payable_contact_mail },
            Phone1: { value: createCustomerBusinessAppResult.payable_contact_phone },
            Phone1Type: { value: "Business 1" },
            Fax: { value: createCustomerBusinessAppResult.payable_contact_fax },
            FaxType: { value: "Fax" },
            BusinessAccount: { value: createCustomerAcumaticaResult.data.CustomerID.value }
          };
          await acumatica.createContact(contact_data);
        }

        if (body.ResaleCertificate == 1) {
          await acumatica.addFileToCustomer(createCustomerAcumaticaResult.data.CustomerID.value, file);
        }

        let rewards_client_data = {
          id_customer: createCustomerAcumaticaResult.data.CustomerID.value,
          id_level: 1,
          id_business_app: createCustomerBusinessAppResult.id_business_app
        };

        await rsp.createRewardsClient(rewards_client_data);

        let data_cognito = {
          email: createCustomerAcumaticaResult.data.Email.value,
          customerid: createCustomerAcumaticaResult.data.CustomerID.value,
          role: "CUSTOMER",
          password: createCustomerBusinessAppResult.password
        };
        await cognito.createUser(data_cognito);
      }

      response.body = JSON.stringify({ message: "Customer business app created successfully.", data: createCustomerBusinessAppResult, errors: "" });
    }
  } catch (err) {
    response.statusCode = 500;
    response.body = JSON.stringify({ message: "Failed to create customer business app.", data: "", errors: err });
  }
  return response;
};

const disapproveContactRequest = async (event, context, callback) => {
  const response = { statusCode: 200, headers: _headers_post };
  try {
    const body = await multipartParser.parse(event);
    const errors = [];

    if (!body.IdContact) {
      errors.push({ IdContact: "IdContact is empty" });
    }
    if (!body.idDisapprovReason) {
      errors.push({ idDisapprovReason: "idDisapprovReason is empty" });
    }
    if (!body.Descrip) {
      errors.push({ Descrip: "Comments is empty" });
    }
    if (Object.keys(errors).length) {
      response.statusCode = 400;
      response.body = JSON.stringify({
        message: "Failed to disapprove contact request.",
        errors: errors,
      });
    } else {
      let data = {
        id_disapprov_reason: body.idDisapprovReason,
        descrip: body.Descrip,
      };
      let idContact = body.IdContact;
      let createContactComments = await rsp.createComments(data, idContact);

      response.body = JSON.stringify({ data: createContactComments, message: "Contact request successfully disapproved.", errors: "" });
    }
  } catch (err) {
    response.statusCode = 500;
    response.body = JSON.stringify({ data: "", message: "Failed to disapprove contact request", errors: err });
  }
  return response;
};


const approveContactRequest = async (event, context, callback) => {
  const response = { statusCode: 200, headers: _headers_post };
  try {
    const body = await multipartParser.parse(event);
    const errors = [];
    console.log("Body" , body)

    if (!body.IdContact) {
      errors.push({ IdContact: "IdContact is empty" });
    }

    if (Object.keys(errors).length) {
      response.statusCode = 400;
      response.body = JSON.stringify({
        data: "",
        message: "Failed to approve contact request.",
        errors: errors,
      });
    } else {

      let getCustomerByContactId = await rsp.getCustomerByContactId(body.IdContact);

      let getContactByIdResult = JSON.parse(JSON.stringify(getCustomerByContactId))[0]

      let getStateByStateIdResult = await StateDAO.getStateByStateId(getContactByIdResult.state); // devuelve estado y datos del salesperson
      
      let salesPersonId = JSON.parse(JSON.stringify(getStateByStateIdResult)).salesperson_id

      let customer_data = {
        General: {
          AccountName: { value: getContactByIdResult.company_name || null },
          AddressLine1: { value: getContactByIdResult.street_address_1 || null },
          AddressLine2: { value: getContactByIdResult.street_address_2 || null },
          State: { value: getContactByIdResult.state || null },
          City: { value: getContactByIdResult.city || null },
          PostalCode: { value: getContactByIdResult.zip_code || null },
          Email: { value: getContactByIdResult.mail || null },
          Phone1: { value: getContactByIdResult.phone_number || null },
          Phone1Type: { value: "Business 1" },
          Fax: { value: getContactByIdResult.fax_number || null },
          FaxType: { value: "Fax" },
        },
        ShipToAddress: {
          Override: { value: true },
          AddressLine1: { value: getContactByIdResult.street_address_1 || null },
          AddressLine2: { value: getContactByIdResult.street_address_2 || null },
          City: { value: getContactByIdResult.city || null },
          PostalCode: { value: getContactByIdResult.zip_code || null },
          State: { value: getContactByIdResult.state || null },
          TaxRegistrationID: { value: getContactByIdResult.federal_id_number || null },
          TaxExemptionNumber: { value: getContactByIdResult.resale_certificate_number || null },
          TaxZone: { value: getContactByIdResult.tax_zone || null },
        },
        Salespersons: [
          {
            SalespersonID: { value: salesPersonId },
            LocationID: { value: "MAIN" }
          }
        ]
      };

      if (getContactByIdResult.credit_conditions == 1) {
        console.log("getContactByIdResult.credit_conditions", getContactByIdResult.credit_conditions);
        customer_data.BillToAddress = {
          Override: { value: true },
          AddressLine1: { value: getContactByIdResult.bill_address_street_address_1 || null },
          AddressLine2: { value: getContactByIdResult.bill_address_street_address_2 || null },
          City: { value: getContactByIdResult.bill_address_city || null },
          PostalCode: { value: getContactByIdResult.bill_address_zip_code || null },
          State: { value: getContactByIdResult.bill_address_state || null }
        }
      }
      console.log("customer_data", customer_data);
      let createCustomerAcumaticaResult = await acumatica.updateCustomer(customer_data);
      console.log("create customer Acumatica", createCustomerAcumaticaResult);

      if (getContactByIdResult.url_file !== '') {
        let url_resale = `resale/resale_${getContactByIdResult.id_contact}`;
        const get_to_s3 = {
          Bucket: process.env.BUCKET_RSP,
          Key: url_resale,
          ResponseContentType: "image/jpeg"
        };
        const fileObject = await s3.getObject(get_to_s3).promise();
        console.log("fileObject", fileObject);
        const img_file = fileObject[6]; //await multipartParser.parse(fileObject);
        console.log("SOLO IMG", img_file);
        //const file = img_file;

        await acumatica.addFileToContactCustomer(createCustomerAcumaticaResult.data.CustomerID.value, fileObject);
      }

      if (getContactByIdResult.credit_conditions == 1) {
        let contact_data = {
          FirstName: { value: getContactByIdResult.payable_contact_firts_name || null },
          LastName: { value: getContactByIdResult.payable_contact_last_name || null },
          JobTitle: { value: "Accounts Payable Contact" },
          Email: { value: getContactByIdResult.payable_contact_mail || null },
          Phone1: { value: getContactByIdResult.payable_contact_phone || null },
          Phone1Type: { value: "Business 1" },
          Fax: { value: getContactByIdResult.payable_contact_fax || null },
          FaxType: { value: "Fax" },
          BusinessAccount: { value: createCustomerAcumaticaResult.data.CustomerID.value }
        };
        let createContactAcumaticaResult = await acumatica.createContact(contact_data);
        console.log("createContactAcumaticaResult", createContactAcumaticaResult);
      }



      let rewards_client_data = {
        id_customer: createCustomerAcumaticaResult.data.CustomerID.value,
        id_level: 1,
        id_business_app: getContactByIdResult.id_business_app
      };

      await rsp.createRewardsClient(rewards_client_data);

      let data_cognito = {
        email: createCustomerAcumaticaResult.data.Email.value,
        customerid: createCustomerAcumaticaResult.data.CustomerID.value,
        role: "CUSTOMER",
        password: getContactByIdResult.password
      };
      await cognito.createUser(data_cognito);
      await BaseDAO.update(process.env.RSP_CONTACT, { status: process.env.STATUS_PPROVED_CONTACT }, `id_contact=${body.IdContact}`);

      response.body = JSON.stringify({
        data: getContactByIdResult,
        message: "Contact request successfully approved.",
        errors: "",
      });
    }
  } catch (e) {
    response.statusCode = 500;
    response.body = JSON.stringify({
      data: "",
      errors: e.message,
      errorStack: e.stack,
    });
  }
  return response;
};

const getDashboardSummary = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const params = event.queryStringParameters;
  acumatica.getDashboardSummary(params)
    .then((res) => {
      console.log("res", res);
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const getSalesPersonDashboardSummary = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const params = event.queryStringParameters;
  acumatica.getSalesPersonDashboardSummary(params)
    .then((res) => {
      console.log("res", res);
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const getShipments = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const params = event.queryStringParameters;
  acumatica.getShipments(params)
    .then((res) => {
      callback(null, { statusCode: 200, headers: _headers_get, body: JSON.stringify({ data: res, errors: "" }) });
    }).catch((err) => {
      callback(null, { statusCode: 500, headers: _headers_get, body: JSON.stringify({ data: [], errors: err }) });
    });
};

const notifySalesOrderDeadlineOnTemporaryHold = async (event) => {

  try {
    const getSalesOrdersOnTemporaryHoldResult = await SalesOrderDAO.getSalesOrdersOnTemporaryHold();

    for (var i = 0; i < getSalesOrdersOnTemporaryHoldResult.length; i++) {
      const id_notification_sales_order = getSalesOrdersOnTemporaryHoldResult[i].id_notification_sales_order;
      const sales_order_nbr = getSalesOrdersOnTemporaryHoldResult[i].sales_order_nbr;
      const time_left = getSalesOrdersOnTemporaryHoldResult[i].time_left;
      const customer_mail = getSalesOrdersOnTemporaryHoldResult[i].customer_mail;
      const notifySalesOrderDeadlineOnTemporaryHoldResult = await mailings.notifySalesOrderDeadlineOnTemporaryHold(id_notification_sales_order, sales_order_nbr, time_left, customer_mail);
      console.log("notifySalesOrderDeadlineOnTemporaryHoldResult", notifySalesOrderDeadlineOnTemporaryHoldResult);
    }
  } catch (err) {
    console.log("err", err);
  }
};

const addFilesSalesOrderOnTemporaryHold = async (event, context, callback) => {
  const response = { statusCode: 200, headers: _headers_post };
  try {
    const body = await multipartParser.parse(event);
    const file = body.files[0] || '';
    const errors = [];

    if (file == '') {
      errors.push({ file: "Need to upload a file" });
    }
    if (Object.keys(errors).length) {
      response.statusCode = 400;
      response.body = JSON.stringify({
        message: "The file could not be uploaded.",
        errors: errors,
      });
    } else {
      //const fileName = file.filename.split('.');
      const sendParamsS3 = {
        Bucket: process.env.BUCKET_RSP,
        Key: `sales_order/${file.filename}`,
        Body: file.content,
        ContentType: file.contentType,
        ACL: 'public-read'
      };
      await s3.upload(sendParamsS3).promise();
      response.body = JSON.stringify({ data: "", message: "File uploaded successfully.", errors: "" });
    }
  } catch (err) {
    console.log('err', err);
    response.statusCode = 500;
    response.body = JSON.stringify({ data: "", message: "The file could not be uploaded.", errors: err });
  }
  return response;
};

module.exports = {
  createSalesOrderBalance,
  createSalesOrder,
  createSalesOrderOnTemporaryHold,
  addFilesSalesOrderOnTemporaryHold,
  releaseSalesOrderOnTemporaryHold,
  getColors,
  createPayment,
  getCustomer,
  getCustomers,
  getSalesPerson,
  getCustomerLocations,
  createCustomerLocations,
  getPaymentMethods,
  //getEta,
  getInventoryInquiry,
  getInventoryInquiryGrouped,
  getMoldings,
  getInvoices,
  getInvoice,
  getCountries,
  getStates,
  getTaxZones,
  //getTax,
  cancelExpiredSalesOrders,
  processRewardsPoints,
  updateRewardsLevelInAcumatica,
  //getCustomerBusinessApp,
  createCustomerBusinessApp,
  approveContactRequest,
  disapproveContactRequest,
  getDashboardSummary,
  getSalesPersonDashboardSummary,
  getShipments,
  createQuote,
  //getQuotes,
  notifySalesOrderDeadlineOnTemporaryHold,
};