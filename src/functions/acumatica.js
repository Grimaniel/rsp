const axios = require("axios");
const xml2js = require('xml2js');
const moment = require('moment');
const AcumaticaService = require('../Infraestructure/Http/AcumaticaService');
const AcumaticaSessionDAO = require('../Application/DAO/AcumaticaSessionDAO');
const BaseDAO = require('../Application/DAO/BaseDAO');
const SalesOrderDAO = require('../Application/DAO/SalesOrderDAO');
const credentials = {
    "name": "mhiga",
    "password": "654321"
};

async function validateAcumaticaSession() {
    let cookie = ``;
    const getAcumaticaLastSessionResult = await AcumaticaSessionDAO.getAcumaticaLastSession();
    if (getAcumaticaLastSessionResult) {
        console.log("1");
        cookie = getAcumaticaLastSessionResult.companyid + "; " + getAcumaticaLastSessionResult.userbranch + "; " + getAcumaticaLastSessionResult.token + "; " + getAcumaticaLastSessionResult.sessionid + "; " + getAcumaticaLastSessionResult.locale;
    } else {
        console.log("2");
        const date = new Date().toLocaleString('sv-SE', { timeZone: 'US/Central' });
        const login = await loginAcumatica(credentials);
        const data = {
            companyid: login.companyid,
            userbranch: login.userbranch,
            token: login.token,
            sessionid: login.sessionid,
            locale: login.locale,
            expiration_date: moment(date).add(30, 'minutes').format('YYYY-MM-DD HH:mm:ss')
        };
        console.log("data", data);
        const insert = await BaseDAO.insert('ACUMATICA_SESSION', data);
        const get = await BaseDAO.get('ACUMATICA_SESSION', `id_acumatica_session=${insert.insertId}`);
        cookie = get.companyid + "; " + get.userbranch + "; " + get.token + "; " + get.sessionid + "; " + get.locale;
    }

    return cookie;
}

function loginAcumatica(data) {
    return new Promise((resolve, reject) => {
        if (!data.name || !data.password) {
            reject('user/password incorrect');
            return false;
        }

        var config = {
            method: 'post',
            url: 'https://rivafloors.acumatica.com/entity/auth/login',
            headers: {
                'Content-Type': 'application/json',
            },
            data: data
        };

        axios(config)
            .then(function (res) {
                const _sessionid = res.headers["set-cookie"][0].split(";");
                const _userbranch = res.headers["set-cookie"][1].split(";");
                const _locale = res.headers["set-cookie"][2].split(";");
                const _companyid = res.headers["set-cookie"][3].split(";");
                const _token = res.headers["set-cookie"][4].split(";");
                const res_format = {
                    sessionid: _sessionid[0],
                    userbranch: _userbranch[0],
                    locale: _locale[0],
                    companyid: _companyid[0],
                    token: _token[0]
                };
                resolve(res_format);
            })
            .catch(function (err) {
                reject(err);
            });
    });
}

function logoutAcumatica(data) {
    return new Promise((resolve, reject) => {
        if (!data.sessionid || !data.userbranch || !data.locale || !data.companyid || !data.token) {
            resolve('sessionid or userbranch or locale or companyid or token is empty');
            return false;
        }
        var cookie = data.companyid + "; " + data.userbranch + "; " + data.token + "; " + data.sessionid + "; " + data.locale;
        var config = {
            method: 'post',
            url: 'https://rivafloors.acumatica.com/entity/auth/logout',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Cookie': cookie,
            }
        };

        axios(config)
            .then(function (res) {
                resolve(res.headers["set-cookie"]);
            })
            .catch(function (err) {
                reject(err);
            });
    });
}

