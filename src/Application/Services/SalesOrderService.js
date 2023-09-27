const AcumaticaService = require('../../Infraestructure/Http/AcumaticaService');
const S3Service = require('../../Infraestructure/AWS/S3/S3Service');
const BaseDAO = require('../DAO/BaseDAO');
const MultipartParser = require('./Util/MultipartParser');
const Validations = require('./Util/Validations');
const { sendMailPaymentCompleted } = require('../../functions/mailings');
//const { ConfigurationServicePlaceholders } = require('aws-sdk/lib/config_service_placeholders');
const Util = require('../Util/Util'); 

class SalesOrderService {
    static async getSalesOrder(orderNumber) {
        try {
            const { data: salesOrder } = await AcumaticaService.sendRequest('get', 'SalesOrder', `SO/${orderNumber}`, '', '$expand=Payments,Details,ShipToAddress,ShipToContact,ShippingSettings,Totals,TaxDetails,BillToContact,BillToAddress,Financial', '');
            let totalTaxRate = 0.00;
            for (var i = 0; i < salesOrder.TaxDetails.length; i++) {
                totalTaxRate += salesOrder.TaxDetails[i]['TaxRate'].value;
            }
            salesOrder.custom.totalTaxRate = { value: totalTaxRate };
            return salesOrder;
        } catch (error) {
            console.error(`Error en ${this.name}.getSalesOrder`, error);
            throw error;
        }
    }

    static async getSalesOrders(query) {
        try {
            const filter = query.customerid ? `$filter=CustomerID%20eq%20'${query.customerid}'` : `$filter=SalesPersonID%20eq%20'${query.salespersonid}'`;
            
            let { data: salesOrders } = await AcumaticaService.sendRequest('get', 'SalesOrder', '', filter, '$expand=ShippingSettings,Details', '$select=Description,OrderNbr,CuryUnpaidBalance,OrderTotal,OrderType,Status,ShippingSettings,Details,Date,CurrencyID');
            
            //const salesOrderHoldUpInventory = await BaseDAO.getAll(process.env.REWARDS_SALES_ORDER_ACUMATICA);
            let confirmed = [];
            let unconfirmed = [];
            let pendingPayment = [];
            let shipment = [];
            let onTemporaryHold = [];

            for (var i = 0; i < salesOrders.length; i++) {
                let TotalSQFT = 0.00;
                for (var j = 0; j < salesOrders[i].Details.length; j++) {
                    if (salesOrders[i]['OrderNbr'].value == salesOrders[i].Details[j]['OrderNbr'].value) {
                        TotalSQFT += salesOrders[i].Details[j]['TotalSQFT'].value;
                    }
                }
                salesOrders[i]['custom'].TotalSQFT = { value: TotalSQFT };

                if (salesOrders[i]['Description'].value != 'On Temporary Hold') {
                    if (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'On Hold' || salesOrders[i]['Status'].value == 'Back Order') {
                        unconfirmed.push(salesOrders[i]);
                    } else if (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'Credit Hold' || salesOrders[i]['Status'].value == 'Awaiting Payment') {
                        pendingPayment.push(salesOrders[i]);
                    } else if (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'Open') {
                        confirmed.push(salesOrders[i]);
                    } else if (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'Shipping') {
                        delete salesOrders[i].CuryUnpaidBalance;
                        shipment.push(salesOrders[i]);
                    }
                } else if (salesOrders[i]['Description'].value == 'On Temporary Hold') {

                    onTemporaryHold.push(salesOrders[i]);
                    
                    /* for (var k = 0; k < salesOrderHoldUpInventory.length; k++) {
                        if (salesOrders[i]['OrderNbr'].value == salesOrderHoldUpInventory[k]['sales_order_nbr']) {
                            salesOrders[i]['Status'].value = salesOrderHoldUpInventory[k]['status'];
                            salesOrders[i]['custom'].DueDate = { value: salesOrderHoldUpInventory[k]['expiration_date'] };
                            onTemporaryHold.push(salesOrders[i]);
                        }
                    } */
                }
            }

            return {
                confirmed,
                unconfirmed,
                pendingPayment,
                shipment,
                onTemporaryHold,
            };
        } catch (error) {
            console.error(`Error en ${this.name}.getSalesOrders`, error);
            throw error;
        }
    }

