const get = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET",
    "Content-Type": "application/json"
};

const post = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST",
    "Content-Type": "application/json"
};

const response = (statusCode, method = 'get', message, data, error) => {
    const params = {
        statusCode: statusCode,
        headers: method == 'get' ? get : post,
        body: JSON.stringify({
            message: message,
            data: data || '',
            error: error || ''
        })
    };
    console.log('params: ', params);
    return params;
}

module.exports = {
    response,
}