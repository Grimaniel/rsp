const AcumaticaService = require('../../Infraestructure/Http/AcumaticaService');
const SalesOrderDAO = require('../DAO/SalesOrderDAO');
const Util = require('../Util/Util');

class DashboardService {
    static async getCustomerDashboardSummary(query) {
        try {
            const { data: salesOrders } = await AcumaticaService.sendRequest('get', 'SalesOrder', '', `$filter=CustomerID%20eq%20'${query.customerid}'`, '', '$select=Description,OrderType,OrderTotal,Status');

            const { data: { RspShipmentsDetails: shipmentsDetails } } = await AcumaticaService.sendRequest('put', 'RspShipments', '', '', '$expand=RspShipmentsDetails', '', {
                CustomerID: { value: query.customerid }
            });

            const { data: salesInvoices } = await AcumaticaService.sendRequest('get', 'SalesInvoice', '', `$filter=CustomerID%20eq%20'${query.customerid}'%20and%20Type%20eq%20'Invoice'`, '', '$select=Type,Status,Amount');

            const { data: { RspPaymentsPendingDetails: paymentsPendingDetails } } = await AcumaticaService.sendRequest('put', 'RspPaymentsPending', '', '', '$expand=RspPaymentsPendingDetails', '', {
                CustomerID: { value: query.customerid }
            });

            const { data: { RspCxcInvoicesPendingDetails: invoicesPendingDetails } } = await AcumaticaService.sendRequest('put', 'RspCxcInvoicesPending', '', '', '$expand=RspCxcInvoicesPendingDetails', '', {
                CustomerID: { value: query.customerid }
            });

            const { data: { RspSalesColorSizeDetails: rspSalesColorSizeDetails } } = await AcumaticaService.sendRequest('put', 'RspSalesColorSize', '', '', '$expand=RspSalesColorSizeDetails', '', {
                CustomerID: { value: query.customerid }
            });

            const { data: getCustomer } = await AcumaticaService.sendRequest('get', 'Customer', query.customerid, '', '', '$select=CreditLimit,RemainingCreditLimit');

            const { data: { RspDepositsDetails: depositsDetails } } = await AcumaticaService.sendRequest('put', 'RspDeposits', '', '', '$expand=RspDepositsDetails', '', {
                CustomerID: { value: query.customerid }
            });

            const years_months = Util.returnYearsMonths();
            console.log('years_months: ', years_months);
            const currentDate = new Date().toISOString();
            const getTotalSalesOrdersOnTemporaryHold = await SalesOrderDAO.getTotalSalesOrdersOnTemporaryHold(query.customerid);
            const getSumSalesOrderHoldUp = await SalesOrderDAO.getSumSalesOrderHoldUp(query.customerid);

            let totalAmountUnconfirmedSalesOrders = 0.00;
            let numberUnconfirmedSalesOrders = 0;
            let totalAmountPendingPaymentSalesOrders = 0.00;
            let numberPendingPaymentSalesOrders = 0;
            let totalAmountConfirmedSalesOrders = 0.00;
            let numberConfirmedSalesOrders = 0;
            let totalAmountShipments = 0.00;
            let numberShipments = 0;
            let totalAmountInvoices = 0.00;
            let numberInvoices = 0;
            let totalPaymentsPending = 0.00;
            let totalInvoicesPendingDue = 0.00;
            let totalInvoicesPending = 0.00;
            let totalDeposits = 0.00;
            let gradingPurchases = [];
            let colorDistribution = { details: [], totals: {} };
            let collectionDistribution = { details: [], totals: {} };
            let creditLine = {};
            let colors = [{ color: 'Pearl', hexa: '#CAC6B0' }, { color: 'Cotton', hexa: '#BAB7AD' }, { color: 'Mercury', hexa: '#9D8B69' },
            { color: 'Earth', hexa: '#948470' }, { color: 'Smoke', hexa: '#A8825D' }, { color: 'Crystal', hexa: '#C3A06E' },
            { color: 'Amber', hexa: '#996E44' }, { color: 'Krypton', hexa: '#996E41' }, { color: 'Sand', hexa: '#958C75' },
            { color: 'Gray', hexa: '#5D523E' }, { color: 'Cigar', hexa: '#472A15' }, { color: 'Black', hexa: '#101011' },
            { color: 'Custom', hexa: '#A26363' }, { color: 'Unfinished', hexa: '#50978F' }];
            let collections = [{ collection: 'Riva Elite', hexa: '#8A1538' }, { collection: 'Riva Max', hexa: '#284734' },
            { collection: 'Riva Metro', hexa: '#626569' }, { collection: 'Riva Tile', hexa: '#003865' }, { collection: 'Quartz', hexa: '#EAAA00' },
            { collection: 'Custom', hexa: '#A26363' }, { collection: 'Unfinished', hexa: '#50978F' }];

            for (var i = 0; i < salesOrders.length; i++) {
                if (salesOrders[i]['Description'].value != 'On Temporary Hold') {
                    if (salesOrders[i]['OrderType'].value == 'QT' && salesOrders[i]['Status'].value == 'On Hold') {
                        totalAmountUnconfirmedSalesOrders += salesOrders[i]['OrderTotal'].value;
                        numberUnconfirmedSalesOrders++;
                    } else if (salesOrders[i]['OrderType'].value == 'QT' && salesOrders[i]['Status'].value == 'Open') {
                        totalAmountUnconfirmedSalesOrders += salesOrders[i]['OrderTotal'].value;
                        numberUnconfirmedSalesOrders++;
                    } else if (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'On Hold') {
                        totalAmountUnconfirmedSalesOrders += salesOrders[i]['OrderTotal'].value;
                        numberUnconfirmedSalesOrders++;
                    } else if (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'Credit Hold') {
                        totalAmountPendingPaymentSalesOrders += salesOrders[i]['OrderTotal'].value;
                        numberPendingPaymentSalesOrders++;
                    } else if (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'Open') {
                        totalAmountConfirmedSalesOrders += salesOrders[i]['OrderTotal'].value;
                        numberConfirmedSalesOrders++;
                    }
                }
            }

            for (var i = 0; i < shipmentsDetails.length; i++) {
                if (shipmentsDetails[i]['Type'].value == 'Shipment' && shipmentsDetails[i]['Status'].value == 'On Hold') {
                    totalAmountShipments += shipmentsDetails[i]['LineTotal'].value;
                    numberShipments++;
                } else if (shipmentsDetails[i]['Type'].value == 'Shipment' && shipmentsDetails[i]['Status'].value == 'Open') {
                    totalAmountShipments += shipmentsDetails[i]['LineTotal'].value;
                    numberShipments++;
                } else if (shipmentsDetails[i]['Type'].value == 'Shipment' && shipmentsDetails[i]['Status'].value == 'Confirmed') {
                    totalAmountShipments += shipmentsDetails[i]['LineTotal'].value;
                    numberShipments++;
                }
            }

            for (var i = 0; i < salesInvoices.length; i++) {
                if (salesInvoices[i]['Type'].value == 'Invoice' && salesInvoices[i]['Status'].value == 'Closed') {
                    totalAmountInvoices += salesInvoices[i]['Amount'].value;
                    numberInvoices++;
                } else if (salesInvoices[i]['Type'].value == 'Invoice' && salesInvoices[i]['Status'].value == 'Open') {
                    totalAmountInvoices += salesInvoices[i]['Amount'].value;
                    numberInvoices++;
                }
            }

            for (var i = 0; i < paymentsPendingDetails.length; i++) {
                totalPaymentsPending += paymentsPendingDetails[i]['Balance'].value;
            }

            for (var i = 0; i < depositsDetails.length; i++) {
                totalDeposits += depositsDetails[i]['OrderTotal'].value;
            }

            for (var i = 0; i < invoicesPendingDetails.length; i++) {
                totalInvoicesPending += invoicesPendingDetails[i]['Balance'].value;
                if (invoicesPendingDetails[i]['DueDate'].value.substr(0, 10) < currentDate.substr(0, 10)) {
                    totalInvoicesPendingDue += invoicesPendingDetails[i]['Balance'].value;
                }
            }

            for (var i = 0; i < years_months.length; i++) {
                let year_month_format = years_months[i].split('-');
                let year = year_month_format[0];
                let month = year_month_format[1];
                let totalCharacter = 0.00;
                let numberCharacter = 0;
                let totalSelect = 0.00;
                let numberSelect = 0;
                for (var j = 0; j < rspSalesColorSizeDetails.length; j++) {
                    let itemClass = rspSalesColorSizeDetails[j]['ItemClass'].value;
                    let collection = rspSalesColorSizeDetails[j]['Collection'].value;
                    let grade = rspSalesColorSizeDetails[j]['Grade'].value;
                    let createdOn = rspSalesColorSizeDetails[j]['CreatedOn'].value.substr(0, 10).split('-');
                    let yearC = createdOn[0];
                    let monthC = createdOn[1];

                    if (itemClass == 'Flooring') {
                        if (collection == 'Riva Elite' || collection == 'Riva Max' || collection == 'Riva Metro' || collection == 'Riva Tile'
                            || collection == 'Quartz' || collection == 'Custom' || collection == 'Unfinished') {
                            if (year == yearC && month == monthC) {
                                if (grade == 'Character') {
                                    numberCharacter += rspSalesColorSizeDetails[j]['RequestedQuantity'].value;
                                    totalCharacter += rspSalesColorSizeDetails[j]['Amount'].value;
                                } else if (grade == 'Select') {
                                    numberSelect += rspSalesColorSizeDetails[j]['RequestedQuantity'].value;
                                    totalSelect += rspSalesColorSizeDetails[j]['Amount'].value;
                                }
                            }
                        }
                    }
                }
                gradingPurchases.push({ year: year, month: month, numberCharacter: numberCharacter, totalCharacter: totalCharacter, numberSelect, totalSelect });
            }

            let total_m3 = 0;
            let total_m6 = 0;
            let total_m12 = 0;
            for (var i = 0; i < colors.length; i++) {
                let quantity_m3 = 0;
                let quantity_m6 = 0;
                let quantity_m12 = 0;
                for (var j = 0; j < years_months.length; j++) {
                    let year_month_format = years_months[j].split('-');
                    let year = year_month_format[0];
                    let month = year_month_format[1];
                    for (var k = 0; k < rspSalesColorSizeDetails.length; k++) {
                        let color = rspSalesColorSizeDetails[k]['Color'].value;
                        let collection = rspSalesColorSizeDetails[k]['Collection'].value;
                        let createdOn = rspSalesColorSizeDetails[k]['CreatedOn'].value.substr(0, 10).split('-');
                        let yearC = createdOn[0];
                        let monthC = createdOn[1];

                        if (collection == 'Custom') {
                            color = collection;
                        }

                        if (colors[i].color == color) {
                            if (year == yearC && month == monthC) {
                                if (j >= 0 && j <= 2) {
                                    quantity_m3 += rspSalesColorSizeDetails[k]['RequestedQuantity'].value;
                                    total_m3 += rspSalesColorSizeDetails[k]['RequestedQuantity'].value;
                                }
                                if (j >= 0 && j <= 5) {
                                    quantity_m6 += rspSalesColorSizeDetails[k]['RequestedQuantity'].value;
                                    total_m6 += rspSalesColorSizeDetails[k]['RequestedQuantity'].value;
                                }
                                if (j >= 0 && j <= 11) {
                                    quantity_m12 += rspSalesColorSizeDetails[k]['RequestedQuantity'].value;
                                    total_m12 += rspSalesColorSizeDetails[k]['RequestedQuantity'].value;
                                }
                            }
                        }
                    }
                }
                colorDistribution.details.push({ color: colors[i].color, hexa: colors[i].hexa, quantity: { "m3": quantity_m3, "m6": quantity_m6, "m12": quantity_m12 } });
            }
            colorDistribution.totals = { "m3": total_m3, "m6": total_m6, "m12": total_m12 };

            for (var i = 0; i < colorDistribution.details.length; i++) {
                colorDistribution.details[i].percentages = {
                    "3m": (colorDistribution.details[i].quantity.m3 * 100) / colorDistribution.totals.m3,
                    "6m": (colorDistribution.details[i].quantity.m6 * 100) / colorDistribution.totals.m6,
                    "12m": (colorDistribution.details[i].quantity.m12 * 100) / colorDistribution.totals.m12,
                };
            }

            let total_collection_m3 = 0;
            let total_collection_m6 = 0;
            let total_collection_m12 = 0;
            for (var i = 0; i < collections.length; i++) {
                let quantity_collection_m3 = 0;
                let quantity_collection_m6 = 0;
                let quantity_collection_m12 = 0;
                for (var j = 0; j < years_months.length; j++) {
                    let year_month_format = years_months[j].split('-');
                    let year = year_month_format[0];
                    let month = year_month_format[1];
                    for (var k = 0; k < rspSalesColorSizeDetails.length; k++) {
                        let collection = rspSalesColorSizeDetails[k]['Collection'].value;
                        let createdOn = rspSalesColorSizeDetails[k]['CreatedOn'].value.substr(0, 10).split('-');
                        let yearC = createdOn[0];
                        let monthC = createdOn[1];

                        if (collections[i].collection == collection) {
                            if (year == yearC && month == monthC) {
                                if (j >= 0 && j <= 2) {
                                    quantity_collection_m3 += rspSalesColorSizeDetails[k]['RequestedQuantity'].value;
                                    total_collection_m3 += rspSalesColorSizeDetails[k]['RequestedQuantity'].value;
                                }
                                if (j >= 0 && j <= 5) {
                                    quantity_collection_m6 += rspSalesColorSizeDetails[k]['RequestedQuantity'].value;
                                    total_collection_m6 += rspSalesColorSizeDetails[k]['RequestedQuantity'].value;
                                }
                                if (j >= 0 && j <= 11) {
                                    quantity_collection_m12 += rspSalesColorSizeDetails[k]['RequestedQuantity'].value;
                                    total_collection_m12 += rspSalesColorSizeDetails[k]['RequestedQuantity'].value;
                                }
                            }
                        }
                    }
                }
                collectionDistribution.details.push({ collection: collections[i].collection, hexa: collections[i].hexa, quantity: { "m3": quantity_collection_m3, "m6": quantity_collection_m6, "m12": quantity_collection_m12 } });
            }
            collectionDistribution.totals = { "m3": total_collection_m3, "m6": total_collection_m6, "m12": total_collection_m12 };

            for (var i = 0; i < collectionDistribution.details.length; i++) {
                collectionDistribution.details[i].percentages = {
                    "3m": (collectionDistribution.details[i].quantity.m3 * 100) / collectionDistribution.totals.m3,
                    "6m": (collectionDistribution.details[i].quantity.m6 * 100) / collectionDistribution.totals.m6,
                    "12m": (collectionDistribution.details[i].quantity.m12 * 100) / collectionDistribution.totals.m12,
                };
            }

            let sumSalesOrderHoldUp = getSumSalesOrderHoldUp === undefined ? 0.00 : getSumSalesOrderHoldUp.sum_sales_order_hold_up;
            let totalLine = getCustomer.CreditLimit.value - sumSalesOrderHoldUp;
            creditLine = {
                totalLine: totalLine,
                available: getCustomer.RemainingCreditLimit.value,
                consumed: totalLine - getCustomer.RemainingCreditLimit.value,
            };

            return {
                totalAmountUnconfirmedSalesOrders: totalAmountUnconfirmedSalesOrders,
                numberUnconfirmedSalesOrders: numberUnconfirmedSalesOrders,
                totalAmountPendingPaymentSalesOrders: totalAmountPendingPaymentSalesOrders,
                numberPendingPaymentSalesOrders: numberPendingPaymentSalesOrders,
                totalAmountConfirmedSalesOrders: totalAmountConfirmedSalesOrders,
                numberConfirmedSalesOrders: numberConfirmedSalesOrders,
                totalSalesOrdersOnTemporaryHold: getTotalSalesOrdersOnTemporaryHold.total,
                numberSalesOrdersOnTemporaryHold: getTotalSalesOrdersOnTemporaryHold.number,
                totalAmountShipments: totalAmountShipments,
                numberShipments: numberShipments,
                totalAmountInvoices: totalAmountInvoices,
                numberInvoices: numberInvoices,
                totalPaymentsPending: totalPaymentsPending,
                totalDeposits: totalDeposits,
                totalInvoicesPendingDue: totalInvoicesPendingDue,
                totalInvoicesPending: totalInvoicesPending,
                gradingPurchases: gradingPurchases,
                colorDistribution: colorDistribution,
                collectionDistribution: collectionDistribution,
                creditLine: creditLine,
            };
        } catch (error) {
            console.error(`Error en ${this.name}.getCustomerDashboardSummary`, error);
            throw error;
        }
    }