    static async createSalesOrder(event) {
        
        try {
            const date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
            const body = await MultipartParser.transformEvent(event);
            const { CustomerID, Description, OrderType, CustomerOrder, LocationID, ScheduledShipmentDate, ShippingTerms, FreightPrice,
                PaymentType, Email, AddressLine1, State, PostalCode, Attention, AppliedToOrder, PaymentAmount, PaymentRef,
                Phone1, Details, PaymentDetail, files, salesOrder } = body;

            if(body.finalProcess){

                let salesOrderData = await this.createSalesOrderFinalProcess(JSON.parse(salesOrder), files, PaymentType);
                
                return { statusCode: 200, message: 'Sales order created successfully', error: '', data: salesOrderData}
            
            }else{

                const createSalesOrderStructureValidation = await Validations.createSalesOrderStructureValidation(body);
                const createSalesOrderPaymentTypeValidation = await Validations.createSalesOrderPaymentTypeValidation(body);
                if (Object.keys(createSalesOrderStructureValidation).length) {
                    console.error(`Error en ${this.name}.createSalesOrder`, createSalesOrderStructureValidation);
                    return { statusCode: 400, message: 'Error in request body validations', error: createSalesOrderStructureValidation, data: '' }
                }
    
                if (Object.keys(createSalesOrderPaymentTypeValidation).length) {
                    console.error(`Error en ${this.name}.createSalesOrder`, createSalesOrderPaymentTypeValidation);
                    return { statusCode: 400, message: 'Error in payment validations', error: createSalesOrderPaymentTypeValidation, data: '' }
                }
    
                const scheduledShipmentDate = new Date(ScheduledShipmentDate);
                scheduledShipmentDate.setDate(scheduledShipmentDate.getDate());
                
                const paramsSalesOrder = {
                    CustomerID: { value: CustomerID },
                    Description: { value: Description },
                    ShippingSettings: { ScheduledShipmentDate: { value: scheduledShipmentDate.toISOString().slice(0, 10) }, },
                    ShipToAddress: { OverrideAddress: { value: true } },
                    ShipToContact: { OverrideContact: { value: true } },
                    Details: JSON.parse(Details),
                    OrderType: { value: OrderType },
                    LocationID: { value: LocationID },
                    CustomerOrder: { value: CustomerOrder }
                };

                let discountSO = 0.00;

                if((CustomerID==="C000573" && PaymentType == "WIRETRANSFER") || (CustomerID==="C000573" && PaymentType == "CREDITCARD")){
                    discountSO = parseFloat(AppliedToOrder * 0.015);
                    if (paramsSalesOrder) paramsSalesOrder.DiscountTotal = { value: discountSO };
                }
                else{
                    if (paramsSalesOrder) paramsSalesOrder.DiscountTotal = { value: 0.00 };
                }
                
                if (ShippingTerms) paramsSalesOrder.ShippingSettings.ShippingTerms = { value: ShippingTerms };
                if (AddressLine1) paramsSalesOrder.ShipToAddress.AddressLine1 = { value: AddressLine1 };
                if (State) paramsSalesOrder.ShipToAddress.State = { value: State };
                if (PostalCode) paramsSalesOrder.ShipToAddress.PostalCode = { value: PostalCode };
                if (Attention) paramsSalesOrder.ShipToContact.Attention = { value: Attention };
                if (Phone1) paramsSalesOrder.ShipToContact.Phone1 = { value: Phone1 };
    
                const amountWithFeeCreditCard = parseFloat(AppliedToOrder) + parseFloat(AppliedToOrder*0.03) - discountSO
                const amountWithFeeWireTransfer = parseFloat(AppliedToOrder) + parseFloat(AppliedToOrder*0.03) - discountSO

                const appliedToOrderDiscount = parseFloat(AppliedToOrder - discountSO)

                if (PaymentType == "CHECK") {
                    paramsSalesOrder.Payments = [{
                        Hold: { value: true },
                        CashAccount: { value: "10100" },
                        AppliedToOrder: { value: appliedToOrderDiscount },
                        PaymentAmount: { value: PaymentAmount },
                        PaymentMethod: { value: "CHECK" },
                        PaymentRef: { value: PaymentRef },
                        DocType: { value: "Prepayment" }
                    }];
                }
                else if (body.PaymentType == "CREDITCARD") {
                    paramsSalesOrder.Payments = [{
                        Hold: { value: false },
                        AppliedToOrder: { value: appliedToOrderDiscount },
                        //CashAccount: { value: "10450" },
                        CashAccount: { value: "EBIZ" },
                        //PaymentAmount: { value: PaymentAmount },
                        PaymentAmount: { value: await Util.dosDecimales(amountWithFeeCreditCard) },
                        PaymentMethod: { value: "CC" },
                        PaymentRef: { value: PaymentRef },
                        DocType: { value: "Prepayment" }
                    }];
                }
                else if (PaymentType == "WIRETRANSFER") {
                    paramsSalesOrder.Payments = [{
                        Hold: { value: true },
                        AppliedToOrder: { value: appliedToOrderDiscount },
                        //CashAccount: { value: "10100" },
                        CashAccount: { value: "STRIPE" },
                        PaymentAmount: { value: await Util.dosDecimales(amountWithFeeWireTransfer) },
                        PaymentMethod: { value: "WT" },
                        PaymentRef: { value: PaymentRef },
                        DocType: { value: "Prepayment" }
                    }];
                }
                else if (body.PaymentType == "MIXTO") {
                    const paymentDetail = JSON.parse(PaymentDetail);
                    paymentDetail.forEach(function (item) {
                        const { PaymentMethod, AppliedToOrder, PaymentAmount, PaymentRef } = item;
                        if (PaymentMethod.value == "CHECK") {
                            paramsSalesOrder.Payments = [{
                                "Hold": { "value": true },
                                "AppliedToOrder": { "value": appliedToOrderDiscount },
                                "CashAccount": { "value": "10100" },
                                "PaymentAmount": { "value": PaymentAmount.value },
                                "PaymentMethod": { "value": "CHECK" },
                                "PaymentRef": { "value": PaymentRef.value },
                                "DocType": { "value": "Prepayment" }
                            }];
                        } else if (PaymentMethod.value == "CREDITCARD") {
                            paramsSalesOrder.Payments = [{
                                "Hold": { "value": false },
                                "AppliedToOrder": { "value": appliedToOrderDiscount },
                                "CashAccount": { "value": "EBIZ" },
                                "PaymentAmount": { "value": PaymentAmount.value },
                                "PaymentMethod": { "value": "CC" },
                                "PaymentRef": { "value": PaymentRef.value },
                                "DocType": { "value": "Prepayment" }
                            }];
                        }
                    });
                }
                //let createSalesOrder= any;
                
                const { data: createSalesOrder } = await AcumaticaService.sendRequest('put', 'SalesOrder', '', '',
                '$expand=Payments,Details,ShipToAddress,ShipToContact,ShippingSettings,Totals,TaxDetails,BillToContact,BillToAddress,Financial',
                '$select=OrderTotal,ExternalRef,CurrencyID,CustomerID,Date,ShipVia,TaxTotal,OrderType,OrderNbr,Payments,Details,ShipToAddress,ShipToContact,ShippingSettings,Totals,TaxDetails,BillToContact,BillToAddress,Financial', paramsSalesOrder);
              
                let totalTaxRate = 0.00;
        
                for (var i = 0; i < createSalesOrder.TaxDetails.length; i++) {
                    totalTaxRate += createSalesOrder.TaxDetails[i]['TaxRate'].value;
                }
                createSalesOrder.custom.totalTaxRate = { value: totalTaxRate };
    
                return { statusCode: 200, message: 'First process completed', error: '', data: createSalesOrder }

            }

        } catch (error) {
            console.error(`Error en ${this.name}.createSalesOrder`, "error");
            throw error;
        }
    }