async function getSalesPerson(salespersonid) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        const config = {
            method: 'get',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/SalesPersons/${salespersonid}`,
            headers: {
                'Cookie': cookie,
            }
        };

        const getSalesPerson = await axios(config);
        response = getSalesPerson.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function getCustomers(params) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        const config = {
            method: 'put',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/RspCustomerSalesP?$expand=RspCustomerSalesPDetails`,
            headers: {
                'Cookie': cookie,
            },
            data: {
                SalesPersonID: { value: params.salespersonid }
            }
        };

        const getCustomers = await axios(config);
        console.log("getCustomers.data", getCustomers.data);
        response = getCustomers.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function getCustomer(customerid, session) {
    let response = {};
    try {

        const getPhone = await SalesOrderDAO.getPhoneByCustomerId(customerid)
        const phoneNumber = JSON.parse(JSON.stringify(getPhone.phone_number))
        const cookie = await validateAcumaticaSession();
        console.log("lacookie")
        console.log(cookie)
        console.log("lacookie")
        /*
        let login;
        let cookie;
        if (session == "" || session === undefined) {
            login = await loginAcumatica(credentials);
            cookie = login.companyid + "; " + login.userbranch + "; " + login.token + "; " + login.sessionid + "; " + login.locale;
        } else {
            cookie = session;
        }
        */
        if (customerid.indexOf("@")>=0){
            const config = {
                method: 'get',
                url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/Customer?$select=CustomerID,Email&$filter=Email%20eq%20%27${customerid}%27`,
                headers: {
                    'Cookie': cookie,
                }
            };
            let getCustomer = await axios(config);
            console.log("getCustomer.data", getCustomer.data);
            getCustomer.data.phoneNumber = phoneNumber
            response = getCustomer.data;
        }
        else {
            const config = {
                method: 'get',
                url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/Customer/${customerid}?$expand=Attributes`,
                headers: {
                    'Cookie': cookie,
                }
            };
        
            let getCustomer = await axios(config);
            const getSumSalesOrderHoldUpResult = await SalesOrderDAO.getSumSalesOrderHoldUp(customerid);
            const sumSalesOrderHoldUp = getSumSalesOrderHoldUpResult === undefined ? 0.00 : getSumSalesOrderHoldUpResult.sum_sales_order_hold_up;
            const remainingCreditLimitForSalesOrderOnTemporaryHold = getCustomer.data.CreditLimit.value - (sumSalesOrderHoldUp * 2);
            getCustomer.data.phoneNumber = phoneNumber
            console.log("remainingCreditLimitForSalesOrderOnTemporaryHold", remainingCreditLimitForSalesOrderOnTemporaryHold);
            getCustomer.data.custom = { remainingCreditLimitForSalesOrderOnTemporaryHold: { value: remainingCreditLimitForSalesOrderOnTemporaryHold } };
            console.log("getCustomer.data", getCustomer.data);
            response = getCustomer.data;
        }
        
    } catch (e) {
        response = e;
    }
    return response;
}

async function addFileToCustomer(customerid, file) {
    let response = {};
    try {
        const contentType = file.contentType.split('/');
        const timestamp = Date.now();
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'put',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/Customer/${customerid}/files/${customerid}_${timestamp}.${contentType[1]}`,
            headers: {
                'Accept': 'application/json',
                'Content-Type': file.contentType,
                'Cookie': cookie
            },
            data: file.content
        };

        const addFileToCustomer = await axios(config);
        response = addFileToCustomer.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function addFileToContactCustomer(customerid, file) {
    let response = {};
    try {
        const contentType = file.ContentType.split('/');
        const timestamp = Date.now();
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'put',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/Customer/${customerid}/files/${customerid}_${timestamp}.${contentType[1]}`,
            headers: {
                'Accept': 'application/json',
                'Content-Type': file.ContentType,
                'Cookie': cookie
            },
            data: file.Body
        };

        const addFileToContactCustomer = await axios(config);
        response = addFileToContactCustomer.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function updateCustomer(data, session) {
    let response = {};
    try {
        let login;
        let cookie;
        if (session == "" || session === undefined) {
            login = await loginAcumatica(credentials);
            cookie = login.companyid + "; " + login.userbranch + "; " + login.token + "; " + login.sessionid + "; " + login.locale;
        } else {
            cookie = session;
        }

        const config = {
            method: 'put',
            url: 'https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/Customer?$expand=Attributes',
            headers: {
                'Cookie': cookie,
            },
            data: data,
        };

        let updateCustomer = await axios(config);
        response = updateCustomer;
    } catch (e) {
        response = e;
    }
    return response;
}

async function createContact(data) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'put',
            url: 'https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/Contact2',
            headers: {
                'Cookie': cookie,
            },
            data: data,
        };

        const createContact = await axios(config);
        response = createContact;
    } catch (e) {
        response = e;
    }
    return response;
}

function isObjEmpty(obj) {
    for (var prop in obj) {
        if (obj.hasOwnProperty(prop)) return false;
    }

    return true;
}

function getFreightPrice(ShippingTerms) {

    let freightPrice = {};

    if (ShippingTerms == "BUS") {
        freightPrice = { value: 199.00 };
    } else if (ShippingTerms == "LOCAL") {
        freightPrice = { value: 149.00 };
    } else if (ShippingTerms == "RES") {
        freightPrice = { value: 299.00 };
    } else {
        freightPrice = { value: 0.00 };
    }

    return freightPrice;
}

