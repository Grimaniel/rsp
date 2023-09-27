class Util {
    static getFreightPrice(ShippingTerms) {
        let freightPrice;

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

    static isObjEmpty(obj) {
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) return false;
        }
    
        return true;
    }

    static returnYearsMonths() {
        let data = [];
        let currentDate = new Date().toISOString();
        let currentDateFormat = currentDate.substr(0, 10);
        let currentDate2 = new Date(currentDateFormat);
    
        for (var i = 0; i < 12; i++) {
            currentDate2.setMonth(currentDate2.getMonth() - 1, 1);
            data.push(currentDate2.toISOString().substr(0, 10));
        }    
        return data;
    }

    static dosDecimales(n) {
        let t=n.toString();
        let regex=/(\d*.\d{0,2})/;
        return t.match(regex)[0];
      }
}

module.exports = Util;