    static async getSalesPersonDashboardSummary(query) {
        try {
            const { data: { RspSalesRepDetails: rspSalesRepDetails } } = await AcumaticaService.sendRequest('put', 'RspSalesRep', '', '', '$expand=RspSalesRepDetails', '', {
                SalesPersonID: { value: query.salespersonid }
            });
            const { data: salesOrders } = await AcumaticaService.sendRequest('get', 'SalesOrder', '', `$filter=SalesPersonID%20eq%20'${query.salespersonid}'`, '', '$select=OrderType,Status,OrderTotal,Description');

            const [date] = new Date().toLocaleString('sv-SE', { timeZone: 'US/Central' }).split(' ');
            const [year, month] = date.split('-');

            let totalSalesCurrentMonth = 0;
            let totalSalesCurrentYear = 0;
            for (var i = 0; i < rspSalesRepDetails.length; i++) {
                let [yearC, monthC] = rspSalesRepDetails[i]['CreatedOn'].value.substr(0, 10).split('-');

                if (year == yearC) {
                    if (month == monthC) {
                        totalSalesCurrentMonth += rspSalesRepDetails[i]['Amount'].value;
                    }
                    totalSalesCurrentYear += rspSalesRepDetails[i]['Amount'].value;
                }
            }

            let totalAmountUnconfirmedSalesOrders = 0;
            let numberUnconfirmedSalesOrders = 0;
            let totalAmountPendingPaymentSalesOrders = 0;
            let numberPendingPaymentSalesOrders = 0;
            let totalAmountConfirmedSalesOrders = 0;
            let numberConfirmedSalesOrders = 0;
            let totalAmountShipments = 0.00;
            let numberShipments = 0;

            for (var i = 0; i < salesOrders.length; i++) {
                if (salesOrders[i]['Description'].value != 'On Temporary Hold') {
                    if (salesOrders[i]['OrderType'].value == 'QT' && salesOrders[i]['Status'].value == 'On Hold') {
                        totalAmountUnconfirmedSalesOrders += salesOrders[i]['OrderTotal'].value;
                        numberUnconfirmedSalesOrders++;
                    } else if (salesOrders[i]['OrderType'].value == 'QT' && salesOrders[i]['Status'].value == 'Open') {
                        totalAmountUnconfirmedSalesOrders += salesOrders[i]['OrderTotal'].value;
                        numberUnconfirmedSalesOrders++;
                    } else if (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'On Hold') {
                        totalAmountUnconfirmedSalesOrders += salesOrders[i]['OrderTotal'].value;
                        numberUnconfirmedSalesOrders++;
                    } else if (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'Credit Hold') {
                        totalAmountPendingPaymentSalesOrders += salesOrders[i]['OrderTotal'].value;
                        numberPendingPaymentSalesOrders++;
                    } else if (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'Open') {
                        totalAmountConfirmedSalesOrders += salesOrders[i]['OrderTotal'].value;
                        numberConfirmedSalesOrders++;
                    } else if (salesOrders[i]['OrderType'].value == 'SO' && salesOrders[i]['Status'].value == 'Shipping') {
                        totalAmountShipments += salesOrders[i]['OrderTotal'].value;
                        numberShipments++;
                    }
                }
            }

            return {
                totalSalesCurrentMonth,
                totalSalesCurrentYear,
                totalAmountUnconfirmedSalesOrders,
                numberUnconfirmedSalesOrders,
                totalAmountPendingPaymentSalesOrders,
                numberPendingPaymentSalesOrders,
                totalAmountConfirmedSalesOrders,
                numberConfirmedSalesOrders,
                totalAmountShipments,
                numberShipments
            }
        } catch (error) {
            console.error(`Error en ${this.name}.getSalesPersonDashboardSummary`, error);
            throw error;
        }
    }
}

module.exports = DashboardService;