async function getCustomerLocations(params) {

    let response = {};
    try {
        let filterCustomerId = '';
        let filterLocationId = '';
        let filter = '';
        let operator = '';
        let expand = '?$expand=LocationAdditionalInfo,LocationAddress,ShippingInstructions,ShippingTax';

        if (params.customerid) {
            filterCustomerId = `CustomerID%20eq%20'${params.customerid}'`;
        }
        if (params.locationid) {
            filterLocationId = `LocationID%20eq%20'${params.locationid}'`;
        }
        if (filterCustomerId != '' || filterLocationId != '') {
            filter = '&&$filter=';
        }
        if (filterCustomerId != '' && filterLocationId != '') {
            operator = '%20and%20';
        }

        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'get',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/CustomerLocation${expand}${filter}${filterCustomerId}${operator}${filterLocationId}`,
            headers: {
                'Cookie': cookie,
            }
        };

        let customerLocations = await axios(config);
        console.log('customerLocations', customerLocations);
        let taxes;

        for (var i = 0; i < customerLocations.data.length; i++) {
            let totalTaxRate = 0.00;
            customerLocations.data[i]['custom'].FreightPrice = getFreightPrice(customerLocations.data[i]['ShippingInstructions'].ShippingTerms.value);
            console.log('FreightPrice', customerLocations.data[i]['custom'].FreightPrice);
            if (isObjEmpty(customerLocations.data[i].ShippingTax.TaxZone) === false) {
                let config2 = {
                    method: 'get',
                    url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/Tax?$filter=TaxZoneID%20eq%20'${customerLocations.data[i]['ShippingTax'].TaxZone.value}'%20and%20ReportingGroup%20eq%20'1'`,
                    headers: {
                        'Cookie': cookie,
                    }
                };
                taxes = await axios(config2);
                console.log('taxes: ', taxes);
                for (var j = 0; j < taxes.data.length; j++) {
                    totalTaxRate += taxes.data[j]['TaxRate'].value;
                }
                customerLocations.data[i]['custom'].totalTaxRate = { value: totalTaxRate };
            }
            else {
                customerLocations.data[i]['custom'].totalTaxRate = { value: 0.00 };
            }
        }
        response = customerLocations.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function getTax(params) {

    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'get',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/Tax?$filter=TaxZoneID%20eq%20'${params.taxzoneid}'%20and%20ReportingGroup%20eq%20'1'`,
            headers: {
                'Cookie': cookie,
            }
        };

        let taxes = await axios(config);
        let totalTaxRate = 0.00;

        for (var i = 0; i < taxes.data.length; i++) {
            totalTaxRate += taxes.data[i]['TaxRate'].value;
        }

        response.detail = taxes.data;
        response.totalTaxRate = { value: totalTaxRate };
    } catch (e) {
        response = e;
    }
    return response;
}

async function createCustomerLocations(data) {

    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'put',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/CustomerLocation?$expand=LocationAdditionalInfo,LocationAddress,ShippingInstructions,ShippingTax`,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Cookie': cookie,
            },
            data: data,
        };

        console.log("config", config);

        const createCustomerLocations = await axios(config);
        console.log("createCustomerLocations", createCustomerLocations);
        response = createCustomerLocations;
    } catch (e) {
        response = e;
    }
    return response;
}

