const AcumaticaService = require('../../../Infraestructure/Http/AcumaticaService');
const Util = require('../../Util/Util');
const Decimal = require('decimal.js-light');

function isValidDate(dateString) {
    var regEx = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateString.match(regEx)) return false;  // Invalid format
    var d = new Date(dateString);
    var dNum = d.getTime();
    if (!dNum && dNum !== 0) return false; // NaN value, Invalid date
    return d.toISOString().slice(0, 10) === dateString;
}

function isValidShippingTerms(shippingTerms) {
    if (shippingTerms != 'BUS' && shippingTerms != 'LOCAL' && shippingTerms != 'RES') {
        return false;
    }
    return true;
}

function isValidPaymentType(paymentType) {
    if (paymentType != 'CREDITLINE' && paymentType != 'CHECK' && paymentType != 'CREDITCARD' && paymentType != 'WIRETRANSFER' && paymentType != 'MIXTO') {
        return false;
    }
    return true;
}

function isNum(val) {
    return isNaN(val)
}

async function getCustomerLocation(customerId, locationId) {
    try {
        const { data: customerLocation } = await AcumaticaService.sendRequest('get',
            'CustomerLocation',
            '',
            `$filter=CustomerID%20eq%20'${customerId}'%20and%20LocationID%20eq%20'${locationId}'`,
            `$expand=ShippingInstructions,ShippingTax`,
            '$select=CustomerID,LocationID,ShippingInstructions/ShippingTerms,ShippingTax/TaxZone', '');

            console.log("trama get custo", customerLocation);
        for (var i = 0; i < customerLocation.length; i++) {
            let totalTaxRate = 0.00;
            customerLocation[i]['custom'].freightPrice = Util.getFreightPrice(customerLocation[i]['ShippingInstructions'].ShippingTerms.value);

            if (Util.isObjEmpty(customerLocation[i].ShippingTax.TaxZone) === false) {
                const { data: tax } = await AcumaticaService.sendRequest('get',
                    'Tax',
                    '',
                    `$filter=TaxZoneID%20eq%20'${customerLocation[i]['ShippingTax'].TaxZone.value}'%20and%20ReportingGroup%20eq%20'1'`,
                    '',
                    '$select=TaxRate', '');
                for (var j = 0; j < tax.length; j++) {
                    totalTaxRate += tax[j]['TaxRate'].value;
                }
                customerLocation[i]['custom'].totalTaxRate = { value: totalTaxRate };
            }
            else {
                customerLocation[i]['custom'].totalTaxRate = { value: 0.00 };
            }
        }
        return customerLocation;
    } catch (error) {
        console.error(`Error de validación en getCustomerLocations: ${error}`);
        return error;
    }
}

async function getCustomer(customerId) {
    try {
        const { data: customer } = await AcumaticaService.sendRequest('get',
            'Customer',
            customerId,
            '',
            '',
            '$select=RemainingCreditLimit', '');
        return customer;
    } catch (error) {
        console.error(`Error de validación en getCustomer: ${error}`);
        return error;
    }
}