    static async createSalesOrderFinalProcess(salesOrder, files, PaymentType){

        try{

            const OrderNbr = salesOrder.OrderNbr.value
            let CustomerID = salesOrder.CustomerID.value
            let Description = salesOrder.Description.value
            let CustomerOrder = salesOrder.CustomerOrder.value
            let OrderTotal = salesOrder.OrderTotal.value
            console.log("ordertotal: ", OrderTotal)

            let taxOrder = 0

            salesOrder.TaxDetails.forEach(item => {
                if(parseFloat(item.TaxAmount.value)  > 0) taxOrder = item.TaxAmount.value
            })

            let datesEmail = {
                orderNumber: OrderNbr,
                clientName: salesOrder.ShipToContact.BusinessName.value,
                clientEmail: salesOrder.ShipToContact.Email.value,
                shippingOrder: salesOrder.ShippingSettings.Freight.value,
                taxOrder: taxOrder,
                subTotalOrder: salesOrder.OrderTotal.value,
                paymentMethod: PaymentType == "CREDITLINE" ? "CreditLine" : salesOrder.Payments[0].PaymentMethod.value,
                totalOrder: PaymentType == "CREDITLINE" ? salesOrder.OrderTotal.value : salesOrder.Payments[0].PaymentAmount.value,
                date: salesOrder.Date.value.split('T')[0],
                items: [],
                amounts: []
            }
            
            salesOrder.Details.forEach( detail => {
                datesEmail.items.push(detail.LineDescription.value)
                datesEmail.amounts.push(detail.Amount.value)
            })

            let PaymentAmount
            let referenceNbr
            let docType
            let paymentRef

            if (PaymentType != "CREDITLINE") {
                PaymentAmount = salesOrder.Payments.length === 0 ? '' : salesOrder.Payments[0].PaymentAmount.value;
                referenceNbr = salesOrder.Payments.length === 0 ? '' : salesOrder.Payments[0].ReferenceNbr.value;
                docType = salesOrder.Payments.length === 0 ? '' : salesOrder.Payments[0].DocType.value;
                paymentRef = salesOrder.Payments.length === 0 ? '' : salesOrder.Payments[0].PaymentRef.value;
            }

            if (PaymentType == "CREDITLINE") {
                
                await salesOrderOpen(OrderNbr);
    
            }
            else if (PaymentType == "CHECK") {
    
                const [, extension] = files[0].contentType.split('/');
                
                await AcumaticaService.sendRequest('put', 'Payment', `${docType}/${referenceNbr}/files/${paymentRef}.${extension}`, '', '', '', files[0].content, true, files[0].contentType);
                
                await salesOrderOpen(OrderNbr);
    
            } else if (PaymentType == "WIRETRANSFER") {
                //creando Invoice
                const comissionCC = parseFloat((OrderTotal + salesOrder.DiscountTotal.value) * 0.03);
                const paramsInvoice =                                    
                    {
                        CustomerID: { value: CustomerID },
                        Description: { value: Description },
                        Details: [{ 
                            InventoryID: { value: "WTFEE" },
                            TransactionDescr: { value: "WireTransferFee" },
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
                
                const data = await AcumaticaService.sendRequest('get', 'Invoice', '', `$filter=CustomerOrder%20eq%20'${CustomerOrder}'`, '', '');
                const getInvoice = data.data.filter((data)=> data.ReferenceNbr.value == ReferenceNbrIn)
                
                if(getInvoice[0].Status.value == 'Credit Hold'){
                    await AcumaticaService.sendRequest('post', 'Invoice', 'ReleaseFromCreditHoldInvoice', '', '', '', paramsActionInvoice);
                }
            
                await AcumaticaService.sendRequest('post', 'Invoice', 'ReleaseInvoice', '', '', '', paramsActionInvoice);
                
                await paymentRelases(TypeDocIn, ReferenceNbrIn);
                
                await salesOrderOpen(OrderNbr);
    
            } else if (PaymentType == "CREDITCARD") {
                //creando Invoice
                const comissionCC = parseFloat((OrderTotal + salesOrder.DiscountTotal.value) * 0.03);
                const paramsInvoice = 
                    {
                        CustomerID: { value: CustomerID },
                        Description: { value: Description },
                        Details: [{ 
                            InventoryID: { value: "CCFEE" },
                            TransactionDescr: { value: "Credit Card Fee" },
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
                    await AcumaticaService.sendRequest('post', 'Invoice', 'ReleaseFromCreditHold', '', '', '', paramsActionInvoice);
                }
                
                await AcumaticaService.sendRequest('post', 'Invoice', 'ReleaseInvoice', '', '', '', paramsActionInvoice);
    
                await paymentRelases(TypeDocIn, ReferenceNbrIn);
    
                await salesOrderOpen(OrderNbr);
                
            } else if (PaymentType == "MIXTO") {
                for (var i = 0; i < salesOrder.Payments.length; i++) {
                    if (salesOrder.Payments[i].PaymentMethod.value == "CHECK") {
                        const [, extension] = files[0].contentType.split('/');
                        await AcumaticaService.sendRequest('put', 'Payment', `${docType}/${referenceNbr}/files/${paymentRef}.${extension}`, '', '', '', files[0].content, true, files[0].contentType);
                    } else if (salesOrder.Payments[i].PaymentMethod.value == "CREDITCARD") {
                        await AcumaticaService.sendRequest('post', 'Payment', 'ReleasePayment', '', '', '', {
                            entity: { Type: { value: docType }, ReferenceNbr: { value: referenceNbr } }
                        });
                        
                        await salesOrderOpen(OrderNbr);
    
                    }
                }
            }
    
            await sendMailPaymentCompleted(datesEmail);

            console.log("createSalesOrderEndProccess completed")

            return salesOrder;

            async function salesOrderOpen(OrderNbr) {
    
                const { data: getSalesOrder } = await AcumaticaService.sendRequest('get', 'SalesOrder', '', `$filter=OrderNbr%20eq%20'${OrderNbr}'`, '', '$select=Status,OrderType');
                const OrderType = getSalesOrder[0].OrderType.value;
                
                if(getSalesOrder[0].Status.value == 'On Hold' ){
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
    
            async function paymentRelases(TypeDocIn, ReferenceNbrIn){
    
                const FilterPayment = `$select=ReferenceNbr,CustomerID,Status&$filter=ReferenceNbr eq '${referenceNbr}'`
                const paramsModifiedPayment = {
                DocumentsToApply: [
                        {
                            DocType: {
                                value: TypeDocIn
                            },
                            ReferenceNbr: {
                                value: ReferenceNbrIn
                            }
                        }
                    ]
                }
                
                const { data: paymentData } = await AcumaticaService.sendRequest('get', 'Payment', '', FilterPayment, '', '');
                
                await AcumaticaService.sendRequest('put', 'Payment', '', '', FilterPayment, '',paramsModifiedPayment)
                
                /* console.log("modifi payment pruebas: ", modifiedPayment) */
    
                if(paymentData[0].Status.value == 'On Hold'){
                    await AcumaticaService.sendRequest('post', 'Payment', 'ReleaseFromHold', '', '', '', {
                        entity: { Type: { value: docType }, ReferenceNbr: { value: referenceNbr } }
                    });
                }

                await AcumaticaService.sendRequest('post', 'Payment', 'ReleasePayment', '', '', '', {
                    entity: { Type: { value: docType }, ReferenceNbr: { value: referenceNbr } }
                });
    
            }

        }catch(error){
            console.log("error en createSalesOrder.this.createSalesOrderEndProccess", error);
        }
        
    }


    static async getSalesOrdersGroupedCustomer(query) {
        try {
            const { data: salesOrders } = await AcumaticaService.sendRequest('get', 'SalesOrder', '', `$filter=SalesPersonID%20eq%20'${query.salespersonid}'`, '', '$select=Description,OrderTotal,OrderType,Status,CustomerID,CustomerName');
            const salesOrdersFilter = [];
            const groupedCustomer = [];
            let orderTotalPerSegment = 0.00;

            for (var i = 0; i < salesOrders.length; i++) {
                if (salesOrders[i]['Description'].value != 'On Temporary Hold' && salesOrders[i]['OrderTotal'].value != 0) {
                    if (query.segment === 'unconfirmed' && (salesOrders[i]['OrderType'].value == 'QT' && salesOrders[i]['Status'].value == 'On Hold')) {
                        salesOrdersFilter.push(salesOrders[i]); // unconfirmed
                        orderTotalPerSegment += salesOrders[i]['OrderTotal'].value;
                    } if (query.segment === 'unconfirmed' && (salesOrders[i]['OrderType'].value == 'QT' && salesOrders[i]['Status'].value == 'Open')) {
                        salesOrdersFilter.push(salesOrders[i]); // unconfirmed
                        orderTotalPerSegment += salesOrders[i]['OrderTotal'].value;
                    } if (query.segment === 'unconfirmed' && (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'On Hold')) {
                        salesOrdersFilter.push(salesOrders[i]); // unconfirmed
                        orderTotalPerSegment += salesOrders[i]['OrderTotal'].value;
                    } if (query.segment === 'pendingPayment' && (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'Credit Hold')) {
                        salesOrdersFilter.push(salesOrders[i]); // pendingPayment
                        orderTotalPerSegment += salesOrders[i]['OrderTotal'].value;
                    } if (query.segment === 'confirmed' && (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'Open')) {
                        salesOrdersFilter.push(salesOrders[i]); // confirmed
                        orderTotalPerSegment += salesOrders[i]['OrderTotal'].value;
                    } if (query.segment === 'shipment' && (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'Shipping')) {
                        salesOrdersFilter.push(salesOrders[i]); // shipment
                        orderTotalPerSegment += salesOrders[i]['OrderTotal'].value;
                    }
                }
            }

            if (salesOrdersFilter.length > 0) {
                salesOrdersFilter.reduce(function (groups, value) {
                    var { CustomerID, CustomerName, OrderTotal } = value;
                    if (!groups[CustomerID.value]) {
                        groups[CustomerID.value] = { CustomerID: { value: CustomerID.value }, CustomerName: { value: CustomerName.value }, OrderTotal: { value: 0 } }
                        groupedCustomer.push(groups[CustomerID.value])
                    }
                    groups[CustomerID.value].OrderTotal.value += OrderTotal.value;
                    return groups;
                }, {});

                for (var i = 0; i < groupedCustomer.length; i++) {
                    let percentage = (groupedCustomer[i].OrderTotal.value / orderTotalPerSegment.toFixed(2)) * 100;
                    groupedCustomer[i].Percentage = (percentage * 100) / 100;
                }
            }

            return groupedCustomer;
        } catch (error) {
            console.error(`Error en ${this.name}.getSalesOrdersGroupedCustomer`, error);
            throw error;
        }
    }
}

module.exports = SalesOrderService;