async function getQuotes(params) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'get',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/SalesOrder?$filter=CustomerID%20eq%20'${params.customerid}'%20and%20OrderType%20eq%20'QT'`,
            headers: {
                'Cookie': cookie,
            }
        };

        const quotes = await axios(config);
        response = quotes.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function getAllContacts() {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'get',
            url: 'https://rivafloors.acumatica.com/entity/Default/20.200.001/Contact',
            headers: {
                'Cookie': cookie,
            }
        };

        const getAllContacts = await axios(config);
        response = getAllContacts.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function getAllStockItems(params) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'get',
            url: 'https://rivafloors.acumatica.com/entity/Rivafloors/20.200.001/StockItem?$filter=Warehouse%20eq%20' + "'" + params.warehouse + "'",
            headers: {
                'Cookie': cookie,
            }
        };

        const getAllStockItems = await axios(config);
        response = getAllStockItems.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function createSalesOrder(data) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'put',
            url: 'https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/SalesOrder?$expand=Payments,Details,ShipToAddress,ShipToContact,ShippingSettings,Totals,TaxDetails,BillToContact,BillToAddress,Financial&$select=OrderTotal,ExternalRef,CurrencyID,CustomerID,Date,ShipVia,TaxTotal,OrderType,OrderNbr,Payments,Details,ShipToAddress,ShipToContact,ShippingSettings,Totals,TaxDetails,BillToContact,BillToAddress,Financial',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Cookie': cookie,
            },
            data: data,
        };

        const createSalesOrder = await axios(config);
        response = createSalesOrder;
    } catch (e) {
        response = e;
    }
    return response;
}

async function updateOrder(data) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'put',
            url: 'https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/SalesOrder?$expand=Details,Payments,ShippingSettings,ShipToAddress,ShipToContact',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Cookie': cookie,
            },
            data: data,
        };

        const updateOrder = await axios(config);
        response = updateOrder;
    } catch (e) {
        response = e;
    }
    return response;
}

async function createPayment(data) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'put',
            url: 'https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/Payment',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Cookie': cookie,
            },
            data: data,
        };

        const createPayment = await axios(config);
        response = createPayment;
    } catch (e) {
        response = e;
    }
    return response;
}

async function actionReleasePayment(data) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'post',
            url: 'https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/Payment/ReleasePayment',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Cookie': cookie,
            },
            data: data,
        };

        const actionReleasePayment = await axios(config);
        response = actionReleasePayment;
    } catch (e) {
        response = e;
    }
    return response;
}

async function actionReleaseFromHold(data) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'post',
            url: 'https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/SalesOrder/ReleaseFromHold',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Cookie': cookie,
            },
            data: data,
        };

        const actionReleaseFromHold = await axios(config);
        response = actionReleaseFromHold;
    } catch (e) {
        response = e;
    }
    return response;
}
async function actionCopyOrder(data) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'post',
            url: 'https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/SalesOrder/CopyOrder',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Cookie': cookie,
            },
            data: data,
        };

        const actionCopyOrder = await axios(config);
        response = actionCopyOrder;
    } catch (e) {
        response = e;
    }
    return response;
}


async function actionOnHoldSalesOrder(data, session) {
    let response = {};
    try {
        let login;
        let cookie;
        if (session == "" || session === undefined) {
            login = await loginAcumatica(credentials);
            cookie = login.companyid + "; " + login.userbranch + "; " + login.token + "; " + login.sessionid + "; " + login.locale;
        } else {
            cookie = session;
        }

        const config = {
            method: 'post',
            url: 'https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/SalesOrder/PutOnHold',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Cookie': cookie,
            },
            data: data,
        };

        response = await axios(config);
    } catch (e) {
        response = e;
    }
    return response;
}

async function getSalesOrder(orderNumber) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'get',
            url: 'https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/SalesOrder/SO/' + orderNumber + '?$expand=Payments,Details,ShipToAddress,ShipToContact,ShippingSettings,Totals,TaxDetails,BillToContact,BillToAddress,Financial',
            headers: {
                'Cookie': cookie,
            }
        };

        const getSalesOrder = await axios(config);
        let totalTaxRate = 0.00;
        for (var i = 0; i < getSalesOrder.data.TaxDetails.length; i++) {
            totalTaxRate += getSalesOrder.data.TaxDetails[i]['TaxRate'].value;
        }
        getSalesOrder.data.custom.totalTaxRate = { value: totalTaxRate };
        response = getSalesOrder.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function getQuote(quoteNumber) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'get',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/SalesOrder/QT/${quoteNumber}?$expand=Payments,Details,ShipToAddress,ShipToContact,ShippingSettings,Totals,TaxDetails`,
            headers: {
                'Cookie': cookie,
            }
        };

        const getQuote = await axios(config);
        let totalTaxRate = 0.00;
        for (var i = 0; i < getQuote.data.TaxDetails.length; i++) {
            totalTaxRate += getQuote.data.TaxDetails[i]['TaxRate'].value;
        }
        getQuote.data.custom.totalTaxRate = { value: totalTaxRate };
        response = getQuote.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function addFileToPayment(DocType, ReferenceNbr, PaymentRef, file) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();

        const contentType = file.ContentType.split('/');
        const timestamp = Date.now();

        var config = { 
            method: 'put',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/Payment/${DocType}/${ReferenceNbr}/files/${PaymentRef}_${timestamp}.${contentType[1]}`,
            headers: {
                'Accept': 'application/json',
                'Content-Type': file.contentType,
                'Cookie': cookie
            },
            data: file.content
        };

        const addFileToPayment = await axios(config);
        response = addFileToPayment.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function getPaymentMethods() {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'get',
            url: 'https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/PaymentMethod',
            headers: {
                'Cookie': cookie,
            }
        };

        const getPaymentMethods = await axios(config);
        response = getPaymentMethods.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function getShipments(params) {

    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'put',
            //url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/Shipments?$expand=ShipmentsDetails`,
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/RspShipments?$expand=RspShipmentsDetails`,
            headers: {
                'Cookie': cookie,
            },
            data: {
                CustomerID: { value: params.customerid }
            }
        };

        let rspshipments = await axios(config);
        let shipmentsDetails = rspshipments.data.RspShipmentsDetails;
        let shipments_format = [];

        async function PushShipmentDetail(i){

            let config = {
                method: 'get',
                url: 'https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/SalesOrder/SO/' + shipmentsDetails[i].OrderNbr.value + '?$select=CurrencyID',
                headers: {
                    'Cookie': cookie,
                }
            };
            
            let getSalesOrder = await axios(config);
            shipmentsDetails[i].CurrencyID = { value: '' }
            shipmentsDetails[i].CurrencyID.value = getSalesOrder.data.CurrencyID.value
            shipments_format.push(shipmentsDetails[i]);

        }

        for (var i = 0; i < shipmentsDetails.length; i++) {
            if (shipmentsDetails[i]['Type'].value == 'Shipment' && shipmentsDetails[i]['Status'].value == 'On Hold') {
                await PushShipmentDetail(i);
            } else if (shipmentsDetails[i]['Type'].value == 'Shipment' && shipmentsDetails[i]['Status'].value == 'Open') {
                await PushShipmentDetail(i);
            } else if (shipmentsDetails[i]['Type'].value == 'Shipment' && shipmentsDetails[i]['Status'].value == 'Confirmed') {
                await PushShipmentDetail(i);
            }
        }

        response = shipments_format

    } catch (e) {
        response = e;
    }
    return response;
}

async function getEta(params) {

    let response = {};
    try {
        var config = {
            method: 'get',
            url: `https://maps.googleapis.com/maps/api/directions/xml?origin=${params.origin}&destination=${params.destination}&key=${process.env.API_KEY_GOOGLE_MAPS}&units=imperial`,
        };

        let xml = await axios(config);
        xml2js.parseString(xml.data, (err, result) => {
            const xml_stringify = JSON.stringify(result, null, 4);
            const xml_parse = JSON.parse(xml_stringify);
            const distance = xml_parse.DirectionsResponse.route[0].leg[0].distance[0].value[0];
            const distance_miles = (distance / 1609.34);

            if (distance_miles <= 400) {
                response.days = 2 + 2;
            } else if (distance_miles > 400 && distance_miles <= 800) {
                response.days = 3 + 2;
            } else if (distance_miles > 800 && distance_miles <= 1400) {
                response.days = 4 + 2;
            } else if (distance_miles > 1400 && distance_miles <= 1800) {
                response.days = 5 + 2;
            } else if (distance_miles > 1800 && distance_miles <= 3200) {
                response.days = 7 + 2;
            } else {
                response.days = 8 + 2;
            }
        });
    } catch (e) {
        response = e;
    }
    return response;
}

