function format2DecimalExact(number) {
    let number_format = number.toString().match(/^-?\d+(?:\.\d{0,2})?/)[0];
    return parseFloat(number_format);
}

module.exports = {
    format2DecimalExact,
    returnYearsMonths,
}