async function createSalesOrderStructureValidation(body) {
    try {
        /* console.log('createSalesOrderStructureValidation body: ', body); */
        const errors = [];
        const { CustomerID, Description, OrderType, LocationID, ScheduledShipmentDate, ShippingTerms, FreightPrice,
            PaymentType, Email, AddressLine1, State, PostalCode, Attention,
            Phone1, Details, PaymentDetail } = body;
        const details = Details === undefined ? '' : JSON.parse(Details);

        if (isNum(CustomerID) === false || !CustomerID) errors.push({ CustomerID: "CustomerID is required and must be a string" });
        if (isNum(Description) === false || !Description) errors.push({ Description: "Description is required and must be a string" });
        if (isNum(OrderType) === false || !OrderType) errors.push({ OrderType: "OrderType is required and must be a string" });
        if (isNum(LocationID) === false || !LocationID) errors.push({ LocationID: "LocationID is required and must be a string" });
        if (isNum(ScheduledShipmentDate) === false || !ScheduledShipmentDate || isValidDate(ScheduledShipmentDate) === false) {
            errors.push({ ScheduledShipmentDate: "ScheduledShipmentDate is required, it must be a string and its format is YYYY-MM-DD" });
        }
        if (isNum(ShippingTerms) === false && ShippingTerms) errors.push({ ShippingTerms: "ShippingTerms must be a string" });
        if (isNum(ShippingTerms) === true && ShippingTerms && (isNum(FreightPrice) === true || !FreightPrice)) {
            errors.push({ FreightPrice: "FreightPrice is required and must be a number" });
        }
        if (isNum(ShippingTerms) === true && ShippingTerms && isValidShippingTerms(ShippingTerms) === false) errors.push({ ShippingTerms: "Invalid ShippingTerms" });
        if (isNum(Email) === false) errors.push({ Email: "Email must be a string" });
        if (isNum(AddressLine1) === false) {
            errors.push({ AddressLine1: "AddressLine1 must be a string" });
        }
        if (isNum(State) === false) errors.push({ State: "State must be a string" });
        //if (isNum(PostalCode) === true) errors.push({ PostalCode: "PostalCode must be a number" });
        const formatAttention = Attention === '' ? 'A' : Attention //isNaN de String vacio da igual a 0 y fallara verificacion
        if (isNum(formatAttention) === false) errors.push({ Attention: "Attention must be a string" });
        if (isNum(Phone1) === false) errors.push({ Phone1: "Phone1 must be a string" });

        if (details == '') {
            errors.push({ Details: "Details is required" });
        } else {
            details.forEach(function (item, index) {
                if (typeof item.InventoryID.value !== 'string' || !item.InventoryID.value) {
                    errors.push({ Details: `InventoryID is required and must be a string | position ${index}` });
                }
                if (typeof item.OrderQty.value !== 'number' || !item.OrderQty.value) {
                    errors.push({ Details: `OrderQty is required and must be a number | position ${index}` });
                }
                if (typeof item.UnitPrice.value !== 'number' || !item.UnitPrice.value) {
                    errors.push({ Details: `UnitPrice is required and must be a number | position ${index}` });
                }
                if (typeof item.UOM.value !== 'string' || !item.UOM.value) {
                    errors.push({ Details: `UOM is required and must be a string | position ${index}` });
                }
                if (typeof item.WarehouseID.value !== 'string' || !item.WarehouseID.value) {
                    errors.push({ Details: `WarehouseID is required and must be a string | position ${index}` });
                }
                if (typeof item.SQFTPrice.value !== 'number' || !item.SQFTPrice.value) {
                    errors.push({ Details: `SQFTPrice is required and must be a number | position ${index}` });
                }
            });
        }

        const paymentDetail = PaymentDetail === undefined || PaymentDetail == '' ? '' : JSON.parse(PaymentDetail);
        if (paymentDetail != '') {
            if (Object.keys(paymentDetail).length) {
                paymentDetail.forEach(function (item, index) {
                    if (typeof item.PaymentMethod.value !== 'string' || !item.PaymentMethod.value) {
                        errors.push({ PaymentDetail: `PaymentMethod is required and must be a string | position ${index}` });
                    }
                    if (typeof item.PaymentMethod.value === 'string' && !item.PaymentMethod.value && isValidPaymentType(item.PaymentMethod.value) === false) {
                        errors.push({ PaymentDetail: "Invalid PaymentMethod" });
                    }
                    if (typeof item.PaymentAmount.value !== 'number' || !item.PaymentAmount.value) {
                        errors.push({ PaymentDetail: `PaymentAmount is required and must be a number | position ${index}` });
                    }
                    if (/*typeof item.PaymentRef.value !== 'string' ||*/ !item.PaymentRef.value && (item.PaymentMethod.value == 'CHECK' || item.PaymentMethod.value == 'CREDITCARD')) {
                        errors.push({ PaymentDetail: `PaymentRef is required | position ${index}` });
                    }
                    if (typeof item.AppliedToOrder.value !== 'number' || !item.AppliedToOrder.value && (item.PaymentMethod.value == 'CHECK' || item.PaymentMethod.value == 'CREDITCARD')) {
                        errors.push({ PaymentDetail: `AppliedToOrder is required and must be a number | position ${index}` });
                    }
                });
            } else {
                errors.push({ PaymentDetail: 'the string must be from an array of objects' });
            }
        }

        if (isNum(PaymentType) === false || !PaymentType) {
            errors.push({ PaymentType: "PaymentType is required and must be a string" });
        } else {
            if (isValidPaymentType(PaymentType) === false) {
                errors.push({ PaymentType: "Invalid PaymentType" });
            }
        }

        return errors;

    } catch (error) {
        console.error(`Error de validación en createSalesOrderValidation: ${error}`);
        return error;
    }
}