async function getInventoryInquiry() {

    let response = {};
    try {
        // let select = 'RspRivafloorsInventoryInquiryDetails/DefaultPrice,';
        let select = 'RspRivafloorsInventoryInquiryDetails/Description,';
        select += 'RspRivafloorsInventoryInquiryDetails/Color,';
        select += 'RspRivafloorsInventoryInquiryDetails/Collection,';
        select += 'RspRivafloorsInventoryInquiryDetails/ProductLine,';
        select += 'RspRivafloorsInventoryInquiryDetails/Grade,';
        select += 'RspRivafloorsInventoryInquiryDetails/TotalThickness,';
        select += 'RspRivafloorsInventoryInquiryDetails/Width,';
        select += 'RspRivafloorsInventoryInquiryDetails/Length,';
        select += 'RspRivafloorsInventoryInquiryDetails/Tone,';
        select += 'RspRivafloorsInventoryInquiryDetails/AvailableLA,';
        select += 'RspRivafloorsInventoryInquiryDetails/AvailableMiami,';
        select += 'RspRivafloorsInventoryInquiryDetails/SquareFeetinBox,';
        select += 'RspRivafloorsInventoryInquiryDetails/InTransitMIA,';
        select += 'RspRivafloorsInventoryInquiryDetails/InTransitLA,';
        select += 'RspRivafloorsInventoryInquiryDetails/PRICEPROMO,';
        select += 'RspRivafloorsInventoryInquiryDetails/PRICETIER0,';
        select += 'RspRivafloorsInventoryInquiryDetails/PRICETIER1,';
        select += 'RspRivafloorsInventoryInquiryDetails/PRICETIER2,';
        select += 'RspRivafloorsInventoryInquiryDetails/PRICETIER3,';
        select += 'RspRivafloorsInventoryInquiryDetails/CustomDetails,';
        select += 'RspRivafloorsInventoryInquiryDetails/ItemStatus,';
        select += 'RspRivafloorsInventoryInquiryDetails/ItemClass,';
        select += 'RspRivafloorsInventoryInquiryDetails/InTransitJAX,';
        select += 'RspRivafloorsInventoryInquiryDetails/SqftJAX,';
        select += 'RspRivafloorsInventoryInquiryDetails/SqftMIA,';
        select += 'RspRivafloorsInventoryInquiryDetails/SqftLA,';
        select += 'RspRivafloorsInventoryInquiryDetails/BoxesJAX,';
        select += 'RspRivafloorsInventoryInquiryDetails/BoxesMIA,';
        select += 'RspRivafloorsInventoryInquiryDetails/BoxesLA,';
        select += 'RspRivafloorsInventoryInquiryDetails/Moldingtype';
        
        const { data: { RspRivafloorsInventoryInquiryDetails: rspRivafloorsInventoryInquiryDetails } } = await AcumaticaService.sendRequest('put', 'RspRivafloorsInventoryInquiry', '', '', '$expand=RspRivafloorsInventoryInquiryDetails', `$select=${select}`, {});

        let colors = ['Gray', 'Black', 'Crystal', 'Mercury', 'Sand', 'Pearl', 'Cigar', 'Amber', 'Krypton', 'Cotton', 'Smoke', 'Earth'];
        let collections = ['Riva Elite', 'Riva MAX', 'Riva Metro', 'Riva Tile', 'Quartz'];
        let grades = ['Select', 'Character'];

        const listInventoryInquiryFilter = [];
        
        rspRivafloorsInventoryInquiryDetails.map((item) => {
            colors.map((color) => {
                if (item.Color.value == color) {
                    collections.map((collection) => {
                        if (item.Collection.value == collection) {
                            grades.map((grade) => {
                                if (item.Grade.value == grade && item.ItemStatus.value == 'Active' && item.Length) {

                                    if(item.ItemClass.value === 'FLOORING' || item.ItemClass.value === 'MOLDINGS'){
                                        listInventoryInquiryFilter.push(item);
                                    }
                                }
                            });
                        }
                    });
                }
            });
        });

        console.log("listInventoryInquiryFilter", listInventoryInquiryFilter);
        response = listInventoryInquiryFilter;
    } catch (e) {
        response = e;
    }
    return response;
}

