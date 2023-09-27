let i=3;
let x=[];
x=["juan","maria","pedro","arturo"];
let val="";
if ((i+1) == x.length){
    val="true"
}
else{
    val="false"
}
const hours = {
    0 : 0,
    1 : 24,
    2 : 48,
    3 : 72
  }
  console.log(hours['0']);
//console.log(x.length,i+1)
//console.log(val)

let select = 'RspRivafloorsInventoryInquiryDetails/DefaultPrice,';
        select += 'RspRivafloorsInventoryInquiryDetails/Description,';
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
        select += 'RspRivafloorsInventoryInquiryDetails/InTransitMiami,';
        select += 'RspRivafloorsInventoryInquiryDetails/InTransitLA,';
        select += 'RspRivafloorsInventoryInquiryDetails/PRICETIER1,';
        select += 'RspRivafloorsInventoryInquiryDetails/PRICETIER2,';
        select += 'RspRivafloorsInventoryInquiryDetails/PRICETIER3';

        console.log(select)

        const paramsInvoice = 
                    {
                        CustomerID: { value: "CustomerID" },
                        Description: { value: "Description" },
                        Details: [{ 
                            InventoryID: { value: "CCFEE" },
                            TransactionDescr: { value: "Wiretransfer Fee" },
                                Quantity: { value: 1 },
                                UnitPrice: { value: "comissionCC" },
                                Account: { value: "48100" },
                                Subaccount: { value: "01" }
                            }],
                        Hold: { value: true },
                        CustomerOrder: { value: "CustomerOrder" }
                    };
        console.log(paramsInvoice)