async function createSalesOrderPaymentTypeValidation(body) {
    try {
        /* console.log('createSalesOrderPaymentTypeValidation body: ', body); */
        const errors = [];
        const { files, CustomerID, LocationID, ShippingTerms, FreightPrice, PaymentType, PaymentRef, PaymentAmount, AppliedToOrder,
            Details, PaymentDetail } = body;
        const details = JSON.parse(Details);

        let totalAmountSalesOrder = 0.00;
        const [customerLocation] = await getCustomerLocation(CustomerID, LocationID);
        const { RemainingCreditLimit } = await getCustomer(CustomerID);
        let freightPrice = parseFloat(customerLocation.custom.freightPrice.value);
        /* console.log('freightPrice: ', freightPrice); */
        if (ShippingTerms) freightPrice = parseFloat(FreightPrice);
        const totalTaxRate = parseFloat(customerLocation.custom.totalTaxRate.value);
        /* console.log("tax: ", customerLocation) */
        let subTotal = 0.00;
        details.forEach(function (item) {
            subTotal += new Decimal(parseFloat(item.OrderQty.value)).mul(parseFloat(item.UnitPrice.value)) ;
        });

        let tax = Math.floor(parseFloat(((totalTaxRate / 100) * subTotal))*100)/100;

        totalAmountSalesOrder = new Decimal(subTotal).add(tax).add(freightPrice).toNumber();
        /* console.log('totalAmountSalesOrder: ', totalAmountSalesOrder); */

        if (PaymentType == "CREDITLINE") {
            if (totalAmountSalesOrder > parseFloat(RemainingCreditLimit.value)) errors.push({ RemainingCreditLimit: "Insufficient credit limit." });
        } else if (PaymentType == "CHECK" || PaymentType == "CREDITCARD" || PaymentType == "WIRETRANSFER") {
            if (PaymentType == "CHECK" && files.length === 0) errors.push({ files: 'File is required' });
            if (!PaymentRef || PaymentRef == '') errors.push({ PaymentRef: 'PaymentRef is required' });
            if (isNum(PaymentAmount) === true || !PaymentAmount) errors.push({ PaymentAmount: 'PaymentAmount is required and must be a number' });
            if (isNum(AppliedToOrder) === true || !AppliedToOrder) errors.push({ AppliedToOrder: 'AppliedToOrder is required and must be a number' });
            if (PaymentType == "CHECK" || PaymentType == "WIRETRANSFER") {
                if (parseFloat(PaymentAmount) < totalAmountSalesOrder) {
                    errors.push({ PaymentAmount: `The amount to be paid (${PaymentAmount}) must not be less than the total amount of the sale (${totalAmountSalesOrder})` });
                }
            } else if (PaymentType == "CREDITCARD") {
                if (parseFloat(PaymentAmount) > totalAmountSalesOrder) {
                    errors.push({ PaymentAmount: `The amount to be paid (${PaymentAmount}) exceeds the total amount of the sale (${totalAmountSalesOrder})` });
                }
            }
        } else if (PaymentType == "MIXTO") {
            let fullPaymentAmount = 0.00;
            PaymentDetail.forEach(async function (item, index) {
                const { PaymentMethod, PaymentAmount, AppliedToOrder } = item;
                if (PaymentMethod.value == "CREDITLINE") {
                    fullPaymentAmount += parseFloat(PaymentAmount.value);
                    if (parseFloat(PaymentAmount.value) > parseFloat(RemainingCreditLimit.value)) errors.push({ PaymentDetail: `Insufficient credit limit | position ${index}` });
                } else if (PaymentMethod.value == "CHECK") {
                    if (parseFloat(AppliedToOrder.value) > parseFloat(PaymentAmount.value)) {
                        errors.push({ PaymentDetail: `AppliedToOrder is greater than PaymentAmount | position ${index}` });
                    } else {
                        fullPaymentAmount += parseFloat(AppliedToOrder.value);
                    }
                    if (files.length === 0) errors.push({ PaymentDetail: `File is required | position ${index}` });
                } else if (PaymentMethod.value == "CREDITCARD") {
                    fullPaymentAmount += parseFloat(AppliedToOrder.value);
                }
            });
            
            if (fullPaymentAmount > totalAmountSalesOrder) errors.push({ PaymentDetail: "Amount applied exceeds the total amount of the sales order." });
        }

        return errors;
    } catch (error) {
        console.error(`Error de validación en createSalesOrderValidation: ${error}`);
        return error;
    }
}

module.exports = {
    createSalesOrderStructureValidation,
    createSalesOrderPaymentTypeValidation
}