async function getInventoryInquiryGrouped(params) {
    console.log("param: ", params.color)
    let response = {};
    try {
        let select = 'RspRivafloorsInventoryInquiryDetails/ProductLine,';
        select += 'RspRivafloorsInventoryInquiryDetails/InventoryID,';
        select += 'RspRivafloorsInventoryInquiryDetails/Grade,';
        select += 'RspRivafloorsInventoryInquiryDetails/Color,';
        select += 'RspRivafloorsInventoryInquiryDetails/InTransitMIA,';
        select += 'RspRivafloorsInventoryInquiryDetails/Collection,';
        select += 'RspRivafloorsInventoryInquiryDetails/Length,';
        select += 'RspRivafloorsInventoryInquiryDetails/ItemClass,';
        select += 'RspRivafloorsInventoryInquiryDetails/BaseUOM,';
        select += 'RspRivafloorsInventoryInquiryDetails/SquareFeetinBox,';
        select += 'RspRivafloorsInventoryInquiryDetails/AvailableMiami,';
        select += 'RspRivafloorsInventoryInquiryDetails/AvailableLA,';
        select += 'RspRivafloorsInventoryInquiryDetails/InTransitMiami,';
        select += 'RspRivafloorsInventoryInquiryDetails/InTransitLA,';
        select += 'RspRivafloorsInventoryInquiryDetails/TopLayerThickness,';
        select += 'RspRivafloorsInventoryInquiryDetails/Description,';
        select += 'RspRivafloorsInventoryInquiryDetails/PriceTier1,';
        select += 'RspRivafloorsInventoryInquiryDetails/PriceTier2,';
        select += 'RspRivafloorsInventoryInquiryDetails/PriceTier3,';
        select += 'RspRivafloorsInventoryInquiryDetails/CustomDetails,';
        select += 'RspRivafloorsInventoryInquiryDetails/ItemStatus,';
        select += 'RspRivafloorsInventoryInquiryDetails/InTransitJAX,';
        select += 'RspRivafloorsInventoryInquiryDetails/SqftJAX,';
        select += 'RspRivafloorsInventoryInquiryDetails/SqftMIA,';
        select += 'RspRivafloorsInventoryInquiryDetails/SqftLA,';
        select += 'RspRivafloorsInventoryInquiryDetails/BoxesJAX,';
        select += 'RspRivafloorsInventoryInquiryDetails/BoxesMIA,';
        select += 'RspRivafloorsInventoryInquiryDetails/BoxesLA,';
        select += 'RspRivafloorsInventoryInquiryDetails/Moldingtype';

        const { data: { RspRivafloorsInventoryInquiryDetails: rspRivafloorsInventoryInquiryDetails } } = await AcumaticaService.sendRequest('put', 'RspRivafloorsInventoryInquiry', '', '', '$expand=RspRivafloorsInventoryInquiryDetails', `$select=${select}`, {});
        //let listInventoryInquiryDetails = listInventoryInquiry.data.RspRivafloorsInventoryInquiryDetails;
        console.log("listado de inventario", rspRivafloorsInventoryInquiryDetails.length)
        let Collections = ['Riva Elite', 'Riva MAX', 'Riva Metro', 'Riva Tile', 'Quartz'];
        let Grades = ['Select', 'Character'];
        let c = [];
        let g = [];
        let p = [];

        let listInventoryInquiryFilter = [];
        let cont=0;
        let cant=0;
        Collections.map((collection, x) => {
            Grades.map((grade, y) => {
                for (var i = 0; i < rspRivafloorsInventoryInquiryDetails.length; i++) {
                    if(rspRivafloorsInventoryInquiryDetails[i]['ItemStatus'].value == 'Active'){
                        if (rspRivafloorsInventoryInquiryDetails[i]['ItemClass'].value == 'FLOORING' ) {
                            //console.log("entro flooring ", rspRivafloorsInventoryInquiryDetails[i]['ItemClass'].value)
                            if (rspRivafloorsInventoryInquiryDetails[i]['Color'].value == params.color) {
                                //console.log("entro a color", rspRivafloorsInventoryInquiryDetails[i]['Color'].value)
                                //console.log("entro a collection", rspRivafloorsInventoryInquiryDetails[i]['Collection'].value)
                                //console.log("entro a grade", rspRivafloorsInventoryInquiryDetails[i]['Grade'].value)
                                //console.log(collection, grade);
                                if (collection == rspRivafloorsInventoryInquiryDetails[i]['Collection'].value) {
    
                                    if (grade == rspRivafloorsInventoryInquiryDetails[i]['Grade'].value) {
                                        p.push(rspRivafloorsInventoryInquiryDetails[i]);
                                        console.log("color, collection y grade: ", rspRivafloorsInventoryInquiryDetails[i]['Color'].value," ",rspRivafloorsInventoryInquiryDetails[i]['Collection'].value," ",rspRivafloorsInventoryInquiryDetails[i]['Grade'].value)
                                        console.log(i+1," ",rspRivafloorsInventoryInquiryDetails.length)
                                    }
                                }
                            }
    
                            //--aca hiba
                            cont ++;
                        }
                        if ((i+1) == rspRivafloorsInventoryInquiryDetails.length) {
                            g.push({ Name: grade, Products: p });
                            p = [];
    
                            if ((y+1) == 2) {
                                c.push({ Name: collection, Grade: g });
                                g = [];
                                console.log("entro al 2 if length")
                            }
                            console.log("entro al if length")
                        }
                        cant ++;
                    }
                }
                console.log("cont flooring: ", cont);
                console.log("total: ", cant);
                cont = 0;
                cant = 0;
            });

            if ((x + 1) == 3) {
                console.log("parte final");
                listInventoryInquiryFilter = {
                    Collections: c,
                };
                response = listInventoryInquiryFilter;
            }
        });
        
    } catch (e) {
        response = e;
    }
    return response;
}

async function getMoldings(params) {

    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'put',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/RspRivafloorsInventoryInquiry?$expand=RspRivafloorsInventoryInquiryDetails`,
            headers: {
                'Cookie': cookie,
            },
            data: {}
        };
        
        let listMoldings = await axios(config);
        
        let listMoldingsFilter = [];
        
        for (var i = 0; i < listMoldings.data.RspRivafloorsInventoryInquiryDetails.length; i++) {
            if (listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]['ItemClass'].value == 'MOLDINGS' &&
                listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]['Color'].value == params.color) {

                if (listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]['Moldingtype'].value == 'Threshold') {
                    listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]['custom'].ImageUrl = { value: 'https://rspgallery-dev.s3.amazonaws.com/moldings/Threshold.jpg' };
                } else if (listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]['Moldingtype'].value == 'Reducer') {
                    listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]['custom'].ImageUrl = { value: 'https://rspgallery-dev.s3.amazonaws.com/moldings/Reducer.jpg' };
                } else if (listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]['Moldingtype'].value == 'T-mold') {
                    listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]['custom'].ImageUrl = { value: 'https://rspgallery-dev.s3.amazonaws.com/moldings/T-mold.jpg' };
                } else if (listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]['Moldingtype'].value == 'Squarenose') {
                    listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]['custom'].ImageUrl = { value: 'https://rspgallery-dev.s3.amazonaws.com/moldings/Squarenose.jpg' };
                } else if (listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]['Moldingtype'].value == 'Bullnose') {
                    listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]['custom'].ImageUrl = { value: 'https://rspgallery-dev.s3.amazonaws.com/moldings/Bullnose.jpg' };
                }

                if(listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]['ItemStatus'].value == 'Active'){
                    listMoldingsFilter.push(listMoldings.data.RspRivafloorsInventoryInquiryDetails[i]);
                }

            }
        }

        response = listMoldingsFilter;

    } catch (e) {
        response = e;
    }
    return response;
}

async function getInvoices(params) {

    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'get',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/SalesInvoice?$filter=CustomerID%20eq%20'${params.customerid}'%20and%20Type%20eq%20'Invoice'&&$expand=Details`,
            headers: {
                'Cookie': cookie,
            }
        };

        let getInvoices = await axios(config);
        console.log("getInvoices", getInvoices);
        let getInvoicesFilter = [];

        for (var i = 0; i < getInvoices.data.length; i++) {
            if (getInvoices.data[i]['Status'].value == 'Closed' || getInvoices.data[i]['Status'].value == 'Open') {
                getInvoicesFilter.push(getInvoices.data[i]);
            }
        }
        response = getInvoicesFilter;

    } catch (e) {
        response = e;
    }
    return response;
}

async function getInvoice(referenceNbr) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'get',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/SalesInvoice/Invoice/${referenceNbr}?$expand=Details,BillToContact,BillToAddress,ShipToContact,ShipToAddress`,
            headers: {
                'Cookie': cookie,
            }
        };

        const getInvoice = await axios(config);
        response = getInvoice.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function getCountries() {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'get',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/State`,
            headers: {
                'Cookie': cookie,
            }
        };

        const getCountries = await axios(config);
        response = getCountries.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function getStates(params) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'get',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/State?$expand=Details&&$filter=CountryID%20eq%20'${params.countryid}'`,
            headers: {
                'Cookie': cookie,
            }
        };

        const getStates = await axios(config);
        response = getStates.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function getTaxZones(params) {
    let response = {};
    try {
        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'get',
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/TaxZone?$filter=substringof('${params.state}', Description)&select=totalTaxRate`,
            headers: {
                'Cookie': cookie,
            }
        };

        const getTaxZones = await axios(config);
        response = getTaxZones.data;
    } catch (e) {
        response = e;
    }
    return response;
}

async function createJournalTransaction(Description, ReferenceNbr, Amount) {
    let response = {};
    try {
        const data = {
            "Module": { "value": "GL" },
            "LedgerID": { "value": "ACTUAL" },
            "Description": { "value": Description },
            "Details": [
                {
                    "Account": { "value": "10100" },
                    "ReferenceNbr": { "value": ReferenceNbr },
                    "DebitAmount": { "value": Amount }
                },
                {
                    "Account": { "value": "81010" },
                    "ReferenceNbr": { "value": ReferenceNbr },
                    "CreditAmount": { "value": Amount }
                }
            ]
        };

        const cookie = await validateAcumaticaSession();
        var config = {
            method: 'put',
            url: 'https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/JournalTransaction',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Cookie': cookie,
            },
            data: data,
        };

        const createJournalTransaction = await axios(config);
        response = createJournalTransaction;
    } catch (e) {
        response = e;
    }
    return response;
}
async function updateRewardsLevelInAcumatica() {
    const RSP_REWARDS_LEVEL = "RSP_REWARDS_LEVEL";
    const RSP_REWARDS_CLIENT = "RSP_REWARDS_CLIENT";

    const getClientsPendingUpdateClass = await BaseDAO.getAll(process.env.RSP_REWARDS_CLIENT, 'moved_up_class=1');
    console.log("getClientsPendingUpdateClass", getClientsPendingUpdateClass);

    getClientsPendingUpdateClass.map(async (customer) => {
        const getLevelRewards = await BaseDAO.get(RSP_REWARDS_LEVEL, `id_level='${customer.id_level}'`);

        if (getLevelRewards != "") {
            console.log("getLevelRewards");
            const body_update_customer = {
                CustomerID: { value: customer.id_customer },
                Attributes: [
                    {
                        Attribute: { value: "Customer Status" },
                        Value: { value: getLevelRewards.name }
                    }
                ]
            };
            const updateCustomerResult = await updateCustomer(body_update_customer);
            console.log("updateCustomerResult", updateCustomerResult);
            if (updateCustomerResult.status == 200) {
                await BaseDAO.update(RSP_REWARDS_CLIENT, { moved_up_class: 0 }, `id_client=${customer.id_client}`);
                console.log("ok");
            }
        }
    });
}

module.exports = {
    loginAcumatica,
    logoutAcumatica,
    createSalesOrder,
    updateOrder,
    getSalesOrder,
    updateCustomer,
    getCustomer,
    getCustomers,
    addFileToCustomer,
    addFileToContactCustomer,
    createCustomerLocations,
    getCustomerLocations,
    createContact,
    getSalesPerson,
    getAllContacts,
    getAllStockItems,
    getPaymentMethods,
    createPayment,
    addFileToPayment,
    getEta,
    getInventoryInquiry,
    getInventoryInquiryGrouped,
    getMoldings,
    getInvoice,
    getInvoices,
    actionReleasePayment,
    actionReleaseFromHold,
    actionOnHoldSalesOrder,
    actionCopyOrder,
    getCountries,
    getStates,
    getTaxZones,
    getTax,
    getFreightPrice,
    createJournalTransaction,
    updateRewardsLevelInAcumatica,
    getShipments,
    getQuote,
    getQuotes,
}